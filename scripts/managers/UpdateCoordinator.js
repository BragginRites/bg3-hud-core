/**
 * Update Coordinator
 * Handles Foundry hooks and coordinates targeted updates
 * Monitors single hudState flag for simplified state management
 * Multi-user sync: updateActor hook triggers _reconcileWithServerState for remote clients
 */
import { BG3HUD_REGISTRY } from '../utils/registry.js';
import { ControlsManager } from './ControlsManager.js';

export class UpdateCoordinator {
    constructor(options = {}) {
        this.hotbarApp = options.hotbarApp;
        this.persistenceManager = options.persistenceManager;
        this.moduleId = 'bg3-hud-core';
        this.flagName = 'hudState';
    }

    /**
     * Register all Foundry hooks.
     * Stores hook IDs for proper cleanup via unregisterHooks().
     */
    registerHooks() {
        if (this._hookIds) {
            console.warn('[bg3-hud-core] UpdateCoordinator hooks already registered, skipping');
            return;
        }

        this._hookIds = new Map();

        this._hookIds.set('controlToken', Hooks.on('controlToken', this._onControlToken.bind(this)));
        this._hookIds.set('updateToken', Hooks.on('updateToken', this._onUpdateToken.bind(this)));
        this._hookIds.set('updateActor', Hooks.on('updateActor', this._onUpdateActor.bind(this)));
        this._hookIds.set('updateCombat', Hooks.on('updateCombat', this._onUpdateCombat.bind(this)));
        this._hookIds.set('combatStart', Hooks.on('combatStart', this._onCombatStateChange.bind(this)));
        this._hookIds.set('combatRound', Hooks.on('combatRound', this._onCombatStateChange.bind(this)));
        this._hookIds.set('combatTurn', Hooks.on('combatTurn', this._onCombatStateChange.bind(this)));
        this._hookIds.set('deleteCombat', Hooks.on('deleteCombat', this._onCombatStateChange.bind(this)));

        // Canvas ready hook - check for pre-selected tokens on page load
        this._hookIds.set('canvasReady', Hooks.on('canvasReady', this._onCanvasReady.bind(this)));

        // Active effects hooks
        this._hookIds.set('createActiveEffect', Hooks.on('createActiveEffect', this._onActiveEffectChange.bind(this)));
        this._hookIds.set('updateActiveEffect', Hooks.on('updateActiveEffect', this._onActiveEffectChange.bind(this)));
        this._hookIds.set('deleteActiveEffect', Hooks.on('deleteActiveEffect', this._onActiveEffectChange.bind(this)));

        // Item hooks to react to quantity / uses changes immediately
        // Note: createItem and deleteItem are handled by ItemUpdateManager
        // We only handle updateItem here for UI refresh of existing items
        this._hookIds.set('updateItem', Hooks.on('updateItem', this._onEmbeddedItemChange.bind(this)));
    }

    /**
     * Unregister all Foundry hooks.
     * Called during destroy to prevent memory leaks from duplicate listeners.
     */
    unregisterHooks() {
        if (!this._hookIds) return;

        for (const [hookName, hookId] of this._hookIds) {
            Hooks.off(hookName, hookId);
        }
        this._hookIds = null;
    }

    /**
     * Handle token control
     * @param {Token} token
     * @param {boolean} controlled
     * @private
     */
    async _onControlToken(token, controlled) {

        // Check if GM hotbar override is active
        if (this.hotbarApp.overrideGMHotbar && game.settings.get('bg3-hud-core', 'enableGMHotbar')) {
            return; // Don't switch away from GM hotbar if override is set
        }

        // Filter out group actors from controlled tokens
        const controlledTokens = canvas.tokens.controlled.filter(t => {
            const adapter = BG3HUD_REGISTRY.activeAdapter;
            return adapter && typeof adapter.isCompatible === 'function' ? adapter.isCompatible(t.actor) : t.actor?.type !== 'group';
        });
        const multipleTokensControlled = controlledTokens.length > 1;

        // If the current token being controlled/uncontrolled is not compatible, 
        // ignore the event unless it changes our valid selection count
        const adapter = BG3HUD_REGISTRY.activeAdapter;
        const isCompatible = adapter && typeof adapter.isCompatible === 'function' ? adapter.isCompatible(token.actor) : token.actor?.type !== 'group';
        
        if (!isCompatible) {
            // Only proceed if we still need to evaluate the remaining valid tokens
            if (controlledTokens.length === 1 && this.hotbarApp.currentToken !== controlledTokens[0]) {
                // Another valid token is selected, show it
                this.hotbarApp.overrideGMHotbar = false;
                this.hotbarApp.currentToken = controlledTokens[0];
                this.hotbarApp.currentActor = controlledTokens[0].actor;
                await this.hotbarApp.refresh();
            } else if (controlledTokens.length !== 1 && this.hotbarApp.currentToken) {
                // We lost our single valid selection
                this.hotbarApp.currentToken = null;
                this.hotbarApp.currentActor = null;
                await this.hotbarApp.refresh();
            }
            return;
        }

        if (controlled) {
            if (multipleTokensControlled) {
                // Multiple tokens selected - show GM hotbar if enabled, otherwise hide
                console.debug('[bg3-hud-core] Multiple tokens controlled');
                this.hotbarApp.currentToken = null;
                this.hotbarApp.currentActor = null;
                await this.hotbarApp.refresh();
            } else if (controlledTokens.length === 1) {
                // Single token controlled - show UI normally
                this.hotbarApp.overrideGMHotbar = false; // Clear override when selecting token
                this.hotbarApp.currentToken = token;
                this.hotbarApp.currentActor = token.actor;
                await this.hotbarApp.refresh();
            }
        } else {
            // Check if deselect lock is enabled - if so, keep the current token
            if (ControlsManager.isSettingLocked('deselect') && this.hotbarApp.currentToken) {
                // Deselect lock active - don't change the current token
                return;
            }

            // When deselecting, check if we still have a single token selected
            if (controlledTokens.length === 1) {
                // Another token is still selected, show it
                this.hotbarApp.overrideGMHotbar = false; // Clear override when selecting token
                const remainingToken = controlledTokens[0];
                this.hotbarApp.currentToken = remainingToken;
                this.hotbarApp.currentActor = remainingToken.actor;
                await this.hotbarApp.refresh();
            } else {
                // No tokens selected or multiple tokens selected
                // Show GM hotbar if enabled, otherwise hide
                this.hotbarApp.currentToken = null;
                this.hotbarApp.currentActor = null;
                await this.hotbarApp.refresh();
            }

            // DON'T clear _lastSaveWasLocal here - let the updateActor hook handle it
            // This ensures that if an actor update is pending, it will be properly skipped
        }
    }

    /**
     * Handle canvas ready - check for pre-selected tokens
     * Called when the canvas is first rendered or when switching scenes
     * Fixes issue where HUD doesn't render when player reloads with token already selected
     * @private
     */
    async _onCanvasReady() {
        // Brief delay to ensure canvas.tokens.controlled is fully populated
        await new Promise(resolve => setTimeout(resolve, 50));

        // Filter out incompatible actors (like groups/vehicles)
        const controlledTokens = (canvas.tokens?.controlled || []).filter(t => {
            const adapter = BG3HUD_REGISTRY.activeAdapter;
            return adapter && typeof adapter.isCompatible === 'function' ? adapter.isCompatible(t.actor) : t.actor?.type !== 'group';
        });

        if (controlledTokens.length === 1) {
            // Single token selected - show HUD for it
            const token = controlledTokens[0];
            this.hotbarApp.currentToken = token;
            this.hotbarApp.currentActor = token.actor;
        } else {
            // No tokens or multiple tokens - clear HUD (show GM hotbar if enabled)
            this.hotbarApp.currentToken = null;
            this.hotbarApp.currentActor = null;
        }
        await this.hotbarApp.refresh();
    }

    /**
     * Handle token update
     * @param {Token} token
     * @param {Object} changes
     * @private
     */
    async _onUpdateToken(token, changes) {
        if (token !== this.hotbarApp.currentToken) return;

        // Don't refresh on cosmetic changes
        const ignoredProperties = ['x', 'y', 'rotation', 'hidden', 'elevation'];
        const changedKeys = Object.keys(changes);
        const shouldIgnore = changedKeys.every(key => ignoredProperties.includes(key));

        if (shouldIgnore) {
            return;
        }

        await this.hotbarApp.refresh();
    }

    /**
     * Handle actor update
     * Routes to targeted update handlers based on what changed
     * @param {Actor} actor
     * @param {Object} changes
     * @private
     */
    async _onUpdateActor(actor, changes) {
        // Only handle updates for the current actor
        if (actor !== this.hotbarApp.currentActor) return;

        // Check if hudState flag changed
        const hudStateChanged = changes?.flags?.[this.moduleId]?.[this.flagName];

        if (hudStateChanged) {
            // If we just saved locally, skip reload to prevent flicker
            if (this.persistenceManager.shouldSkipReload()) {
                return;
            }

            // Server state changed from another source (another user saved)
            // This is our authoritative reconciliation point
            // The server state is the source of truth - reconcile our UI to match
            await this._reconcileWithServerState(actor);
            return;
        }

        // Actor flag deltas keyed by adapter module (`flags[adapter.MODULE_ID]`)
        const adapter = BG3HUD_REGISTRY.activeAdapter;

        // NOTE: Depletion states are now updated AFTER all handlers complete
        // to avoid race conditions with grid re-renders. See end of method.

        if (adapter && adapter.MODULE_ID) {
            const adapterFlags = changes?.flags?.[adapter.MODULE_ID];
            if (adapterFlags) {
                if (await this._handleAdapterFlags(adapterFlags)) {
                    return; // Handled with targeted update
                }
            }
        }

        // Check for HP or death save changes (common case)
        const hpChanged = changes?.system?.attributes?.hp;
        const deathChanged = changes?.system?.attributes?.death;

        if (hpChanged || deathChanged) {
            if (await this._handleHealthChange()) {
                return;
            }
        }

        // Check for other attribute changes (AC, Speed, etc.) that affect portrait data
        const attributesChanged = changes?.system?.attributes;
        if (attributesChanged && !hpChanged && !deathChanged) {
            await this._handleAttributeChange();
            // Don't return early - other handlers might also need to run
        }

        // Check for spell slot changes (common on many systems)
        const spellsChanged = changes?.system?.spells;
        if (spellsChanged) {
            if (await this._handleResourceChange()) {
                // LATE: Update depletion states after resource change handling
                this._updateDepletionStatesDeferred(actor, changes);
                return;
            }
        }

        // Check for item changes (uses, quantity, etc.)
        // Foundry provides item updates via embedded document hooks; here we detect shallow indicators
        const itemsChanged = changes?.items;
        if (itemsChanged) {
            if (await this._handleItemsChange(itemsChanged)) {
                return;
            }
        }

        // Item hooks are already registered in registerHooks() method
        // No need to register them again here

        // Check for resource changes (ki, rage, etc.)
        const resourcesChanged = changes?.system?.resources;
        if (resourcesChanged) {
            await this._handleResourceChange();
            // Also update portrait data in case it displays resources
            await this._handleAttributeChange();
            // LATE: Update depletion states after resource change handling
            this._updateDepletionStatesDeferred(actor, changes);
            return;
        }

        // Check for ability score changes (affects info container)
        const abilitiesChanged = changes?.system?.abilities;
        if (abilitiesChanged) {
            if (await this._handleAbilityChange()) {
                return;
            }
        }

        // Check for skill proficiency/value changes (affects info container)
        const skillsChanged = changes?.system?.skills;
        if (skillsChanged) {
            if (await this._handleAbilityChange()) {
                return;
            }
        }

        // LATE: Always call depletion update at the end if no early return occurred
        this._updateDepletionStatesDeferred(actor, changes);

        // No full refresh fallback - only update elements that have explicit handlers
        // Unhandled changes are logged for debugging but don't trigger expensive re-renders
        console.debug('[bg3-hud-core] UpdateCoordinator: Unhandled actor change (no refresh):', changes);
    }

    /**
     * Handle HUD state update
     * Reload state and update all containers in place
     * Uses unified update pattern for all containers
     * @private
     */
    async _handleStateUpdate() {
        const state = await this.persistenceManager.loadState();

        // Update hotbar grids (multiple grids)
        if (this.hotbarApp.components?.hotbar) {
            const hotbar = this.hotbarApp.components.hotbar;
            hotbar.grids = state.hotbar.grids;

            for (let i = 0; i < hotbar.grids.length; i++) {
                const gridData = hotbar.grids[i];
                const gridContainer = hotbar.gridContainers[i];
                if (gridContainer) {
                    gridContainer.rows = gridData.rows;
                    gridContainer.cols = gridData.cols;
                    gridContainer.items = gridData.items;
                    await gridContainer.render();
                }
            }
        }

        // Update weapon sets (multiple grids)
        if (this.hotbarApp.components?.weaponSets) {
            const weaponSets = this.hotbarApp.components.weaponSets;
            weaponSets.weaponSets = state.weaponSets.sets;

            for (let i = 0; i < weaponSets.weaponSets.length; i++) {
                const setData = weaponSets.weaponSets[i];
                const gridContainer = weaponSets.gridContainers[i];
                if (gridContainer) {
                    gridContainer.items = setData.items;
                    await gridContainer.render();
                }
            }

            // Update active set
            await weaponSets.setActiveSet(state.weaponSets.activeSet, true);
        }

        // Update quick access (now normalized as array of grids)
        if (this.hotbarApp.components?.quickAccess) {
            const quickAccess = this.hotbarApp.components.quickAccess;
            quickAccess.grids = state.quickAccess.grids;

            // Use same pattern as hotbar/weaponSets for consistency
            const gridData = quickAccess.grids[0];
            const gridContainer = quickAccess.gridContainers[0];
            if (gridContainer) {
                gridContainer.rows = gridData.rows;
                gridContainer.cols = gridData.cols;
                gridContainer.items = gridData.items;
                await gridContainer.render();
            }
        }
    }

    /**
     * Delegate `flags[adapter.MODULE_ID]` deltas to the active adapter.
     * @param {Object} adapterFlags
     * @returns {Promise<boolean>} True if handled
     * @private
     */
    async _handleAdapterFlags(adapterFlags) {
        const adapter = BG3HUD_REGISTRY.activeAdapter;
        if (adapter && typeof adapter.onAdapterFlagsChanged === 'function') {
            try {
                return !!(await adapter.onAdapterFlagsChanged(adapterFlags, this.hotbarApp));
            } catch (e) {
                console.error('[bg3-hud-core] onAdapterFlagsChanged failed:', e);
                return false;
            }
        }
        return false;
    }

    /**
     * Handle health/death save changes
     * Targeted update: only update portrait container
     * @returns {Promise<boolean>} True if handled
     * @private
     */
    async _handleHealthChange() {
        const portraitContainer = this.hotbarApp.components?.portrait;
        if (portraitContainer) {
            if (typeof portraitContainer.updateHealth === 'function') {
                await portraitContainer.updateHealth();
            }
            // Also update portrait data badges (AC, HP, Speed, etc.)
            if (typeof portraitContainer.updatePortraitData === 'function') {
                await portraitContainer.updatePortraitData();
            }
            return true;
        }
        return false;
    }

    /**
     * Handle resource changes (spell slots, ki, rage, etc.)
     * Targeted update: only update filter container
     * @returns {Promise<boolean>} True if handled
     * @private
     */
    async _handleResourceChange() {
        const filters = this.hotbarApp.components?.filters;
        if (filters && typeof filters.update === 'function') {
            await filters.update();
            return true;
        }
        return false;
    }

    /**
     * Handle attribute changes (AC, Speed, etc.)
     * Targeted update: only update portrait data badges
     * @returns {Promise<boolean>} True if handled
     * @private
     */
    async _handleAttributeChange() {
        const portraitContainer = this.hotbarApp.components?.portrait;
        if (portraitContainer && typeof portraitContainer.updatePortraitData === 'function') {
            await portraitContainer.updatePortraitData();
            return true;
        }
        return false;
    }

    /**
     * Handle ability score changes
     * Targeted update: only update info container
     * @returns {Promise<boolean>} True if handled
     * @private
     */
    async _handleAbilityChange() {
        const infoContainer = this.hotbarApp.components?.info;
        if (infoContainer && typeof infoContainer.update === 'function') {
            await infoContainer.update();
            return true;
        }
        return false;
    }

    /**
     * Handle item changes (uses, quantity, etc.)
     * Targeted update: update cells that display the changed items
     * @param {Array} changedItems - Array of changed item data
     * @returns {Promise<boolean>} True if handled
     * @private
     */
    async _handleItemsChange(changedItems) {
        // Embedded item hooks handle most item updates with UUID-targeted refresh.
        // Actor-level `changes.items` is often noisy and incomplete, so avoid broad fan-out here.
        return false;
    }

    /**
     * Handle combat update
     * @param {Combat} combat
     * @param {Object} changes
     * @private
     */
    async _onUpdateCombat(combat, changes) {
        // Update action button visibility (no need for full refresh)
        this._updateActionButtonsVisibility();

        // Reset filters when turn changes
        if (changes.turn !== undefined || changes.round !== undefined) {
            this._resetFilters();
        }
    }

    /**
     * Handle combat state changes (start/end/turn)
     * Update action buttons visibility and reset filters
     * @private
     */
    _onCombatStateChange() {
        this._updateActionButtonsVisibility();
        this._resetFilters();
    }

    /**
     * Update action buttons visibility based on combat state
     * @private
     */
    _updateActionButtonsVisibility() {
        const actionButtons = this.hotbarApp.components?.actionButtons;
        if (actionButtons && typeof actionButtons.updateVisibility === 'function') {
            actionButtons.updateVisibility();
        }
    }

    /**
     * Reset filter container used filters
     * Called on turn start and combat end
     * @private
     */
    _resetFilters() {
        const filters = this.hotbarApp.components?.filters;
        if (filters && typeof filters.resetUsedFilters === 'function') {
            filters.resetUsedFilters();
        }
    }

    /**
     * Update cell depletion states after a deferred microtask
     * This ensures depletion visual updates happen AFTER grid renders complete,
     * preventing flash effects where cells momentarily appear available
     * @param {Actor} actor - The actor that changed
     * @param {Object} changes - The changes object from updateActor hook
     * @private
     */
    _updateDepletionStatesDeferred(actor, changes) {
        const adapter = BG3HUD_REGISTRY.activeAdapter;
        if (!adapter?.updateCellDepletionStates) return;

        // Use queueMicrotask to defer until after current render cycle completes
        queueMicrotask(() => {
            adapter.updateCellDepletionStates(actor, changes);
        });
    }

    /**
     * React to embedded Item changes (uses, quantity, etc.)
     * Focused on UI refresh for items already in the hotbar
     * Item creation/deletion and hotbar data updates are handled by ItemUpdateManager
     * @private
     */
    async _onEmbeddedItemChange(item, changes, options, userId) {
        // Only react for current actor's items
        const parent = item?.parent;
        if (!parent || parent !== this.hotbarApp.currentActor) return;

        // Skip if this is a creation/deletion (handled by ItemUpdateManager)
        // We only care about updates to existing items (quantity, uses, etc.)
        if (!changes || Object.keys(changes).length === 0) return;

        // Skip if only equipped state changed (cosmetic change, no UI update needed)
        if (changes.system && Object.keys(changes.system).length === 1 && changes.system.hasOwnProperty('equipped')) {
            return;
        }

        // Check if item exists in hotbar before refreshing
        const existingLocation = this.persistenceManager.findUuidInHud(item.uuid);
        if (!existingLocation) {
            // Item not in hotbar, ItemUpdateManager will handle adding it if needed
            return;
        }

        // Refresh only cells showing this UUID.
        try {
            const adapter = BG3HUD_REGISTRY.activeAdapter;
            const transformedData = adapter?.transformItemToCellData
                ? await adapter.transformItemToCellData(item)
                : { uuid: item.uuid, name: item.name, img: item.img };
            const changed = await this._refreshCellsByUuid(item.uuid, transformedData);

            // AFTER all renders complete, update depletion states
            // This ensures visual depletion is applied after cells have fresh data
            if (changed) {
                this._updateDepletionStatesDeferred(item.parent, changes);
            }
        } catch (e) {
            console.error('[bg3-hud-core] UpdateCoordinator: Failed to handle embedded item change', e);
            await this.hotbarApp.refresh();
        }
    }

    async _refreshCellsByUuid(uuid, freshData) {
        if (!uuid) return false;
        const updates = [];
        let anyChanged = false;
        for (const cell of this._iterAllCells()) {
            if (!cell?.data?.uuid || cell.data.uuid !== uuid) continue;
            anyChanged = true;
            const mergedData = { ...cell.data, ...freshData };
            updates.push(cell.setData(mergedData, { skipSave: true }));
            const grid = this._findGridForCell(cell);
            if (grid) {
                grid.items[cell.getSlotKey()] = mergedData;
            }
        }
        if (updates.length) {
            await Promise.all(updates);
        }
        return anyChanged;
    }

    *_iterAllCells() {
        const hotbarGrids = this.hotbarApp.components?.hotbar?.gridContainers || [];
        for (const grid of hotbarGrids) {
            for (const cell of grid?.cells || []) yield cell;
        }
        const weaponGrids = this.hotbarApp.components?.weaponSets?.gridContainers || [];
        for (const grid of weaponGrids) {
            for (const cell of grid?.cells || []) yield cell;
        }
        const quickGrids = this.hotbarApp.components?.quickAccess?.gridContainers || [];
        for (const grid of quickGrids) {
            for (const cell of grid?.cells || []) yield cell;
        }
    }

    _findGridForCell(cell) {
        const containerMap = {
            hotbar: this.hotbarApp.components?.hotbar?.gridContainers,
            weaponSet: this.hotbarApp.components?.weaponSets?.gridContainers,
            quickAccess: this.hotbarApp.components?.quickAccess?.gridContainers
        };
        return containerMap[cell.containerType]?.[cell.containerIndex] || null;
    }

    /**
     * Handle active effect changes
     * Targeted update: only update active effects container
     * @param {ActiveEffect} effect
     * @param {Object} changes
     * @private
     */
    async _onActiveEffectChange(effect, changes) {
        // Only update if the effect belongs to the current actor
        if (effect.parent === this.hotbarApp.currentActor) {
            // Targeted update: just re-render the active effects container
            if (this.hotbarApp.components?.hotbar?.activeEffectsContainer) {
                await this.hotbarApp.components.hotbar.activeEffectsContainer.render();
            }
            // Also update info container - active effects can change ability scores, skills, etc.
            await this._handleAbilityChange();
        }
    }

    /**
     * Reconcile local UI state with authoritative server state
     * Called when hudState flag changes from another user's save
     * This is the core multi-user sync mechanism: Foundry broadcasts flag changes
     * to all clients via updateActor hook, and we update the UI to match.
     * @param {Actor} actor - The actor whose state changed
     * @private
     */
    async _reconcileWithServerState(actor) {
        // Get the authoritative server state
        const serverState = actor.getFlag(this.moduleId, this.flagName);
        if (!serverState) return;

        // Update persistence manager's cached state
        this.persistenceManager.state = foundry.utils.deepClone(serverState);

        // Compare and update UI components to match server state
        // This is a lightweight reconciliation - only update what differs
        await this._reconcileHotbarGrids(serverState);
        await this._reconcileWeaponSets(serverState);
        await this._reconcileQuickAccess(serverState);
    }

    /**
     * Reconcile hotbar grids with server state
     * @param {Object} serverState - Authoritative server state
     * @private
     */
    async _reconcileHotbarGrids(serverState) {
        const hotbar = this.hotbarApp.components?.hotbar;
        if (!hotbar || !serverState.hotbar?.grids) return;

        const updates = [];

        for (let i = 0; i < serverState.hotbar.grids.length; i++) {
            const serverGrid = serverState.hotbar.grids[i];
            const gridContainer = hotbar.gridContainers[i];

            if (!gridContainer) continue;

            // Check if grid config differs
            const configChanged = gridContainer.rows !== serverGrid.rows ||
                gridContainer.cols !== serverGrid.cols;

            // Check if items differ (deep comparison would be expensive, so just replace)
            const itemsChanged = JSON.stringify(gridContainer.items) !== JSON.stringify(serverGrid.items);

            if (configChanged || itemsChanged) {
                // Update grid container
                if (hotbar.grids[i]) {
                    hotbar.grids[i].rows = serverGrid.rows;
                    hotbar.grids[i].cols = serverGrid.cols;
                    hotbar.grids[i].items = serverGrid.items;
                }

                gridContainer.rows = serverGrid.rows;
                gridContainer.cols = serverGrid.cols;
                gridContainer.items = serverGrid.items || {};

                updates.push(gridContainer.render());
            }
        }

        if (updates.length > 0) {
            await Promise.all(updates);
        }
    }

    /**
     * Reconcile weapon sets with server state
     * @param {Object} serverState - Authoritative server state
     * @private
     */
    async _reconcileWeaponSets(serverState) {
        const weaponSets = this.hotbarApp.components?.weaponSets;
        if (!weaponSets || !serverState.weaponSets?.sets) return;

        const updates = [];

        for (let i = 0; i < serverState.weaponSets.sets.length; i++) {
            const serverSet = serverState.weaponSets.sets[i];
            const gridContainer = weaponSets.gridContainers[i];

            if (!gridContainer) continue;

            // Check if items differ
            const itemsChanged = JSON.stringify(gridContainer.items) !== JSON.stringify(serverSet.items);

            if (itemsChanged) {
                if (weaponSets.weaponSets[i]) {
                    weaponSets.weaponSets[i].items = serverSet.items;
                }
                gridContainer.items = serverSet.items || {};
                updates.push(gridContainer.render());
            }
        }

        // Check if active set differs
        if (serverState.weaponSets.activeSet !== undefined &&
            weaponSets.getActiveSet &&
            weaponSets.getActiveSet() !== serverState.weaponSets.activeSet) {
            await weaponSets.setActiveSet(serverState.weaponSets.activeSet, true);
        }

        if (updates.length > 0) {
            await Promise.all(updates);
        }
    }

    /**
     * Reconcile quick access with server state
     * @param {Object} serverState - Authoritative server state
     * @private
     */
    async _reconcileQuickAccess(serverState) {
        const quickAccess = this.hotbarApp.components?.quickAccess;
        if (!quickAccess || !serverState.quickAccess?.grids?.[0]) return;

        const serverGrid = serverState.quickAccess.grids[0];
        const gridContainer = quickAccess.gridContainers[0];

        if (!gridContainer) return;

        // Check if items differ
        const itemsChanged = JSON.stringify(gridContainer.items) !== JSON.stringify(serverGrid.items);

        if (itemsChanged) {
            if (quickAccess.grids?.[0]) {
                quickAccess.grids[0].items = serverGrid.items;
            }
            gridContainer.items = serverGrid.items || {};
            await gridContainer.render();
        }
    }

}


/**
 * Update Coordinator
 * Handles Foundry hooks and coordinates targeted updates
 * Monitors single hudState flag for simplified state management
 * Note: HUD state updates are now handled via socketlib for real-time sync
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
     * Register all Foundry hooks
     */
    registerHooks() {
        Hooks.on('controlToken', this._onControlToken.bind(this));
        Hooks.on('updateToken', this._onUpdateToken.bind(this));
        Hooks.on('updateActor', this._onUpdateActor.bind(this));
        Hooks.on('updateCombat', this._onUpdateCombat.bind(this));
        Hooks.on('combatStart', this._onCombatStateChange.bind(this));
        Hooks.on('combatRound', this._onCombatStateChange.bind(this));
        Hooks.on('combatTurn', this._onCombatStateChange.bind(this));
        Hooks.on('deleteCombat', this._onCombatStateChange.bind(this));
        
        // Active effects hooks
        Hooks.on('createActiveEffect', this._onActiveEffectChange.bind(this));
        Hooks.on('updateActiveEffect', this._onActiveEffectChange.bind(this));
        Hooks.on('deleteActiveEffect', this._onActiveEffectChange.bind(this));

        // Item hooks to react to quantity / uses changes immediately
        // Note: createItem and deleteItem are handled by ItemUpdateManager
        // We only handle updateItem here for UI refresh of existing items
        Hooks.on('updateItem', this._onEmbeddedItemChange.bind(this));
    }

    /**
     * Handle token control
     * @param {Token} token
     * @param {boolean} controlled
     * @private
     */
    async _onControlToken(token, controlled) {
        // Check if GM hotbar lock is enabled
        const gmHotbarLock = game.settings.get('bg3-hud-core', 'gmHotbarLock');
        if (gmHotbarLock && this.hotbarApp.canGMHotbar()) {
            // Keep GM hotbar visible even when token is selected
            this.hotbarApp.overrideGMHotbar = true;
            return;
        }

        // Check if GM hotbar override is active
        if (this.hotbarApp.overrideGMHotbar && game.settings.get('bg3-hud-core', 'enableGMHotbar')) {
            return; // Don't switch away from GM hotbar if override is set
        }

        // Check how many tokens are currently controlled
        const controlledTokens = canvas.tokens.controlled;
        const multipleTokensControlled = controlledTokens.length > 1;
        
        if (controlled) {
            if (multipleTokensControlled) {
                // Multiple tokens selected - show GM hotbar if enabled, otherwise hide
                console.log('BG3 HUD Core | Multiple tokens controlled');
                this.hotbarApp.currentToken = null;
                this.hotbarApp.currentActor = null;
                await this.hotbarApp.refresh();
            } else {
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

        // Check for adapter flags (system-specific)
        // Get adapter module ID dynamically
        const adapter = BG3HUD_REGISTRY.activeAdapter;
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

        // Check for spell slot changes (very common in D&D 5e)
        const spellsChanged = changes?.system?.spells;
        if (spellsChanged) {
            if (await this._handleResourceChange()) {
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
            if (await this._handleResourceChange()) {
                return;
            }
        }

        // Check for ability score changes (affects info container)
        const abilitiesChanged = changes?.system?.abilities;
        if (abilitiesChanged) {
            if (await this._handleAbilityChange()) {
                return;
            }
        }

        // No full refresh fallback - only update elements that have explicit handlers
        // Unhandled changes are logged for debugging but don't trigger expensive re-renders
        console.debug('BG3 HUD Core | UpdateCoordinator: Unhandled actor change (no refresh):', changes);
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
     * Handle adapter flag changes
     * System-specific flags (e.g., selectedPassives in D&D 5e)
     * @param {Object} adapterFlags
     * @returns {Promise<boolean>} True if handled
     * @private
     */
    async _handleAdapterFlags(adapterFlags) {
        let handled = false;

        // Selected passives (D&D 5e specific)
        if (Object.prototype.hasOwnProperty.call(adapterFlags, 'selectedPassives')) {
            if (this.hotbarApp.components?.hotbar?.passivesContainer) {
                await this.hotbarApp.components.hotbar.passivesContainer.render();
                handled = true;
            }
        }

        // Portrait image preference (D&D 5e specific)
        if (Object.prototype.hasOwnProperty.call(adapterFlags, 'useTokenImage') || 
            Object.prototype.hasOwnProperty.call(adapterFlags, 'scaleWithToken')) {
            const portraitContainer = this.hotbarApp.components?.portrait;
            if (portraitContainer) {
                // Re-render the portrait to show the new image/scale
                await portraitContainer.render();
                handled = true;
            }
        }

        // Situational bonuses state (e.g., advState, advOnce for D&D 5e)
        // Only update button states, no full re-render
        const advStateKeys = ['advState', '-=advState'];
        const advOnceKeys = ['advOnce', '-=advOnce'];
        const advStateChanged = advStateKeys.some((key) => Object.prototype.hasOwnProperty.call(adapterFlags, key));
        const advOnceChanged = advOnceKeys.some((key) => Object.prototype.hasOwnProperty.call(adapterFlags, key));

        if (advStateChanged || advOnceChanged) {
            const situationalBonusesContainer = this.hotbarApp.components?.situationalBonuses;
            if (situationalBonusesContainer && typeof situationalBonusesContainer.updateButtons === 'function') {
                // Only update button visual states, not full re-render
                situationalBonusesContainer.updateButtons();
                handled = true;
            }
        }

        // Add more adapter-specific flag handlers here as needed
        // This keeps the core system-agnostic while allowing adapter updates

        return handled;
    }

    /**
     * Handle health/death save changes
     * Targeted update: only update portrait container
     * @returns {Promise<boolean>} True if handled
     * @private
     */
    async _handleHealthChange() {
        const portraitContainer = this.hotbarApp.components?.portrait;
        if (portraitContainer && typeof portraitContainer.updateHealth === 'function') {
            await portraitContainer.updateHealth();
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
     * Handle ability score changes
     * Targeted update: only update info container
     * @returns {Promise<boolean>} True if handled
     * @private
     */
    async _handleAbilityChange() {
        const infoContainer = this.hotbarApp.components?.info;
        if (infoContainer && typeof infoContainer.render === 'function') {
            await infoContainer.render();
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
        // For now, update all grid containers
        // TODO: Make this more granular by only updating cells with changed items
        const updated = [];

        if (this.hotbarApp.components?.hotbar) {
            for (const gridContainer of this.hotbarApp.components.hotbar.gridContainers) {
                updated.push(gridContainer.render());
            }
        }

        if (this.hotbarApp.components?.weaponSets) {
            for (const gridContainer of this.hotbarApp.components.weaponSets.gridContainers) {
                updated.push(gridContainer.render());
            }
        }

        if (this.hotbarApp.components?.quickAccess) {
            for (const gridContainer of this.hotbarApp.components.quickAccess.gridContainers) {
                updated.push(gridContainer.render());
            }
        }

        if (updated.length > 0) {
            await Promise.all(updated);
            return true;
        }

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

        // Hydrate latest state and update all containers with fresh data
        try {
            let state = await this.persistenceManager.loadState();
            state = await this.persistenceManager.hydrateState(state);
            
            // Update hotbar grids with hydrated data
            if (this.hotbarApp.components?.hotbar) {
                const hotbar = this.hotbarApp.components.hotbar;
                for (let i = 0; i < state.hotbar.grids.length; i++) {
                    const gridData = state.hotbar.grids[i];
                    const gridContainer = hotbar.gridContainers[i];
                    if (gridContainer) {
                        gridContainer.items = gridData.items;
                        await gridContainer.render();
                    }
                }
            }
            
            // Update weapon sets with hydrated data
            if (this.hotbarApp.components?.weaponSets) {
                const weaponSets = this.hotbarApp.components.weaponSets;
                for (let i = 0; i < state.weaponSets.sets.length; i++) {
                    const setData = state.weaponSets.sets[i];
                    const gridContainer = weaponSets.gridContainers[i];
                    if (gridContainer) {
                        gridContainer.items = setData.items;
                        await gridContainer.render();
                    }
                }
            }
            
            // Update quick access with hydrated data
            if (this.hotbarApp.components?.quickAccess && state.quickAccess?.grids?.[0]) {
                const quickAccess = this.hotbarApp.components.quickAccess;
                const gridData = state.quickAccess.grids[0];
                const gridContainer = quickAccess.gridContainers[0];
                if (gridContainer) {
                    gridContainer.items = gridData.items;
                    await gridContainer.render();
                }
            }
        } catch (e) {
            console.error('BG3 HUD Core | UpdateCoordinator: Failed to handle embedded item change', e);
            await this.hotbarApp.refresh();
        }
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
        }
    }

    /**
     * Reconcile local UI state with authoritative server state
     * Called when hudState flag changes from another user's save
     * This ensures eventual consistency even if socket updates were missed or conflicted
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


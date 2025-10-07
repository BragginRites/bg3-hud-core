/**
 * Update Coordinator
 * Handles Foundry hooks and coordinates targeted updates
 * Monitors single hudState flag for simplified state management
 * Note: HUD state updates are now handled via socketlib for real-time sync
 */
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
        Hooks.on('createItem', this._onEmbeddedItemChange.bind(this));
        Hooks.on('updateItem', this._onEmbeddedItemChange.bind(this));
        Hooks.on('deleteItem', this._onEmbeddedItemChange.bind(this));
    }

    /**
     * Handle token control
     * @param {Token} token
     * @param {boolean} controlled
     * @private
     */
    async _onControlToken(token, controlled) {
        // Check how many tokens are currently controlled
        const controlledTokens = canvas.tokens.controlled;
        const multipleTokensControlled = controlledTokens.length > 1;
        
        if (controlled) {
            if (multipleTokensControlled) {
                // Hide UI when multiple tokens are selected to prevent confusion
                console.log('BG3 HUD Core | Multiple tokens controlled, hiding UI');
                this.hotbarApp.currentToken = null;
                this.hotbarApp.currentActor = null;
                await this.hotbarApp.refresh();
            } else {
                // Single token controlled - show UI normally
                this.hotbarApp.currentToken = token;
                this.hotbarApp.currentActor = token.actor;
                await this.hotbarApp.refresh();
            }
        } else {
            // When deselecting, check if we still have a single token selected
            if (controlledTokens.length === 1) {
                // Another token is still selected, show it
                const remainingToken = controlledTokens[0];
                this.hotbarApp.currentToken = remainingToken;
                this.hotbarApp.currentActor = remainingToken.actor;
                await this.hotbarApp.refresh();
            } else {
                // No tokens selected or multiple tokens selected
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
            // Socket-based updates: Only update if we initiated the save (for backup/validation)
            // All other clients receive instant updates via socketlib, no hook handling needed
            if (this.persistenceManager.shouldSkipReload()) {
                return;
            }
            
            // For observers: socketlib already handled the update instantly
            // This hook fires after the server roundtrip, which we can ignore
            console.log('BG3 HUD Core | UpdateCoordinator: Skipping hook-based update (socketlib handles real-time sync)');
            
            // Update our cached state to stay in sync with the server
            this.persistenceManager.state = foundry.utils.deepClone(actor.getFlag(this.moduleId, this.flagName));
            return;
        }

        // Check for adapter flags (system-specific)
        const adapterFlags = changes?.flags?.['bg3-hud-dnd5e']; // TODO: Make this dynamic
        if (adapterFlags) {
            if (await this._handleAdapterFlags(adapterFlags)) {
                return; // Handled with targeted update
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

        // Also react when the system's items update via embedded Documents
        // We register dedicated hooks once to handle create/update/delete Item on the actor
        if (!this._itemHooksRegistered) {
            this._registerItemHooks();
            this._itemHooksRegistered = true;
        }

        // Check for resource changes (ki, rage, etc.)
        const resourcesChanged = changes?.system?.resources;
        if (resourcesChanged) {
            if (await this._handleResourceChange()) {
                return;
            }
        }

        // Fallback: full refresh for unhandled changes (rare)
        console.warn('BG3 HUD Core | UpdateCoordinator: Unhandled actor change, doing full refresh:', changes);
        await this.hotbarApp.refresh();
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
     * @private
     */
    async _onEmbeddedItemChange(item, changes, options, userId) {
        // Only react for current actor's items
        const parent = item?.parent;
        if (!parent || parent !== this.hotbarApp.currentActor) return;

        console.log('BG3 HUD Core | UpdateCoordinator: Item changed, hydrating and updating UI', {
            itemName: item.name,
            changes: changes
        });

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
            
            console.log('BG3 HUD Core | UpdateCoordinator: Item change update complete');
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

}


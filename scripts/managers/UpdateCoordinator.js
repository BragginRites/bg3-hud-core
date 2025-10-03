/**
 * Update Coordinator
 * Handles Foundry hooks and coordinates targeted updates
 * Monitors single hudState flag for simplified state management
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
    }

    /**
     * Handle token control
     * @param {Token} token
     * @param {boolean} controlled
     * @private
     */
    async _onControlToken(token, controlled) {
        if (controlled) {
            this.hotbarApp.currentToken = token;
            this.hotbarApp.currentActor = token.actor;
            console.log('BG3 HUD Core | Token controlled:', token.name);
            await this.hotbarApp.refresh();
        } else {
            // When deselecting, don't immediately null out the actor
            // This allows pending updateActor hooks to complete
            // We'll clear it after the refresh
            console.log('BG3 HUD Core | Token deselected');
            this.hotbarApp.currentToken = null;
            this.hotbarApp.currentActor = null;
            await this.hotbarApp.refresh();
            
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

        console.log('BG3 HUD Core | UpdateCoordinator: Actor updated', actor.name, changes);

        // Check if hudState flag changed
        const hudStateChanged = changes?.flags?.[this.moduleId]?.[this.flagName];
        
        if (hudStateChanged) {
            // Skip reload if we just saved locally (prevents race condition)
            if (this.persistenceManager.shouldSkipReload()) {
                console.log('BG3 HUD Core | UpdateCoordinator: Skipping reload (local save in progress)');
                return;
            }
            
            console.log('BG3 HUD Core | UpdateCoordinator: HUD state changed, performing targeted update');
            await this._handleStateUpdate();
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

        // Fallback: full refresh for unhandled changes
        await this.hotbarApp.refresh();
    }

    /**
     * Handle HUD state update
     * Reload state and update all containers in place
     * @private
     */
    async _handleStateUpdate() {
        const state = await this.persistenceManager.loadState();
        
        // Update hotbar grids
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
        
        // Update weapon sets
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
        
        // Update quick access - use container's own update method for consistency
        if (this.hotbarApp.components?.quickAccess) {
            const quickAccess = this.hotbarApp.components.quickAccess;
            await quickAccess.updateGrid(state.quickAccess);
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
     * Handle combat update
     * @param {Combat} combat
     * @param {Object} changes
     * @private
     */
    async _onUpdateCombat(combat, changes) {
        // Refresh if it's the current combatant's turn
        const combatant = combat.combatant;
        if (combatant && combatant.token === this.hotbarApp.currentToken) {
            await this.hotbarApp.refresh();
        }
        
        // Update action button visibility
        this._updateActionButtonsVisibility();
    }

    /**
     * Handle combat state changes (start/end/turn)
     * Update action buttons visibility without full refresh
     * @private
     */
    _onCombatStateChange() {
        this._updateActionButtonsVisibility();
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


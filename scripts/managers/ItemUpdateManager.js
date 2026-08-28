/**
 * Item Update Manager
 * Handles automatic hotbar population when items are created/updated/deleted on actors
 * Works with any actor (not just currently selected), updating their hotbar data in flags
 */
import { BG3HUD_REGISTRY } from '../utils/registry.js';
import { PersistenceManager } from './PersistenceManager.js';
import { Logger } from '../utils/logger.js';

export class ItemUpdateManager {
    constructor(options = {}) {
        this.hotbarApp = options.hotbarApp;
        this.persistenceManager = options.persistenceManager;
        this._hookIds = null;
        this._registerHooks();
    }

    /**
     * Register Foundry hooks for item changes.
     * Stores hook IDs for proper cleanup via destroy().
     * @private
     */
    _registerHooks() {
        if (this._hookIds) {
            Logger.warn('ItemUpdateManager hooks already registered, skipping');
            return;
        }

        this._hookIds = new Map();

        // Item creation
        this._hookIds.set('createItem', Hooks.on('createItem', this._handleItemCreate.bind(this)));

        // Membership changes (e.g. spell prepared/unprepared) — adapter decides add/remove.
        // UpdateCoordinator still owns in-HUD cell refresh + depletion for the current actor.
        this._hookIds.set('updateItem', Hooks.on('updateItem', this._handleItemUpdate.bind(this)));

        // Item deletion
        this._hookIds.set('deleteItem', Hooks.on('deleteItem', this._handleItemDelete.bind(this)));
    }

    /**
     * Unregister all hooks and clean up resources.
     */
    destroy() {
        if (!this._hookIds) return;

        for (const [hookName, hookId] of this._hookIds) {
            Hooks.off(hookName, hookId);
        }
        this._hookIds = null;
    }

    /**
     * Get the active adapter
     * @returns {Object|null} The active adapter or null
     * @private
     */
    _getAdapter() {
        return BG3HUD_REGISTRY.activeAdapter;
    }

    /**
     * Update hotbar data for any actor, regardless of current selection
     * @param {Actor} actor - The actor that received/lost the item
     * @param {Item} item - The item that was created/updated/deleted
     * @param {string} action - The action performed ('create', 'update', 'delete')
     */
    async _updateHotbarForActor(actor, item, action) {
        if (!actor) return;

        // Resolve token context when available (canvas token may not exist yet during createToken)
        let targetToken = null;
        if (actor.isToken && actor.token?.id) {
            targetToken = canvas.tokens.get(actor.token.id);
        } else {
            for (const token of canvas.tokens.placeables) {
                if (token.actor?.id === actor.id) {
                    targetToken = token;
                    if (token.document.actorLink) break;
                }
            }
        }

        // Always bind to the actor — never fall through to GM hotbar when no canvas token exists
        const tempPersistence = PersistenceManager.forActor(actor, targetToken);

        // Load the actor's current hotbar data
        let state = await tempPersistence.loadState();

        if (action === 'create' && await this._shouldAddItemToHotbar(item)) {
            await this._addItemToActorHotbar(tempPersistence, state, item, actor);
        } else if (action === 'delete') {
            await this._removeItemFromActorHotbar(tempPersistence, state, item, actor);
        } else if (action === 'update') {
            await this._updateItemInActorHotbar(tempPersistence, state, item, actor);
        }

        // Refresh uses/quantity/depleted on remaining cells before writing flags
        if (typeof tempPersistence.hydrateState === 'function') {
            state = await tempPersistence.hydrateState(state);
        }

        // Sync current state to active view before saving
        tempPersistence._syncCurrentStateToActiveView(state);

        // Temp PersistenceManager timestamps do not protect the live HUD manager.
        // Mark BEFORE setFlag so UpdateCoordinator's updateActor handler sees the
        // skip window (Foundry fires that hook during saveState, not after).
        if (this.hotbarApp?.currentActor?.id === actor.id && this.persistenceManager) {
            if (typeof this.persistenceManager.markLocalSave === 'function') {
                this.persistenceManager.markLocalSave();
            }
            this.persistenceManager.state = foundry.utils.deepClone(state);
        }

        // Save the updated data back to the actor
        await tempPersistence.saveState(state);

        Logger.debug(`Updated hotbar data for actor "${actor.name}" (action: ${action}, item: "${item.name}")`);
    }

    /**
     * Add an item to an actor's hotbar data
     * @param {PersistenceManager} persistenceManager - The temporary persistence manager
     * @param {Object} state - The current state
     * @param {Item} item - The item to add
     * @param {Actor} actor - The actor
     */
    async _addItemToActorHotbar(persistenceManager, state, item, actor) {
        // Check if the item already exists in any grid
        const existingLocation = persistenceManager.findUuidInHud(item.uuid);
        if (existingLocation) {
            Logger.debug(`Skipping "${item.name}" - already exists in ${existingLocation.container} grid ${existingLocation.containerIndex}`);
            return;
        }

        // Find the appropriate grid for this item type
        const gridIndex = this._findAppropriateGrid(item);
        if (gridIndex === null) {
            Logger.debug(`No appropriate grid found for "${item.name}" (${item.type})`);
            return;
        }

        const grid = state.hotbar.grids[gridIndex];
        if (!grid) {
            Logger.warn(`Grid ${gridIndex} does not exist`);
            return;
        }

        // Find an available slot
        const slotKey = this._findNextAvailableSlot(grid);

        if (slotKey) {
            // Get adapter to transform item to cell data
            const adapter = this._getAdapter();
            let cellData;

            if (adapter && typeof adapter.transformItemToCellData === 'function') {
                cellData = await adapter.transformItemToCellData(item);
            } else {
                // Fallback: always use canonical 'Item' (never system subtypes like 'spell')
                cellData = {
                    uuid: item.uuid,
                    name: item.name,
                    img: item.img,
                    type: 'Item'
                };
            }

            if (cellData) {
                // Add the item to the hotbar data
                grid.items[slotKey] = cellData;

                Logger.debug(`Auto-added item "${item.name}" (${item.type}) to actor "${actor.name}" grid ${gridIndex + 1} at slot ${slotKey}`);
            }
        } else {
            Logger.debug(`No available slots in grid ${gridIndex + 1} for "${item.name}" on actor "${actor.name}"`);
        }
    }

    /**
     * Remove an item from an actor's hotbar data
     * @param {PersistenceManager} persistenceManager - The temporary persistence manager
     * @param {Object} state - The current state
     * @param {Item} item - The item to remove
     * @param {Actor} actor - The actor
     */
    async _removeItemFromActorHotbar(persistenceManager, state, item, actor) {
        let removed = false;

        // Remove from all hotbar grids
        for (const grid of state.hotbar.grids) {
            for (const [slotKey, slotItem] of Object.entries(grid.items || {})) {
                if (slotItem && slotItem.uuid === item.uuid) {
                    delete grid.items[slotKey];
                    removed = true;
                    Logger.debug(`Removed "${item.name}" from actor "${actor.name}" hotbar`);
                }
            }
        }

        // Remove from weapon sets
        for (const set of state.weaponSets.sets) {
            for (const [slotKey, slotItem] of Object.entries(set.items || {})) {
                if (slotItem && slotItem.uuid === item.uuid) {
                    delete set.items[slotKey];
                    removed = true;
                    Logger.debug(`Removed "${item.name}" from actor "${actor.name}" weapon set`);
                }
            }
        }

        // Remove from quick access
        for (const grid of state.quickAccess.grids || []) {
            for (const [slotKey, slotItem] of Object.entries(grid.items || {})) {
                if (slotItem && slotItem.uuid === item.uuid) {
                    delete grid.items[slotKey];
                    removed = true;
                    Logger.debug(`Removed "${item.name}" from actor "${actor.name}" quick access`);
                }
            }
        }

        return removed;
    }

    /**
     * Update an item in an actor's hotbar data
     * @param {PersistenceManager} persistenceManager - The temporary persistence manager
     * @param {Object} state - The current state
     * @param {Item} item - The item to update
     * @param {Actor} actor - The actor
     */
    async _updateItemInActorHotbar(persistenceManager, state, item, actor) {
        const adapter = this._getAdapter();

        // Membership policy is adapter-owned (spell prep, etc.). Core never interprets system modes.
        if (adapter && typeof adapter.resolveHotbarMembershipOnItemUpdate === 'function') {
            let membership = null;
            try {
                membership = await adapter.resolveHotbarMembershipOnItemUpdate(item, actor);
            } catch (error) {
                Logger.error('resolveHotbarMembershipOnItemUpdate failed:', error);
            }

            if (membership === 'remove') {
                await this._removeItemFromActorHotbar(persistenceManager, state, item, actor);
                return;
            }

            if (membership === 'add') {
                const existingLocation = persistenceManager.findUuidInHud(item.uuid);
                if (!existingLocation) {
                    await this._addItemToActorHotbar(persistenceManager, state, item, actor);
                    return;
                }
            }
        }

        // No membership change — refresh cell data when the item is already on the hotbar
        const existingLocation = persistenceManager.findUuidInHud(item.uuid);
        if (existingLocation && existingLocation.container === 'hotbar') {
            const grid = state.hotbar.grids[existingLocation.containerIndex];
            if (grid && grid.items[existingLocation.slotKey]) {
                let cellData;
                if (adapter && typeof adapter.transformItemToCellData === 'function') {
                    cellData = await adapter.transformItemToCellData(item);
                } else {
                    cellData = {
                        uuid: item.uuid,
                        name: item.name,
                        img: item.img,
                        type: 'Item'
                    };
                }

                if (cellData) {
                    grid.items[existingLocation.slotKey] = cellData;
                }
            }
        }

        Logger.debug(`Updated item "${item.name}" in actor "${actor.name}" hotbar data`);
    }

    /**
     * Find appropriate grid for an item when working with actor data directly
     * Uses adapter's auto-populate configuration
     * @param {Item} item - The item to place
     * @returns {number|null} - The index of the grid (0, 1, or 2) or null if no match
     */
    _findAppropriateGrid(item) {
        const adapter = this._getAdapter();
        if (!adapter || !adapter.autoPopulate) {
            return 0; // Default to first grid if no adapter
        }

        // Get auto-populate configuration from adapter's module settings
        const configuration = game.settings.get(adapter.MODULE_ID, 'autoPopulateConfiguration');
        if (!configuration) {
            return 0; // Default to first grid if no configuration
        }

        // Helper function to check if item matches any of the selected types
        const itemMatchesTypes = (selectedTypes) => {
            if (!selectedTypes || !Array.isArray(selectedTypes) || selectedTypes.length === 0) {
                return false;
            }

            for (const selectedType of selectedTypes) {
                if (selectedType.includes(':')) {
                    // Handle subtype (e.g., "consumable:potion")
                    const [mainType, subType] = selectedType.split(':');
                    if (item.type === mainType && item.system?.type?.value === subType) {
                        return true;
                    }
                } else {
                    // Handle main type (e.g., "weapon")
                    if (item.type === selectedType) {
                        return true;
                    }
                }
            }
            return false;
        };

        // Check each grid's preferred types
        if (configuration.grid0 && itemMatchesTypes(configuration.grid0)) return 0;
        if (configuration.grid1 && itemMatchesTypes(configuration.grid1)) return 1;
        if (configuration.grid2 && itemMatchesTypes(configuration.grid2)) return 2;

        // Default to first grid if no specific preference
        return 0;
    }

    /**
     * Find the next available slot in a grid (working with raw grid data)
     * @param {Object} grid - The grid to search
     * @returns {string|null} - The slot key (e.g., "0-0") or null if no slots available
     */
    _findNextAvailableSlot(grid) {
        const rows = grid.rows || 3;
        const cols = grid.cols || 5;

        // Check each position in the grid
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const slotKey = `${col}-${row}`;
                if (!grid.items[slotKey]) {
                    return slotKey;
                }
            }
        }
        return null;
    }

    /**
     * Determine if an item should be added to the hotbar
     * Checks adapter's shouldAutoAddItem when provided
     * @param {Item} item - The item to check
     * @returns {boolean} - Whether the item should be added
     */
    async _shouldAddItemToHotbar(item) {
        const adapter = this._getAdapter();

        if (adapter && typeof adapter.shouldAutoAddItem === 'function') {
            return adapter.shouldAutoAddItem(item);
        }

        const activities = item.system?.activities;
        const hasActivities = (activities instanceof Map && activities.size > 0) ||
            (item.system?.activation?.type && item.system?.activation?.type !== 'none');

        return hasActivities;
    }

    /**
     * Update a specific grid container in the UI
     * @param {number} gridIndex - The grid index to update
     * @private
     */
    async _updateGridContainer(gridIndex) {
        if (!this.hotbarApp?.rendered || !this.hotbarApp?.components?.hotbar) return;

        try {
            // Load persisted layout, then hydrate from live documents so uses / quantity /
            // depleted match a full UI refresh (flags alone are often stale for those fields).
            let state = await this.persistenceManager.loadState();
            if (typeof this.persistenceManager.hydrateState === 'function') {
                state = await this.persistenceManager.hydrateState(state);
                this.persistenceManager.state = state;
            }

            const gridData = state.hotbar.grids[gridIndex];
            if (!gridData) return;

            const hotbar = this.hotbarApp.components.hotbar;
            const gridContainer = hotbar.gridContainers[gridIndex];

            if (gridContainer) {
                gridContainer.items = gridData.items;
                await gridContainer.render();

                // Slot/focus gray-out that is not always stored on cell data
                this._refreshDepletionStates();
            }
        } catch (e) {
            Logger.warn(`Failed to update grid container ${gridIndex}:`, e);
        }
    }

    /**
     * Ask the active adapter to recompute depleted/grayed cell visuals.
     * @private
     */
    _refreshDepletionStates() {
        const adapter = this._getAdapter();
        const actor = this.hotbarApp?.currentActor;
        if (!adapter?.updateCellDepletionStates || !actor) return;

        queueMicrotask(() => {
            try {
                adapter.updateCellDepletionStates(actor, { _force: true });
            } catch (e) {
                Logger.warn('updateCellDepletionStates after grid refresh failed:', e);
            }
        });
    }

    /**
     * Handle item creation hook
     * @param {Item} item - The created item
     * @param {Object} options - Creation options
     * @param {string} userId - User ID who created the item
     */
    async _handleItemCreate(item, options, userId) {
        // Skip if caller explicitly requests it (e.g., system modules that want to skip auto-add)
        if (options?.noBG3AutoAdd) return;

        // Only process if this user created the item
        if (game.user.id !== userId) return;

        // Get the actor that received the item
        const itemActor = item.parent;
        if (!itemActor) return;

        Logger.debug(`Item created: "${item.name}" (${item.type}) for actor ${itemActor.name}`);

        // Add a small delay to ensure the item is fully processed
        await new Promise(resolve => setTimeout(resolve, 50));

        // Update hotbar data for the actor that received the item (regardless of current selection)
        await this._updateHotbarForActor(itemActor, item, 'create');

        // If this is the currently selected token, also update the UI
        const currentActor = this.hotbarApp?.currentActor;

        if (currentActor && currentActor.id === itemActor.id && this.hotbarApp?.rendered) {
            try {
                // Find which grid the item was added to
                const existingLocation = this.persistenceManager.findUuidInHud(item.uuid);
                if (existingLocation && existingLocation.container === 'hotbar') {
                    // Update only the affected grid container
                    await this._updateGridContainer(existingLocation.containerIndex);
                } else {
                    // Item wasn't added (maybe no space), but check if we need to update anyway
                    // Try to find which grid it should have been added to
                    const gridIndex = this._findAppropriateGrid(item);
                    if (gridIndex !== null) {
                        await this._updateGridContainer(gridIndex);
                    }
                }
            } catch (e) {
                Logger.warn('UI update on item create failed:', e);
            }
        }
    }

    /**
     * Handle item update hook
     * @param {Item} item - The updated item
     * @param {Object} changes - The changes made
     * @param {Object} options - Update options
     * @param {string} userId - User ID who updated the item
     */
    async _handleItemUpdate(item, changes, options, userId) {
        // Skip if caller explicitly requests it
        if (options?.noBG3AutoAdd) return;

        // Get the actor that owns the item
        const itemActor = item.parent;
        if (!itemActor) return;

        // Only process if this user updated the item
        if (game.user.id !== userId) return;

        // Skip if only equipped state changed (cosmetic change)
        if (changes.system && Object.keys(changes.system).length === 1 && changes.system.hasOwnProperty('equipped')) {
            return;
        }

        const adapter = this._getAdapter();
        // Without an adapter membership hook, leave in-HUD refresh to UpdateCoordinator
        if (!adapter || typeof adapter.resolveHotbarMembershipOnItemUpdate !== 'function') {
            return;
        }

        let membership = null;
        try {
            membership = await adapter.resolveHotbarMembershipOnItemUpdate(item, itemActor);
        } catch (error) {
            Logger.error('resolveHotbarMembershipOnItemUpdate failed:', error);
            return;
        }

        // Only touch persistence/UI on real membership transitions
        if (membership !== 'add' && membership !== 'remove') {
            return;
        }

        // Cheap presence check so prepared-spell updates do not rewrite state every time
        const probe = PersistenceManager.forActor(itemActor);
        await probe.loadState();
        const existing = probe.findUuidInHud(item.uuid);
        if (membership === 'add' && existing) return;
        if (membership === 'remove' && !existing) return;

        Logger.debug(`Item membership update (${membership}): "${item.name}" for actor ${itemActor.name}`);

        const currentActor = this.hotbarApp?.currentActor;
        const isCurrentActor = !!(currentActor && currentActor.id === itemActor.id && this.hotbarApp?.rendered);
        const wasInHotbar = isCurrentActor
            ? this.persistenceManager.findUuidInHud(item.uuid)
            : null;

        await this._updateHotbarForActor(itemActor, item, 'update');

        if (isCurrentActor) {
            try {
                // tempPersistence wrote flags; refresh the live manager before reading locations / grids
                await this.persistenceManager.loadState();
                const newLocation = this.persistenceManager.findUuidInHud(item.uuid);
                const gridIndex = newLocation?.container === 'hotbar'
                    ? newLocation.containerIndex
                    : (wasInHotbar?.container === 'hotbar' ? wasInHotbar.containerIndex : null);

                if (gridIndex !== null && gridIndex !== undefined) {
                    await this._updateGridContainer(gridIndex);
                }
            } catch (e) {
                Logger.warn('UI update on item membership change failed:', e);
            }
        }
    }

    /**
     * Handle item deletion hook
     * @param {Item} item - The deleted item
     * @param {Object} options - Deletion options
     * @param {string} userId - User ID who deleted the item
     */
    async _handleItemDelete(item, options, userId) {
        // Skip if caller explicitly requests it
        if (options?.noBG3AutoAdd) return;

        // Only process if this user deleted the item
        if (game.user.id !== userId) return;

        // Get the actor that lost the item
        const itemActor = item.parent;
        if (!itemActor) return;

        Logger.debug(`Item deleted: "${item.name}" (${item.type}) from actor ${itemActor.name}`);

        // Check current location before deletion
        const currentActor = this.hotbarApp?.currentActor;
        const wasInHotbar = currentActor && currentActor.id === itemActor.id && this.hotbarApp?.rendered
            ? this.persistenceManager.findUuidInHud(item.uuid)
            : null;

        // Update hotbar data for the actor that lost the item (regardless of current selection)
        await this._updateHotbarForActor(itemActor, item, 'delete');

        // If this is the currently selected token, also clean up the UI
        if (currentActor && currentActor.id === itemActor.id && this.hotbarApp?.rendered) {
            try {
                // Update the grid container where the item was located
                if (wasInHotbar && wasInHotbar.container === 'hotbar') {
                    await this._updateGridContainer(wasInHotbar.containerIndex);
                }
            } catch (e) {
                Logger.warn('UI update on item delete failed:', e);
            }
        }
    }
}


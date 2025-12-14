/**
 * Item Update Manager
 * Handles automatic hotbar population when items are created/updated/deleted on actors
 * Works with any actor (not just currently selected), updating their hotbar data in flags
 */
import { BG3HUD_REGISTRY } from '../utils/registry.js';
import { PersistenceManager } from './PersistenceManager.js';

export class ItemUpdateManager {
    constructor(options = {}) {
        this.hotbarApp = options.hotbarApp;
        this.persistenceManager = options.persistenceManager;
        this._registerHooks();
    }

    /**
     * Register Foundry hooks for item changes
     * @private
     */
    _registerHooks() {
        // Item creation
        Hooks.on('createItem', this._handleItemCreate.bind(this));

        // Item updates
        Hooks.on('updateItem', this._handleItemUpdate.bind(this));

        // Item deletion
        Hooks.on('deleteItem', this._handleItemDelete.bind(this));
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

        // Create a temporary persistence manager to work with this actor's data
        const tempPersistence = new PersistenceManager();

        // Resolve token context: for unlinked (synthetic) actors, use their own token id
        let targetToken = null;
        if (actor.isToken && actor.token?.id) {
            targetToken = canvas.tokens.get(actor.token.id);
        } else {
            // Linked actor: prefer a linked token, otherwise any matching token
            for (const token of canvas.tokens.placeables) {
                if (token.actor?.id === actor.id) {
                    targetToken = token;
                    if (token.document.actorLink) break; // Prefer linked tokens
                }
            }
        }

        // Set token in persistence manager (null if no token found)
        tempPersistence.setToken(targetToken);

        // Load the actor's current hotbar data
        const state = await tempPersistence.loadState();

        if (action === 'create' && await this._shouldAddItemToHotbar(item)) {
            await this._addItemToActorHotbar(tempPersistence, state, item, actor);
        } else if (action === 'delete') {
            await this._removeItemFromActorHotbar(tempPersistence, state, item, actor);
        } else if (action === 'update') {
            await this._updateItemInActorHotbar(tempPersistence, state, item, actor);
        }

        // Sync current state to active view before saving
        tempPersistence._syncCurrentStateToActiveView(state);

        // Save the updated data back to the actor
        await tempPersistence.saveState(state);

        console.log(`BG3 HUD Core | Updated hotbar data for actor "${actor.name}" (action: ${action}, item: "${item.name}")`);
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
            console.log(`BG3 HUD Core | Skipping "${item.name}" - already exists in ${existingLocation.container} grid ${existingLocation.containerIndex}`);
            return;
        }

        // Find the appropriate grid for this item type
        const gridIndex = this._findAppropriateGrid(item);
        if (gridIndex === null) {
            console.log(`BG3 HUD Core | No appropriate grid found for "${item.name}" (${item.type})`);
            return;
        }

        const grid = state.hotbar.grids[gridIndex];
        if (!grid) {
            console.warn(`BG3 HUD Core | Grid ${gridIndex} does not exist`);
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
                // Fallback: basic transformation
                cellData = {
                    uuid: item.uuid,
                    name: item.name,
                    img: item.img,
                    type: item.type
                };
            }

            if (cellData) {
                // Add the item to the hotbar data
                grid.items[slotKey] = cellData;

                console.log(`BG3 HUD Core | Auto-added item "${item.name}" (${item.type}) to actor "${actor.name}" grid ${gridIndex + 1} at slot ${slotKey}`);
            }
        } else {
            console.log(`BG3 HUD Core | No available slots in grid ${gridIndex + 1} for "${item.name}" on actor "${actor.name}"`);
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
                    console.log(`BG3 HUD Core | Removed "${item.name}" from actor "${actor.name}" hotbar`);
                }
            }
        }

        // Remove from weapon sets
        for (const set of state.weaponSets.sets) {
            for (const [slotKey, slotItem] of Object.entries(set.items || {})) {
                if (slotItem && slotItem.uuid === item.uuid) {
                    delete set.items[slotKey];
                    removed = true;
                    console.log(`BG3 HUD Core | Removed "${item.name}" from actor "${actor.name}" weapon set`);
                }
            }
        }

        // Remove from quick access
        for (const grid of state.quickAccess.grids || []) {
            for (const [slotKey, slotItem] of Object.entries(grid.items || {})) {
                if (slotItem && slotItem.uuid === item.uuid) {
                    delete grid.items[slotKey];
                    removed = true;
                    console.log(`BG3 HUD Core | Removed "${item.name}" from actor "${actor.name}" quick access`);
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

        // Handle spell preparation state changes (D&D 5e specific, but adapter-agnostic)
        if (item.type === 'spell') {
            // Check if adapter has spell preparation enforcement logic
            // If adapter provides it, use it; otherwise default to checking preparation state
            let shouldEnforcePreparation = true; // Default to checking preparation

            if (adapter && typeof adapter.shouldEnforceSpellPreparation === 'function') {
                shouldEnforcePreparation = adapter.shouldEnforceSpellPreparation(actor);
            }

            if (shouldEnforcePreparation) {
                const method = item.system?.method ?? item.system?.preparation?.mode;
                const prepared = item.system?.prepared ?? item.system?.preparation?.prepared;

                // Remove if unprepared prepared-spell
                if (!prepared && method === 'prepared') {
                    await this._removeItemFromActorHotbar(persistenceManager, state, item, actor);
                    return;
                }

                // Add if newly prepared or has valid casting mode
                if (prepared || ['pact', 'apothecary', 'atwill', 'innate', 'ritual', 'always'].includes(method)) {
                    const existingLocation = persistenceManager.findUuidInHud(item.uuid);
                    if (!existingLocation) {
                        // Item is now prepared but not in hotbar, add it
                        await this._addItemToActorHotbar(persistenceManager, state, item, actor);
                        return;
                    }
                }
            }
        }

        // For other updates, ensure the item data is current
        // The UUID should remain the same, but we can refresh the cell data
        const existingLocation = persistenceManager.findUuidInHud(item.uuid);
        if (existingLocation && existingLocation.container === 'hotbar') {
            const grid = state.hotbar.grids[existingLocation.containerIndex];
            if (grid && grid.items[existingLocation.slotKey]) {
                // Refresh cell data with latest item data
                let cellData;
                if (adapter && typeof adapter.transformItemToCellData === 'function') {
                    cellData = await adapter.transformItemToCellData(item);
                } else {
                    cellData = {
                        uuid: item.uuid,
                        name: item.name,
                        img: item.img,
                        type: item.type
                    };
                }

                if (cellData) {
                    grid.items[existingLocation.slotKey] = cellData;
                }
            }
        }

        console.log(`BG3 HUD Core | Updated item "${item.name}" in actor "${actor.name}" hotbar data`);
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
     * Checks adapter's shouldAutoAddItem and shouldBlockFromHotbar
     * @param {Item} item - The item to check
     * @returns {boolean} - Whether the item should be added
     */
    async _shouldAddItemToHotbar(item) {
        const adapter = this._getAdapter();

        // Check if adapter explicitly blocks this item (e.g., CPR items)
        if (adapter && typeof adapter.shouldBlockFromHotbar === 'function') {
            const blockResult = await adapter.shouldBlockFromHotbar(item);
            if (blockResult?.blocked) {
                console.log(`BG3 HUD Core | Blocking item "${item.name}" from auto-add: ${blockResult.reason || 'adapter blocked'}`);
                return false;
            }
        }

        // Check if adapter has custom logic
        if (adapter && typeof adapter.shouldAutoAddItem === 'function') {
            return adapter.shouldAutoAddItem(item);
        }

        // Default: check if the item has activities or activation type
        const activities = item.system?.activities;
        const hasActivities = (activities instanceof Map && activities.size > 0) ||
            (item.system?.activation?.type && item.system?.activation?.type !== 'none');

        // Check if adapter has noActivityAutoPopulate setting (safely)
        let noActivityAutoPopulate = false;
        if (adapter && adapter.MODULE_ID) {
            try {
                // Try to get the setting - will throw if it doesn't exist
                noActivityAutoPopulate = game.settings.get(adapter.MODULE_ID, 'noActivityAutoPopulate');
            } catch (e) {
                // Setting doesn't exist, use default (false)
                noActivityAutoPopulate = false;
            }
        }

        if (hasActivities || noActivityAutoPopulate) {
            return true;
        }

        return false;
    }

    /**
     * Update a specific grid container in the UI
     * @param {number} gridIndex - The grid index to update
     * @private
     */
    async _updateGridContainer(gridIndex) {
        if (!this.hotbarApp?.rendered || !this.hotbarApp?.components?.hotbar) return;

        try {
            // Load current state
            const state = await this.persistenceManager.loadState();
            const gridData = state.hotbar.grids[gridIndex];

            if (!gridData) return;

            const hotbar = this.hotbarApp.components.hotbar;
            const gridContainer = hotbar.gridContainers[gridIndex];

            if (gridContainer) {
                // Update the grid container's items and re-render
                gridContainer.items = gridData.items;
                await gridContainer.render();
            }
        } catch (e) {
            console.warn(`BG3 HUD Core | Failed to update grid container ${gridIndex}:`, e);
        }
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

        console.log(`BG3 HUD Core | Item created: "${item.name}" (${item.type}) for actor ${itemActor.name}`);

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
                console.warn('BG3 HUD Core | UI update on item create failed:', e);
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

        console.log(`BG3 HUD Core | Item updated: "${item.name}" (${item.type}) for actor ${itemActor.name}`);

        // Check current location before update (for spell preparation changes)
        const currentActor = this.hotbarApp?.currentActor;
        const wasInHotbar = currentActor && currentActor.id === itemActor.id && this.hotbarApp?.rendered
            ? this.persistenceManager.findUuidInHud(item.uuid)
            : null;

        // Update hotbar data for the actor (regardless of current selection)
        await this._updateHotbarForActor(itemActor, item, 'update');

        // If this is the currently selected token, also update the UI
        if (currentActor && currentActor.id === itemActor.id && this.hotbarApp?.rendered) {
            try {
                // Check new location after update
                const newLocation = this.persistenceManager.findUuidInHud(item.uuid);

                if (newLocation && newLocation.container === 'hotbar') {
                    // Item is in hotbar - update that grid
                    await this._updateGridContainer(newLocation.containerIndex);
                } else if (wasInHotbar && wasInHotbar.container === 'hotbar') {
                    // Item was removed from hotbar (e.g., unprepared spell) - update the grid it was in
                    await this._updateGridContainer(wasInHotbar.containerIndex);
                } else if (!wasInHotbar && !newLocation) {
                    // Item might have been added - check appropriate grid
                    const gridIndex = this._findAppropriateGrid(item);
                    if (gridIndex !== null) {
                        await this._updateGridContainer(gridIndex);
                    }
                }
            } catch (e) {
                console.warn('BG3 HUD Core | UI update on item update failed:', e);
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

        console.log(`BG3 HUD Core | Item deleted: "${item.name}" (${item.type}) from actor ${itemActor.name}`);

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
                console.warn('BG3 HUD Core | UI update on item delete failed:', e);
            }
        }
    }
}


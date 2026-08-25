import { Logger } from '../utils/logger.js';

/** Foundry document cell types resolved via fromUuid during populate. */
const DOCUMENT_CELL_TYPES = new Set(['Item', 'Macro', 'Activity', 'PreparedSpell']);

/**
 * Auto Populate Framework
 * System-agnostic framework for populating containers with items
 * Adapters must extend this to provide system-specific logic
 */
export class AutoPopulateFramework {
    /**
     * Whether a populate entry is a pre-built adapter cell (e.g. CrucibleAction, Strike).
     * @param {object} item
     * @returns {boolean}
     */
    static isAdapterCellEntry(item) {
        return Boolean(item?.type && !DOCUMENT_CELL_TYPES.has(item.type));
    }
    /**
     * Show dialog and populate container based on user selection
     * @param {GridContainer} container - The container to populate
     * @param {Actor} actor - The actor whose items to populate from
     * @param {PersistenceManager} persistenceManager - Optional persistence manager for UUID checking
     * @returns {Promise<void>}
     */
    async populateContainer(container, actor, persistenceManager = null) {
        if (!actor) {
            ui.notifications.warn(game.i18n.localize('bg3-hud-core.Notifications.NoActorForAutoPopulate'));
            return;
        }

        try {
            // Get item type choices from adapter
            const choices = await this.getItemTypeChoices();

            if (!choices || choices.length === 0) {
                ui.notifications.warn(game.i18n.localize('bg3-hud-core.Notifications.NoItemTypesForAutoPopulate'));
                return;
            }

            // Show dialog and get user selection
            const selectedTypes = await this.showSelectionDialog(choices);

            if (!selectedTypes || selectedTypes.length === 0) {
                // User cancelled or selected nothing
                return;
            }

            // Get items from actor that match selected types
            const items = await this.getMatchingItems(actor, selectedTypes);

            if (items.length === 0) {
                ui.notifications.warn(game.i18n.localize('bg3-hud-core.Notifications.NoMatchingItems'));
                return;
            }

            // Sort items using the system's sort logic
            const sortedItems = await this.sortItems(items);

            // Add items to container
            const addedCount = await this.addItemsToContainer(sortedItems, container, persistenceManager);

        } catch (error) {
            Logger.error('AutoPopulate error:', error);
            ui.notifications.error(game.i18n.localize('bg3-hud-core.Notifications.AutoPopulateFailed'));
        }
    }

    /**
     * Get item type choices for selection dialog
     * Adapters MUST override this to provide system-specific choices
     * @returns {Promise<Array<{value: string, label: string}>>}
     */
    async getItemTypeChoices() {
        // Default: return empty array
        // Adapters should return array like:
        // [
        //   { value: 'weapon', label: 'Weapons' },
        //   { value: 'spell', label: 'Spells' },
        //   { value: 'consumable:potion', label: 'Potions' }
        // ]
        return [];
    }

    /**
     * Show selection dialog for item types
     * @param {Array<{value: string, label: string}>} choices - Available choices
     * @returns {Promise<Array<string>>} Selected type values
     */
    async showSelectionDialog(choices) {
        const { showPillSelectionDialog } = await import('../utils/dialogs.js');

        const result = await showPillSelectionDialog({
            title: 'Auto-Populate Container',
            description: 'Select item types to populate this container with.',
            choices
        });

        // Return empty array if cancelled (null) or undefined
        return result || [];
    }

    /**
     * Get items from actor that match selected types
     * Adapters MUST override this to provide system-specific filtering
     * @param {Actor} actor - The actor
     * @param {Array<string>} selectedTypes - Selected type values
     * @returns {Promise<Array<{uuid: string}>>}
     */
    async getMatchingItems(actor, selectedTypes) {
        // Default: return all items as uuid objects
        // Adapters should implement proper filtering logic
        const items = [];
        for (const item of actor.items) {
            items.push({ uuid: item.uuid });
        }
        return items;
    }

    /**
     * Sort items before adding to container
     * Uses the same sort logic as AutoSort if available
     * @param {Array<{uuid: string}>} items - Items to sort
     * @returns {Promise<Array<{uuid: string}>>}
     */
    async sortItems(items) {
        // Adapters with full cell data (CrucibleAction, Strike, etc.) use sortItems
        if (this.autoSort && typeof this.autoSort.sortItems === 'function') {
            const hasAdapterCells = items.some(i => AutoPopulateFramework.isAdapterCellEntry(i));
            if (hasAdapterCells) {
                await this.autoSort.enrichItemsForSort?.(items);
                await this.autoSort.sortItems(items);
                return items;
            }
        }

        // UUID-only entries use sortUuidEntries
        if (this.autoSort && typeof this.autoSort.sortUuidEntries === 'function') {
            return await this.autoSort.sortUuidEntries(items);
        }

        return items;
    }

    /**
     * Add items to container in grid order
     * Skips items that already exist in the HUD (across ALL containers)
     * Supports both uuid-based items and adapter-specific cell data (like Strikes)
     * @param {Array<Object>} items - Sorted items to add (uuid-based or custom cell data)
     * @param {GridContainer} container - Target container
     * @param {PersistenceManager} persistenceManager - Optional persistence manager for global UUID checking
     * @returns {Promise<number>} Number of items added
     */
    async addItemsToContainer(items, container, persistenceManager = null) {
        // Separate uuid-based items from adapter-specific cell data
        const uuidItems = [];
        const customCellData = [];

        for (const item of items) {
            if (AutoPopulateFramework.isAdapterCellEntry(item)) {
                if (persistenceManager?.findUuidInHud?.(item.uuid)) continue;
                customCellData.push(item);
                continue;
            }

            if (item.uuid) {
                if (persistenceManager?.findUuidInHud?.(item.uuid)) continue;

                let existsInContainer = false;
                for (const existingItem of Object.values(container.items)) {
                    if (existingItem?.uuid === item.uuid) {
                        existsInContainer = true;
                        break;
                    }
                }
                if (existsInContainer) continue;

                uuidItems.push(item);
            } else if (item.type) {
                customCellData.push(item);
            }
        }

        const allNewItems = [...uuidItems, ...customCellData];

        if (allNewItems.length === 0) {
            ui.notifications.info(game.i18n.localize('bg3-hud-core.Notifications.AllItemsAlreadyInHud'));
            return 0;
        }

        // Enrich uuid-based items with full data (name, img, uses, quantity, etc.)
        const enrichedItems = [];

        // Process uuid-based items
        for (const item of uuidItems) {
            const itemData = await fromUuid(item.uuid);
            if (itemData) {
                // Try to use adapter's transformation if available
                let cellData;
                const adapter = ui.BG3HOTBAR?.registry?.activeAdapter;
                if (adapter && typeof adapter.transformItemToCellData === 'function') {
                    cellData = await adapter.transformItemToCellData(itemData);
                } else {
                    // Fallback: canonical cell type (never system subtypes like 'spell')
                    cellData = {
                        uuid: item.uuid,
                        name: itemData.name,
                        img: itemData.img,
                        type: 'Item'
                    };
                }

                if (cellData) {
                    enrichedItems.push(cellData);
                }
            }
        }

        // Add custom cell data directly (already enriched by adapter)
        enrichedItems.push(...customCellData);

        // Find empty slots and add items
        let addedCount = 0;
        let itemIndex = 0;
        const cols = container.cols || 5;
        const rows = container.rows || 3;

        for (let r = 0; r < rows && itemIndex < enrichedItems.length; r++) {
            for (let c = 0; c < cols && itemIndex < enrichedItems.length; c++) {
                const slotKey = `${c}-${r}`;

                // If slot is empty, add item
                if (!container.items[slotKey]) {
                    container.items[slotKey] = enrichedItems[itemIndex];
                    addedCount++;
                    itemIndex++;
                }
            }
        }

        // Re-render container
        if (container.render) {
            await container.render();
        }

        return addedCount;
    }

    /**
     * Link to AutoSort instance for consistent sorting
     * @param {AutoSortFramework} autoSort - AutoSort instance
     */
    setAutoSort(autoSort) {
        this.autoSort = autoSort;
    }

    /**
     * Auto-populate on token creation
     * Called when a new token is created on the canvas
     * @param {Actor} actor - The actor for the newly created token
     * @param {Object} configuration - Configuration object {grid0: [], grid1: [], grid2: []}
     * @param {PersistenceManager} persistenceManager - Persistence manager
     * @returns {Promise<void>}
     */
    async populateOnTokenCreation(actor, configuration, persistenceManager) {
        if (!actor || !configuration) {
            return;
        }

        try {
            // Build initial HUD state with populated items per grid
            await this._populateInitialStateByGrid(configuration, actor, persistenceManager);
        } catch (error) {
            Logger.error('Error auto-populating on token creation:', error);
        }
    }

    /**
     * Populate initial HUD state with items assigned to specific grids
     * @param {Object} configuration - Configuration object {grid0: [], grid1: [], grid2: []}
     * @param {Actor} actor - The actor
     * @param {PersistenceManager} persistenceManager - Persistence manager
     * @private
     */
    async _populateInitialStateByGrid(configuration, actor, persistenceManager) {

        // Bind to actor before any async work — never use GM hotbar for token creation populate
        persistenceManager.setToken(actor);
        const state = await persistenceManager.loadState();

        if (persistenceManager.isAutoPopulateComplete(state)) {
            return;
        }

        let itemsAdded = 0;

        // Process each configured grid
        for (let gridIndex = 0; gridIndex < 3; gridIndex++) {
            const gridKey = `grid${gridIndex}`;
            const itemTypes = configuration[gridKey];

            if (!itemTypes || itemTypes.length === 0) {
                continue; // Skip grids with no configured types
            }

            // Ensure grid exists
            if (!state.hotbar.grids[gridIndex]) {
                Logger.warn(`Grid ${gridIndex} does not exist, skipping`);
                continue;
            }

            const grid = state.hotbar.grids[gridIndex];

            // Get items matching the configured types for this grid
            const options = configuration.options || {};
            const items = await this.getMatchingItems(actor, itemTypes, options);

            if (items.length === 0) {
                continue; // No items to populate
            }

            // Sort items
            const sortedItems = await this.sortItems(items);

            // Separate uuid-based items from custom cell data
            const uuidItems = [];
            const customCellData = [];

            for (const item of sortedItems) {
                if (AutoPopulateFramework.isAdapterCellEntry(item)) {
                    if (!persistenceManager?.findUuidInHud?.(item.uuid)) customCellData.push(item);
                } else if (item.uuid) {
                    if (!persistenceManager?.findUuidInHud?.(item.uuid)) uuidItems.push(item);
                } else if (item.type) {
                    customCellData.push(item);
                }
            }

            if (uuidItems.length === 0 && customCellData.length === 0) continue;

            // Enrich uuid-based items with full data
            const enrichedItems = [];
            for (const item of uuidItems) {
                const itemData = await fromUuid(item.uuid);
                if (!itemData) continue;

                const adapter = ui.BG3HOTBAR?.registry?.activeAdapter;
                let cellData;

                // Check if this is an Activity (from getMatchingItems with includeActivities)
                if (item.type === 'Activity' && adapter?.transformActivityToCellData) {
                    cellData = await adapter.transformActivityToCellData(itemData);
                } else if (adapter?.transformItemToCellData) {
                    cellData = await adapter.transformItemToCellData(itemData);
                } else {
                    // Fallback: canonical cell type (never system subtypes like 'spell')
                    cellData = {
                        uuid: item.uuid,
                        name: itemData.name,
                        img: itemData.img,
                        type: 'Item'
                    };
                }

                if (cellData) enrichedItems.push(cellData);
            }

            // Add custom cell data directly (already enriched by adapter)
            enrichedItems.push(...customCellData);

            // Populate this grid with items
            const cols = grid.cols || 5;
            const rows = grid.rows || 1;
            let itemIndex = 0;

            for (let r = 0; r < rows && itemIndex < enrichedItems.length; r++) {
                for (let c = 0; c < cols && itemIndex < enrichedItems.length; c++) {
                    const slotKey = `${c}-${r}`;

                    // Only populate empty slots
                    if (!grid.items[slotKey]) {
                        grid.items[slotKey] = enrichedItems[itemIndex];
                        itemIndex++;
                        itemsAdded++;
                    }
                }
            }

            if (itemsAdded > 0) {
                persistenceManager.markAutoPopulateComplete(state);
            }

            // Save state after each grid
            await persistenceManager.saveState(state);

            // Delay before next grid (50ms between grids)
            // Only delay if not the last grid (gridIndex 0 or 1, not 2)
            if (gridIndex < 2) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
    }

    /**
     * Show configuration dialog for auto-populate settings
     * @returns {Promise<Object|null>} Configuration object or null if cancelled
     */
    async showConfigDialog() {
        const { showAutoPopulateConfigDialog } = await import('../utils/dialogs.js');

        const choices = await this.getItemTypeChoices();
        if (!choices || choices.length === 0) {
            ui.notifications.warn(game.i18n.localize('bg3-hud-core.Notifications.NoItemTypesForConfig'));
            return null;
        }

        // Get current settings (adapter should provide this)
        const currentSettings = this.getAutoPopulateSettings ? await this.getAutoPopulateSettings() : {
            grid0: [], grid1: [], grid2: [], options: {}
        };

        return await showAutoPopulateConfigDialog({
            title: 'Auto-Populate Configuration',
            choices,
            configuration: currentSettings
        });
    }
}


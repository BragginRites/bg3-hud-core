/**
 * Auto Populate Framework
 * System-agnostic framework for populating containers with items
 * Adapters must extend this to provide system-specific logic
 */
export class AutoPopulateFramework {
    /**
     * Show dialog and populate container based on user selection
     * @param {GridContainer} container - The container to populate
     * @param {Actor} actor - The actor whose items to populate from
     * @param {PersistenceManager} persistenceManager - Optional persistence manager for UUID checking
     * @returns {Promise<void>}
     */
    async populateContainer(container, actor, persistenceManager = null) {
        if (!actor) {
            ui.notifications.warn('No actor available for auto-populate');
            return;
        }

        try {
            // Get item type choices from adapter
            const choices = await this.getItemTypeChoices();
            
            if (!choices || choices.length === 0) {
                ui.notifications.warn('No item types available for auto-populate');
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
                ui.notifications.warn('No matching items found');
                return;
            }

            // Sort items using the system's sort logic
            const sortedItems = await this.sortItems(items);

            // Add items to container
            const addedCount = await this.addItemsToContainer(sortedItems, container, persistenceManager);

        } catch (error) {
            console.error('BG3 HUD Core | AutoPopulate error:', error);
            ui.notifications.error('Failed to auto-populate container');
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
        const { AutoPopulateDialog } = await import('../components/ui/AutoPopulateDialog.js');
        
        const dialog = new AutoPopulateDialog({
            title: 'Auto-Populate Container',
            choices: choices
        });

        return await dialog.render();
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
        // If adapter has autoSort, use its sortUuidEntries helper
        if (this.autoSort && typeof this.autoSort.sortUuidEntries === 'function') {
            return await this.autoSort.sortUuidEntries(items);
        }
        
        // Otherwise, return unsorted
        return items;
    }

    /**
     * Add items to container in grid order
     * Skips items that already exist in the HUD (across ALL containers)
     * @param {Array<{uuid: string}>} items - Sorted items to add
     * @param {GridContainer} container - Target container
     * @param {PersistenceManager} persistenceManager - Optional persistence manager for global UUID checking
     * @returns {Promise<number>} Number of items added
     */
    async addItemsToContainer(items, container, persistenceManager = null) {
        // Filter out items that already exist in the HUD (global check)
        const newItems = [];
        
        for (const item of items) {
            if (!item.uuid) continue;
            
            // If we have persistence manager, check entire HUD for duplicates
            if (persistenceManager && typeof persistenceManager.findUuidInHud === 'function') {
                const existingLocation = persistenceManager.findUuidInHud(item.uuid);
                if (existingLocation) {
                    console.log(`BG3 HUD Core | AutoPopulate: Skipping ${item.uuid} - already exists at ${existingLocation.container}[${existingLocation.containerIndex}].${existingLocation.slotKey}`);
                    continue;
                }
            } else {
                // Fallback: only check current container
                let existsInContainer = false;
                for (const [key, existingItem] of Object.entries(container.items)) {
                    if (existingItem?.uuid === item.uuid) {
                        existsInContainer = true;
                        break;
                    }
                }
                if (existsInContainer) {
                    continue;
                }
            }
            
            newItems.push(item);
        }
        
        if (newItems.length === 0) {
            ui.notifications.info('All selected items are already in the HUD');
            return 0;
        }

        // Enrich items with full data (name, img, etc.)
        const enrichedItems = [];
        for (const item of newItems) {
            const itemData = await fromUuid(item.uuid);
            if (itemData) {
                enrichedItems.push({
                    uuid: item.uuid,
                    name: itemData.name,
                    img: itemData.img,
                    type: itemData.type
                });
            }
        }

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
}


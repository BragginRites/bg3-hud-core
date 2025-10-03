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
     * @returns {Promise<void>}
     */
    async populateContainer(container, actor) {
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
            const addedCount = await this.addItemsToContainer(sortedItems, container);

            if (addedCount > 0) {
                ui.notifications.info(`Added ${addedCount} item${addedCount > 1 ? 's' : ''} to container`);
            } else {
                ui.notifications.warn('No items could be added (container may be full or items already present)');
            }

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
     * Skips items that already exist in the container
     * @param {Array<{uuid: string}>} items - Sorted items to add
     * @param {GridContainer} container - Target container
     * @returns {Promise<number>} Number of items added
     */
    async addItemsToContainer(items, container) {
        // Get existing UUIDs to prevent duplicates
        const existingUuids = new Set();
        for (const [key, item] of Object.entries(container.items)) {
            if (item && item.uuid) {
                existingUuids.add(item.uuid);
            }
        }

        // Filter out items that already exist
        const newItems = items.filter(item => !existingUuids.has(item.uuid));
        
        if (newItems.length === 0) {
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


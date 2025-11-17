/**
 * Auto Sort Framework
 * System-agnostic framework for sorting container items
 * Adapters must extend this to provide system-specific sort logic
 */
export class AutoSortFramework {
    /**
     * Sort a container's items
     * @param {GridContainer} container - The container to sort
     * @returns {Promise<void>}
     */
    async sortContainer(container) {
        if (!container?.items) {
            console.warn('BG3 HUD Core | AutoSort: No container or items to sort');
            return;
        }

        try {
            // Convert items object to array for sorting
            const items = [];
            
            // First pass: collect only valid items (with a real uuid)
            for (const [key, rawItem] of Object.entries(container.items)) {
                if (!rawItem || !rawItem.uuid || typeof rawItem.uuid !== "string") continue;
                items.push({
                    key,
                    ...rawItem
                });
            }

            if (items.length === 0) {
                ui.notifications.warn('No items to sort');
                return;
            }

            // Enrich items with system-specific data needed for sorting
            await this.enrichItemsForSort(items);

            // Sort items using system-specific logic
            await this.sortItems(items);

            // Rearrange items in grid
            await this.rearrangeGrid(items, container);

        } catch (error) {
            console.error('BG3 HUD Core | AutoSort error:', error);
            ui.notifications.error('Failed to sort container. See console for details.');
        }
    }

    /**
     * Enrich items with system-specific data needed for sorting
     * Adapters should override this to fetch/compute sort data
     * @param {Array<Object>} items - Array of items to enrich
     * @returns {Promise<void>}
     */
    async enrichItemsForSort(items) {
        // Default: try to fetch basic item data
        for (const item of items) {
            try {
                if (!item.uuid) continue;
                const itemData = await fromUuid(item.uuid);
                if (itemData) {
                    item.name = itemData.name;
                    item.type = itemData.type;
                    item.sortData = {
                        name: itemData.name
                    };
                }
            } catch (error) {
                console.warn(`BG3 HUD Core | Failed to fetch item data for ${item.uuid}:`, error);
                item.sortData = { name: item.name || '' };
            }
        }
    }

    /**
     * Sort items array in place
     * Adapters MUST override this with system-specific sort logic
     * @param {Array<Object>} items - Array of items to sort
     * @returns {Promise<void>}
     */
    async sortItems(items) {
        // Default: alphabetical by name
        items.sort((a, b) => {
            const nameA = a.sortData?.name || a.name || '';
            const nameB = b.sortData?.name || b.name || '';
            return nameA.localeCompare(nameB);
        });
    }

    /**
     * Rearrange items in the grid after sorting
     * This is system-agnostic grid placement logic
     * @param {Array<Object>} items - Sorted items array
     * @param {GridContainer} container - The container to rearrange
     * @returns {Promise<void>}
     */
    async rearrangeGrid(items, container) {
        // Clear container items
        container.items = {};

        // Re-add items in sorted order
        let r = 0;
        let c = 0;
        const cols = container.cols || 5;
        const rows = container.rows || 3;

        for (const item of items) {
            // Stop if we've run out of grid space
            if (r >= rows) break;
            
            const slotKey = `${c}-${r}`;
            if (item.uuid) {
                // Preserve ALL original item data, just update the position
                // Remove internal properties used for sorting
                const { key, sortData, ...cellData } = item;
                container.items[slotKey] = cellData;
            }

            // Move to next position (left to right, then down)
            c++;
            if (c >= cols) {
                c = 0;
                r++;
            }
        }

        // Re-render container
        if (container.render) {
            await container.render();
        }
    }

    /**
     * Helper: Sort an array of UUID entries
     * Useful for auto-populate and other features
     * @param {Array<string|{uuid:string}>} entries - UUID strings or objects with uuid property
     * @returns {Promise<Array<{uuid:string}>>}
     */
    async sortUuidEntries(entries) {
        if (!Array.isArray(entries) || entries.length === 0) return [];

        // Normalize to array of { uuid }
        const normalized = entries
            .map((e) => (typeof e === 'string' ? { uuid: e } : e))
            .filter((e) => e && typeof e.uuid === 'string' && e.uuid.length > 0);

        // Enrich with sort data
        await this.enrichItemsForSort(normalized);

        // Sort in place
        await this.sortItems(normalized);

        // Return minimal objects in sorted order
        return normalized.map((e) => ({ uuid: e.uuid }));
    }
}


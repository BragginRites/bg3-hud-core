import { Logger } from '../utils/logger.js';
import { fillGridRowMajor } from './gridFill.js';

/**
 * Build a comparator for `Array.prototype.sort` that orders items by a type-priority list,
 * then (on a type tie) by an optional per-type secondary key, then alphabetically by name.
 *
 * This is the shape every adapter's `sortItems()` hand-wrote independently: look up each
 * item's type in a priority list (unknown types sort last), break ties within a type using
 * type-specific data (a number like spell level/action cost, or a string like feature
 * category), and finally fall back to `localeCompare` on name.
 *
 * @param {Array<string>} typeOrder - Type values in priority order. A type not in this list
 *   sorts after every listed type (both adapters' original hand-written comparators treated
 *   an unknown type as "last", and this preserves that).
 * @param {Object<string, (item: Object) => (number|string)>} [secondaryKeyFns] - Optional map
 *   of type -> function extracting a comparable secondary-sort value for items of that type.
 *   Numeric values are compared numerically; anything else is compared via `localeCompare`.
 *   Types without an entry here fall straight through to the name comparison.
 * @param {Object} [options]
 * @param {(item: Object) => string} [options.getType] - Extracts the type to look up in
 *   `typeOrder`. Defaults to `item.type`.
 * @param {(item: Object) => string} [options.getName] - Extracts the name used for the final
 *   alphabetical fallback (and ties within a secondary key). Defaults to `item.name || ''`.
 * @returns {(a: Object, b: Object) => number}
 */
export function compareByTypeThenKey(typeOrder, secondaryKeyFns = {}, options = {}) {
    const getType = options.getType || ((item) => item.type);
    const getName = options.getName || ((item) => item.name || '');

    return (a, b) => {
        const typeA = getType(a);
        const typeB = getType(b);
        const indexA = typeOrder.indexOf(typeA);
        const indexB = typeOrder.indexOf(typeB);

        if (indexA !== indexB) {
            if (indexA === -1) return 1;  // Unknown types go to the end
            if (indexB === -1) return -1;
            return indexA - indexB;
        }

        const secondaryKeyFn = secondaryKeyFns[typeA];
        if (secondaryKeyFn) {
            const secondaryA = secondaryKeyFn(a);
            const secondaryB = secondaryKeyFn(b);
            if (secondaryA !== secondaryB) {
                if (typeof secondaryA === 'number' && typeof secondaryB === 'number') {
                    return secondaryA - secondaryB;
                }
                return String(secondaryA).localeCompare(String(secondaryB));
            }
        }

        return getName(a).localeCompare(getName(b));
    };
}

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
            Logger.warn('AutoSort: No container or items to sort');
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
                ui.notifications.warn(game.i18n.localize('bg3-hud-core.Notifications.NoItemsToSort'));
                return;
            }

            // Enrich items with system-specific data needed for sorting
            await this.enrichItemsForSort(items);

            // Sort items using system-specific logic
            await this.sortItems(items);

            // Rearrange items in grid
            await this.rearrangeGrid(items, container);

        } catch (error) {
            Logger.error('AutoSort error:', error);
            ui.notifications.error(game.i18n.localize('bg3-hud-core.Notifications.SortContainerFailed'));
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
                Logger.warn(`Failed to fetch item data for ${item.uuid}:`, error);
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

        const cols = container.cols || 5;
        const rows = container.rows || 3;

        // Container was just cleared, so every slot is free: no isOccupied/canPlace hook needed.
        const { placements } = fillGridRowMajor({ cols, rows }, items);

        for (const { slotKey, item } of placements) {
            if (item.uuid) {
                // Preserve ALL original item data, just update the position
                // Remove internal properties used for sorting
                const { key, sortData, ...cellData } = item;
                container.items[slotKey] = cellData;
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


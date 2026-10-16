/**
 * Shared grid-fill helper used by AutoSortFramework and AutoPopulateFramework.
 *
 * All three call sites in this module/the populate framework walk a grid row-major
 * (left-to-right, then down) and place pending items one per slot, differing only in
 * how (or whether) they reject a slot:
 *   - AutoSortFramework.rearrangeGrid: container was just cleared, so no slot is ever
 *     occupied and every attempt succeeds. Neither hook is needed.
 *   - AutoPopulateFramework.addItemsToContainer: a slot already holding a cell must be
 *     skipped (same item retried at the next slot), AND a slot that passes that check
 *     can still be rejected by the occupancy ledger (`occupy()`), which must also retry
 *     the same item at the next slot.
 *   - AutoPopulateFramework._populateInitialStateByGrid: slots were already pre-filtered
 *     upstream (via alreadyOnUseGrids), so there's no occupied-slot check, only the
 *     occupancy-ledger rejection.
 *
 * The row/column bookkeeping here is pure. The two hooks are where callers plug in their
 * own (possibly side-effecting, e.g. threading an occupancy map) accept/reject logic,
 * mirroring how `occupy()` already threads state through return values rather than
 * mutating shared state itself.
 *
 * @param {Object} config
 * @param {number} config.cols - Number of columns in the grid.
 * @param {number} config.rows - Number of rows in the grid.
 * @param {(slotKey: string) => boolean} [config.isOccupied] - Returns true when a slot is
 *   already taken and must be skipped WITHOUT consuming the next pending item (that item is
 *   retried at the next slot). Omit when the grid is known empty (e.g. just cleared).
 * @param {(slotKey: string, item: Object) => boolean} [config.canPlace] - Called once for a
 *   slot that passed `isOccupied`, with the next pending item. Return false to reject the
 *   placement (the same item is retried at the next slot) or true to accept it. Any side
 *   effect tied to a real placement attempt (occupying a map, etc.) belongs here, since this
 *   is the only hook invoked exactly once per attempt. Omit when every slot that passes
 *   `isOccupied` is automatically acceptable.
 * @param {Array<Object>} pendingItems - Items to place, in order.
 * @returns {{ placements: Array<{slotKey: string, item: Object}>, addedCount: number }}
 */
export function fillGridRowMajor({ cols, rows, isOccupied, canPlace } = {}, pendingItems) {
    const placements = [];
    let addedCount = 0;
    let itemIndex = 0;

    for (let r = 0; r < rows && itemIndex < pendingItems.length; r++) {
        for (let c = 0; c < cols && itemIndex < pendingItems.length; c++) {
            const slotKey = `${c}-${r}`;

            if (isOccupied && isOccupied(slotKey)) continue;

            const item = pendingItems[itemIndex];

            if (canPlace && !canPlace(slotKey, item)) continue;

            placements.push({ slotKey, item });
            addedCount++;
            itemIndex++;
        }
    }

    return { placements, addedCount };
}

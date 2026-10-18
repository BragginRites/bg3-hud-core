/**
 * This Slot holds this Cell. Occupy, clear, and move on an in-memory park map.
 * Foundry-free so tests hit this seam without a live HUD tree.
 */

export const OCCUPANCY_REFUSE = Object.freeze({
    WRONG_KIND: 'wrongKind',
    SAME_SET: 'sameSet',
    RESERVED: 'reserved',
    OCCUPIED: 'occupied',
    EMPTY_SOURCE: 'emptySource'
});

const OFF_HAND = '1-0';
const MAIN_HAND = '0-0';

export function cellIdentity(cell) {
    if (!cell || cell.isTwoHandedDuplicate) return null;
    if (cell.type === 'PreparedSpell' && cell.entryId != null) {
        return `prepared:${cell.entryId}:${cell.groupId}:${cell.slotId}`;
    }
    return cell.uuid ?? null;
}

export function alreadyOnUseGrids(map, cell, exclude = null) {
    const id = cellIdentity(cell);
    if (!id || !map) return false;
    return (
        scanGrids(map.hotbar?.grids, 'hotbar', id, exclude) ||
        scanGrids(map.quickAccess?.grids, 'quickAccess', id, exclude)
    );
}

/**
 * Park `cell` on `slot`. Does not clear any other universe.
 * @param {object} map
 * @param {{ container: string, containerIndex: number, slotKey: string }} slot
 * @param {object} cell
 * @param {{ isHeldItem?: Function, isTwoHanded?: Function, source?: 'outside' }} [opts]
 */
export function occupy(map, slot, cell, opts = {}) {
    const next = cloneMap(map);
    const reason = occupyMutate(next, slot, cell, opts);
    if (reason) return { ok: false, reason, map: next };
    return { ok: true, map: next };
}

export function clear(map, slot) {
    const next = cloneMap(map);
    writeSlot(next, slot, null);
    return { ok: true, map: next };
}

/**
 * HUD relocate: empty destination clears the source; occupied destination swaps.
 */
export function move(map, from, to, opts = {}) {
    if (sameSlot(from, to)) return { ok: true, map: cloneMap(map) };
    const next = cloneMap(map);
    const sourceCell = readSlot(next, from);
    if (!sourceCell || sourceCell.isTwoHandedDuplicate) {
        return { ok: false, reason: OCCUPANCY_REFUSE.EMPTY_SOURCE, map: next };
    }
    const destCell = readSlot(next, to);
    const destOccupant = destCell?.isTwoHandedDuplicate ? null : destCell;

    if (!destOccupant) {
        const reason = occupyMutate(next, to, sourceCell, opts);
        if (reason) return { ok: false, reason, map: next };
        writeSlot(next, from, null);
        return { ok: true, map: next };
    }

    const toReason = wouldRefuse(next, to, sourceCell, opts, from);
    if (toReason) return { ok: false, reason: toReason, map: next };
    const fromReason = wouldRefuse(next, from, destOccupant, opts, to);
    if (fromReason) return { ok: false, reason: fromReason, map: next };

    writeSlot(next, to, sourceCell);
    writeSlot(next, from, destOccupant);
    return { ok: true, map: next };
}

function occupyMutate(map, slot, cell, opts) {
    const reason = wouldRefuse(map, slot, cell, opts, null);
    if (reason) return reason;
    writeSlot(map, slot, cell);
    return null;
}

function wouldRefuse(map, slot, cell, opts, ignoreSlot) {
    if (!cell || cell.isTwoHandedDuplicate) return OCCUPANCY_REFUSE.EMPTY_SOURCE;

    if (slot.container === 'weaponSet') {
        const isHeldItem = opts.isHeldItem ?? (() => false);
        if (!isHeldItem(cell)) return OCCUPANCY_REFUSE.WRONG_KIND;
        if (isReservedOffHand(map, slot, opts.isTwoHanded)) return OCCUPANCY_REFUSE.RESERVED;
        if (heldTwiceInSet(map, slot, cell, ignoreSlot)) return OCCUPANCY_REFUSE.SAME_SET;
    }

    if (opts.source !== 'hud' && !ignoreSlot) {
        const current = readSlot(map, slot);
        if (current && !current.isTwoHandedDuplicate && cellIdentity(current)) {
            return OCCUPANCY_REFUSE.OCCUPIED;
        }
    }

    return null;
}

function isReservedOffHand(map, slot, isTwoHanded) {
    if (slot.slotKey !== OFF_HAND) return false;
    const main = readSlot(map, { ...slot, slotKey: MAIN_HAND });
    if (!main || main.isTwoHandedDuplicate) return false;
    const check = isTwoHanded ?? (() => false);
    return check(main);
}

function heldTwiceInSet(map, slot, cell, ignoreSlot) {
    const id = cellIdentity(cell);
    if (!id) return false;
    const items = map.weaponSets?.sets?.[slot.containerIndex]?.items || {};
    for (const [slotKey, parked] of Object.entries(items)) {
        if (ignoreSlot && ignoreSlot.container === 'weaponSet'
            && ignoreSlot.containerIndex === slot.containerIndex
            && ignoreSlot.slotKey === slotKey) continue;
        if (slotKey === slot.slotKey) continue;
        if (cellIdentity(parked) === id) return true;
    }
    return false;
}

function scanGrids(grids, container, id, exclude) {
    if (!grids) return false;
    for (let i = 0; i < grids.length; i++) {
        const items = grids[i]?.items || {};
        for (const [slotKey, parked] of Object.entries(items)) {
            if (exclude && exclude.container === container
                && exclude.containerIndex === i
                && exclude.slotKey === slotKey) continue;
            if (cellIdentity(parked) === id) return true;
        }
    }
    return false;
}

function readSlot(map, slot) {
    const items = itemsOf(map, slot);
    if (!items) return null;
    return items[slot.slotKey] ?? null;
}

export function cellAt(map, slot) {
    return readSlot(map, slot);
}

function writeSlot(map, slot, cell) {
    const items = itemsOf(map, slot, true);
    if (!items) return;
    if (cell == null) delete items[slot.slotKey];
    else items[slot.slotKey] = cell;
}

function itemsOf(map, slot, create = false) {
    if (slot.container === 'hotbar') {
        const grid = map.hotbar?.grids?.[slot.containerIndex];
        if (!grid) return null;
        if (create && !grid.items) grid.items = {};
        return grid.items;
    }
    if (slot.container === 'weaponSet') {
        const set = map.weaponSets?.sets?.[slot.containerIndex];
        if (!set) return null;
        if (create && !set.items) set.items = {};
        return set.items;
    }
    if (slot.container === 'quickAccess') {
        const grid = map.quickAccess?.grids?.[slot.containerIndex];
        if (!grid) return null;
        if (create && !grid.items) grid.items = {};
        return grid.items;
    }
    return null;
}

function sameSlot(a, b) {
    return a.container === b.container
        && a.containerIndex === b.containerIndex
        && a.slotKey === b.slotKey;
}

function cloneMap(map) {
    return {
        hotbar: {
            grids: (map?.hotbar?.grids || []).map((g) => ({
                ...g,
                items: { ...(g?.items || {}) }
            }))
        },
        weaponSets: {
            ...map?.weaponSets,
            sets: (map?.weaponSets?.sets || []).map((s) => ({
                ...s,
                items: { ...(s?.items || {}) }
            }))
        },
        quickAccess: {
            grids: (map?.quickAccess?.grids || []).map((g) => ({
                ...g,
                items: { ...(g?.items || {}) }
            }))
        }
    };
}

export function parkMapFromState(state) {
    return cloneMap(state);
}

/**
 * Copy occupy/clear/move items onto persist state. Does not write flags.
 */
export function writeParkMap(state, map) {
    const assignItems = (targets, sources) => {
        if (!targets || !sources) return;
        const n = Math.min(targets.length, sources.length);
        for (let i = 0; i < n; i++) {
            if (targets[i] && sources[i]) targets[i].items = sources[i].items;
        }
    };
    assignItems(state?.hotbar?.grids, map?.hotbar?.grids);
    assignItems(state?.weaponSets?.sets, map?.weaponSets?.sets);
    assignItems(state?.quickAccess?.grids, map?.quickAccess?.grids);
}

export function slotOf(cell) {
    return {
        container: cell.containerType,
        containerIndex: cell.containerIndex ?? 0,
        slotKey: typeof cell.getSlotKey === 'function'
            ? cell.getSlotKey()
            : `${cell.col}-${cell.row}`
    };
}

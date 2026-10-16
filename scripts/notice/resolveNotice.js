/**
 * Play-sheet notice: what just changed. Adapter returns one; Core applies it.
 * Foundry-free so tests hit this seam without a live HUD tree.
 */

export const NOTICE_FILLS = Object.freeze({
    FACE: 'portrait:face',
    VITALS: 'portrait:vitals',
    PASSIVES: 'passives',
    WEAPON_SET: 'weaponSet',
    FILTER: 'filter',
    CHARACTER_INFO: 'characterInfo',
    ACTIVE_EFFECTS: 'activeEffects',
    REST: 'rest'
});

const LEGAL_FILLS = new Set(Object.values(NOTICE_FILLS));
const CORE_FILLED = new Set(['hotbar', 'quickAccess', 'endTurn', 'views']);

/**
 * Shared by every adapter's notice resolver: `Object.hasOwnProperty` as a free
 * function, null-safe. Identical in every adapter copy, so it lives here once.
 * @param {Object|null|undefined} obj
 * @param {string} key
 * @returns {boolean}
 */
export function hasOwn(obj, key) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Shared by every adapter's notice resolver: normalizes an actor's `items`
 * across the shapes Foundry (EmbeddedCollection), a plain array, or a bare
 * `{ contents }` bag can take. Identical in every adapter copy, so it lives
 * here once.
 * @param {Object|null|undefined} actor
 * @returns {Array<Object>}
 */
export function itemList(actor) {
    const items = actor?.items;
    if (!items) return [];
    if (typeof items.filter === 'function') return items.filter((item) => item);
    if (Array.isArray(items)) return items;
    if (Array.isArray(items.contents)) return items.contents;
    return [];
}

export function isEmptyNotice(notice) {
    if (!notice) return true;
    return !notice.fills?.length && !notice.extras?.length && notice.cells == null;
}

export function emptyNotice() {
    return { fills: [], extras: [], cells: undefined };
}

/**
 * System-agnostic notice from a Foundry updateActor changes object.
 * @param {Object} [changes]
 * @returns {{ fills: string[], extras: string[], cells: undefined | 'all' | { parked: string[] } }}
 */
export function resolveDefaultNotice(changes = {}) {
    const fills = [];
    const system = changes?.system || {};

    if (system.attributes !== undefined) {
        fills.push(NOTICE_FILLS.VITALS);
    }
    if (system.resources !== undefined) {
        fills.push(NOTICE_FILLS.FILTER);
        fills.push(NOTICE_FILLS.VITALS);
    }
    if (system.abilities !== undefined || system.skills !== undefined) {
        fills.push(NOTICE_FILLS.CHARACTER_INFO);
    }

    return normalizeNotice({ fills, extras: [], cells: undefined });
}

/**
 * Union Core default with an optional Adapter notice.
 * @param {Object|null} adapter
 * @param {Object} [changes]
 * @param {Object} [actor]
 * @returns {{ fills: string[], extras: string[], cells: undefined | 'all' | { parked: string[] } }}
 */
export function resolveNotice(adapter, changes = {}, actor = null) {
    const base = resolveDefaultNotice(changes);
    let extra = emptyNotice();
    if (adapter && typeof adapter.resolveNotice === 'function') {
        extra = adapter.resolveNotice(changes, actor) || emptyNotice();
    }
    return unionNotices(base, extra);
}

export function unionNotices(a = emptyNotice(), b = emptyNotice()) {
    const fills = [...new Set([...(a.fills || []), ...(b.fills || [])])];
    const extras = [...new Set([...(a.extras || []), ...(b.extras || [])])];
    const cells = unionCells(a.cells, b.cells);
    return normalizeNotice({ fills, extras, cells });
}

function unionCells(a, b) {
    if (a === 'all' || b === 'all') return 'all';
    const parked = [...new Set([...(a?.parked || []), ...(b?.parked || [])])];
    return parked.length ? { parked } : undefined;
}

function normalizeNotice(notice) {
    const fills = [...new Set((notice.fills || []).filter((f) => LEGAL_FILLS.has(f) && !CORE_FILLED.has(f)))];
    const extras = [...new Set(notice.extras || [])];
    return { fills, extras, cells: notice.cells };
}

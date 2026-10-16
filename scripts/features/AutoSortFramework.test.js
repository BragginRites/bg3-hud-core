import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compareByTypeThenKey } from './AutoSortFramework.js';
import { fillGridRowMajor } from './gridFill.js';

describe('compareByTypeThenKey', () => {
    const typeOrder = ['weapon', 'feat', 'spell'];

    it('orders items primarily by their position in typeOrder', () => {
        const items = [
            { name: 'Zed', type: 'spell' },
            { name: 'Alpha', type: 'weapon' },
            { name: 'Beta', type: 'feat' }
        ];
        const result = items.sort(compareByTypeThenKey(typeOrder)).map((i) => i.name);
        assert.deepEqual(result, ['Alpha', 'Beta', 'Zed']);
    });

    it('sorts a type not present in typeOrder last', () => {
        const items = [
            { name: 'Alpha', type: 'loot' },
            { name: 'Beta', type: 'weapon' }
        ];
        const result = items.sort(compareByTypeThenKey(typeOrder)).map((i) => i.name);
        assert.deepEqual(result, ['Beta', 'Alpha']);
    });

    it('leaves two unknown-type items in their relative name order (both fall through to name)', () => {
        const items = [
            { name: 'Zed', type: 'unknownB' },
            { name: 'Alpha', type: 'unknownA' }
        ];
        const result = items.sort(compareByTypeThenKey(typeOrder)).map((i) => i.name);
        assert.deepEqual(result, ['Alpha', 'Zed']);
    });

    it('applies a numeric secondary key on a type tie before falling back to name', () => {
        const items = [
            { name: 'Zed', type: 'spell', level: 3 },
            { name: 'Alpha', type: 'spell', level: 1 },
            { name: 'Beta', type: 'spell', level: 1 }
        ];
        const comparator = compareByTypeThenKey(typeOrder, { spell: (i) => i.level });
        const result = items.sort(comparator).map((i) => i.name);
        assert.deepEqual(result, ['Alpha', 'Beta', 'Zed']);
    });

    it('applies a string secondary key via localeCompare on a type tie', () => {
        const items = [
            { name: 'Zed', type: 'feat', category: 'passive' },
            { name: 'Alpha', type: 'feat', category: 'active' }
        ];
        const comparator = compareByTypeThenKey(typeOrder, { feat: (i) => i.category });
        const result = items.sort(comparator).map((i) => i.name);
        assert.deepEqual(result, ['Alpha', 'Zed']);
    });

    it('falls back to name when the type has no secondaryKeyFns entry', () => {
        const items = [
            { name: 'Zed', type: 'weapon' },
            { name: 'Alpha', type: 'weapon' }
        ];
        const comparator = compareByTypeThenKey(typeOrder, { spell: (i) => i.level });
        const result = items.sort(comparator).map((i) => i.name);
        assert.deepEqual(result, ['Alpha', 'Zed']);
    });

    it('supports a custom getType/getName for items that nest those fields', () => {
        const items = [
            { itemData: { itemType: 'spell' }, label: 'Zed' },
            { itemData: { itemType: 'weapon' }, label: 'Alpha' }
        ];
        const comparator = compareByTypeThenKey(typeOrder, {}, {
            getType: (i) => i.itemData?.itemType,
            getName: (i) => i.label || ''
        });
        const result = items.sort(comparator).map((i) => i.label);
        assert.deepEqual(result, ['Alpha', 'Zed']);
    });
});

describe('fillGridRowMajor', () => {
    it('places items row-major (left-to-right, then down) with no hooks', () => {
        const { placements, addedCount } = fillGridRowMajor({ cols: 2, rows: 2 }, ['a', 'b', 'c']);
        assert.deepEqual(placements, [
            { slotKey: '0-0', item: 'a' },
            { slotKey: '1-0', item: 'b' },
            { slotKey: '0-1', item: 'c' }
        ]);
        assert.equal(addedCount, 3);
    });

    it('stops once the grid is full even if items remain', () => {
        const { placements, addedCount } = fillGridRowMajor({ cols: 2, rows: 1 }, ['a', 'b', 'c']);
        assert.equal(placements.length, 2);
        assert.equal(addedCount, 2);
    });

    it('skips a slot flagged occupied without consuming the next pending item', () => {
        const occupied = new Set(['0-0']);
        const { placements, addedCount } = fillGridRowMajor({
            cols: 2,
            rows: 1,
            isOccupied: (slotKey) => occupied.has(slotKey)
        }, ['a', 'b']);
        assert.deepEqual(placements, [{ slotKey: '1-0', item: 'a' }]);
        assert.equal(addedCount, 1);
    });

    it('retries the same item at the next slot when canPlace rejects it', () => {
        const rejectedSlots = new Set(['0-0']);
        const { placements, addedCount } = fillGridRowMajor({
            cols: 2,
            rows: 1,
            canPlace: (slotKey) => !rejectedSlots.has(slotKey)
        }, ['a']);
        assert.deepEqual(placements, [{ slotKey: '1-0', item: 'a' }]);
        assert.equal(addedCount, 1);
    });

    it('combines isOccupied and canPlace, each independently able to skip a slot', () => {
        const occupied = new Set(['0-0']);
        const rejectedSlots = new Set(['1-0']);
        const { placements, addedCount } = fillGridRowMajor({
            cols: 3,
            rows: 1,
            isOccupied: (slotKey) => occupied.has(slotKey),
            canPlace: (slotKey) => !rejectedSlots.has(slotKey)
        }, ['a']);
        assert.deepEqual(placements, [{ slotKey: '2-0', item: 'a' }]);
        assert.equal(addedCount, 1);
    });

    it('returns no placements when there are no pending items', () => {
        const { placements, addedCount } = fillGridRowMajor({ cols: 2, rows: 2 }, []);
        assert.deepEqual(placements, []);
        assert.equal(addedCount, 0);
    });
});

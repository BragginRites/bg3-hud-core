import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDefaultNotice, resolveNotice } from './resolveNotice.js';

describe('resolveDefaultNotice', () => {
    it('maps HP change to Portrait Vitals only', () => {
        const notice = resolveDefaultNotice({
            system: { attributes: { hp: { value: 7 } } }
        });
        assert.deepEqual(notice, {
            fills: ['portrait:vitals'],
            extras: [],
            cells: undefined
        });
    });

    it('maps death-save change to Portrait Vitals only', () => {
        const notice = resolveDefaultNotice({
            system: { attributes: { death: { success: 1 } } }
        });
        assert.deepEqual(notice.fills, ['portrait:vitals']);
    });

    it('maps ability scores to Character Info', () => {
        const notice = resolveDefaultNotice({
            system: { abilities: { str: { value: 16 } } }
        });
        assert.deepEqual(notice.fills, ['characterInfo']);
    });

    it('maps skills to Character Info', () => {
        const notice = resolveDefaultNotice({
            system: { skills: { ath: { value: 1 } } }
        });
        assert.deepEqual(notice.fills, ['characterInfo']);
    });

    it('maps generic resources to Filter and Vitals', () => {
        const notice = resolveDefaultNotice({
            system: { resources: { primary: { value: 2 } } }
        });
        assert.deepEqual(notice.fills, ['filter', 'portrait:vitals']);
        assert.equal(notice.cells, undefined);
    });

    it('maps other attribute badges to Vitals', () => {
        const notice = resolveDefaultNotice({
            system: { attributes: { ac: { value: 16 } } }
        });
        assert.deepEqual(notice.fills, ['portrait:vitals']);
    });

    it('does not name Core-filled parts or Cells for a noisy items indicator', () => {
        const notice = resolveDefaultNotice({ items: [{}] });
        assert.deepEqual(notice, { fills: [], extras: [], cells: undefined });
    });
});

describe('resolveNotice', () => {
    it('keeps the default when the Adapter has no mapper', () => {
        const notice = resolveNotice(null, {
            system: { attributes: { hp: { value: 4 } } }
        });
        assert.deepEqual(notice.fills, ['portrait:vitals']);
    });

    it('unions Adapter fills with the default so flags cannot skip Vitals', () => {
        const adapter = {
            resolveNotice() {
                return { fills: ['passives'], extras: [], cells: undefined };
            }
        };
        const notice = resolveNotice(adapter, {
            system: { attributes: { hp: { value: 4 } } },
            flags: { 'bg3-hud-dnd5e': { selectedPassives: [] } }
        });
        assert.deepEqual(notice.fills, ['portrait:vitals', 'passives']);
    });

    it('adds Adapter extras without naming Core-filled parts', () => {
        const adapter = {
            resolveNotice() {
                return {
                    fills: ['hotbar', 'portrait:face'],
                    extras: ['situationalBonuses'],
                    cells: undefined
                };
            }
        };
        const notice = resolveNotice(adapter, {});
        assert.deepEqual(notice.fills, ['portrait:face']);
        assert.deepEqual(notice.extras, ['situationalBonuses']);
    });

    it('unions parked Cells and treats all as the rebuild hatch', () => {
        const adapter = {
            resolveNotice() {
                return { fills: ['filter'], extras: [], cells: { parked: ['Item.a', 'Item.b'] } };
            }
        };
        const notice = resolveNotice(adapter, {
            system: { resources: { primary: { value: 1 } } }
        });
        assert.deepEqual(notice.fills, ['filter', 'portrait:vitals']);
        assert.deepEqual(notice.cells, { parked: ['Item.a', 'Item.b'] });

        const forced = resolveNotice({
            resolveNotice: () => ({ fills: [], extras: [], cells: 'all' })
        }, { system: { attributes: { hp: { value: 1 } } } });
        assert.equal(forced.cells, 'all');
    });
});


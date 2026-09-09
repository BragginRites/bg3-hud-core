import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    occupy,
    clear,
    move,
    cellIdentity,
    alreadyOnUseGrids,
    cellAt,
    OCCUPANCY_REFUSE
} from './occupancy.js';

const fireball = { uuid: 'Item.fireball', name: 'Fireball', type: 'Item' };
const fireball2 = { uuid: 'Item.fireball', name: 'Fireball', type: 'Item' };
const swordA = { uuid: 'Item.swordA', name: 'Sword A', type: 'Item', held: true };
const swordB = { uuid: 'Item.swordB', name: 'Sword B', type: 'Item', held: true };
const shield = { uuid: 'Item.shield', name: 'Shield', type: 'Item', held: true };
const twoHanded = { uuid: 'Item.maul', name: 'Maul', type: 'Item', held: true, two: true };
const preparedA = {
    uuid: 'Item.fireball',
    type: 'PreparedSpell',
    entryId: 'wizard',
    groupId: 3,
    slotId: 0
};
const preparedB = {
    uuid: 'Item.fireball',
    type: 'PreparedSpell',
    entryId: 'wizard',
    groupId: 3,
    slotId: 1
};
const activityStrike = { uuid: 'Item.sword.Activity.strike', type: 'Activity' };
const activityParry = { uuid: 'Item.sword.Activity.parry', type: 'Activity' };

const isHeldItem = (cell) => cell?.held === true;
const isTwoHanded = (cell) => cell?.two === true;
const heldOpts = { isHeldItem, isTwoHanded };

function emptyMap() {
    return {
        hotbar: { grids: [{ items: {} }] },
        weaponSets: { sets: [{ items: {} }, { items: {} }, { items: {} }] },
        quickAccess: { grids: [{ items: {} }] }
    };
}

const hb = (slotKey = '0-0', containerIndex = 0) => ({
    container: 'hotbar',
    containerIndex,
    slotKey
});
const ws = (containerIndex, slotKey = '0-0') => ({
    container: 'weaponSet',
    containerIndex,
    slotKey
});
const qa = (slotKey = '0-0') => ({
    container: 'quickAccess',
    containerIndex: 0,
    slotKey
});

describe('occupy on Hotbar and Quick Access', () => {
    it('parks a Cell on an empty Hotbar Slot', () => {
        const result = occupy(emptyMap(), hb(), fireball);
        assert.equal(result.ok, true);
        assert.equal(cellAt(result.map, hb())?.uuid, 'Item.fireball');
    });

    it('allows a second park of the same Cell on the Hotbar', () => {
        const first = occupy(emptyMap(), hb('0-0'), fireball);
        const result = occupy(first.map, hb('1-0'), fireball2);
        assert.equal(result.ok, true);
        assert.equal(cellAt(result.map, hb('0-0'))?.uuid, 'Item.fireball');
        assert.equal(cellAt(result.map, hb('1-0'))?.uuid, 'Item.fireball');
    });

    it('occupies fifty Fireballs on the Hotbar', () => {
        let map = emptyMap();
        for (let i = 0; i < 50; i++) {
            const result = occupy(map, hb(`${i}-0`), fireball);
            assert.equal(result.ok, true);
            map = result.map;
        }
        assert.equal(cellAt(map, hb('0-0'))?.uuid, 'Item.fireball');
        assert.equal(cellAt(map, hb('49-0'))?.uuid, 'Item.fireball');
    });

    it('allows the same Cell on Hotbar and Quick Access', () => {
        const first = occupy(emptyMap(), hb(), fireball);
        const result = occupy(first.map, qa(), fireball2);
        assert.equal(result.ok, true);
        assert.equal(cellAt(result.map, qa())?.uuid, 'Item.fireball');
    });

    it('refuses an outside park onto an occupied Slot so the parked Cell is not discarded', () => {
        const first = occupy(emptyMap(), hb(), fireball);
        const result = occupy(first.map, hb(), swordA, heldOpts);
        assert.equal(result.ok, false);
        assert.equal(result.reason, OCCUPANCY_REFUSE.OCCUPIED);
        assert.equal(cellAt(first.map, hb())?.uuid, 'Item.fireball');
    });
});

describe('occupy on Weapon sets', () => {
    it('refuses a Cell that is not a held item', () => {
        const result = occupy(emptyMap(), ws(0), fireball, heldOpts);
        assert.equal(result.ok, false);
        assert.equal(result.reason, OCCUPANCY_REFUSE.WRONG_KIND);
        assert.equal(cellAt(result.map ?? emptyMap(), ws(0)), null);
    });

    it('parks a held item on an empty Weapon set Slot', () => {
        const result = occupy(emptyMap(), ws(0), swordA, heldOpts);
        assert.equal(result.ok, true);
        assert.equal(cellAt(result.map, ws(0))?.uuid, 'Item.swordA');
    });

    it('allows the same held item on two Weapon sets', () => {
        const first = occupy(emptyMap(), ws(0), swordA, heldOpts);
        const result = occupy(first.map, ws(1), swordA, heldOpts);
        assert.equal(result.ok, true);
        assert.equal(cellAt(result.map, ws(0))?.uuid, 'Item.swordA');
        assert.equal(cellAt(result.map, ws(1))?.uuid, 'Item.swordA');
    });

    it('refuses the same held item twice in one Weapon set', () => {
        const first = occupy(emptyMap(), ws(0, '0-0'), swordA, heldOpts);
        const result = occupy(first.map, ws(0, '1-0'), swordA, heldOpts);
        assert.equal(result.ok, false);
        assert.equal(result.reason, OCCUPANCY_REFUSE.SAME_SET);
    });

    it('allows sword A and sword B in the same set', () => {
        const first = occupy(emptyMap(), ws(0, '0-0'), swordA, heldOpts);
        const result = occupy(first.map, ws(0, '1-0'), swordB, heldOpts);
        assert.equal(result.ok, true);
        assert.equal(cellAt(result.map, ws(0, '1-0'))?.uuid, 'Item.swordB');
    });

    it('keeps a Hotbar park when occupying a Weapon set from outside', () => {
        const first = occupy(emptyMap(), hb(), swordA, heldOpts);
        const result = occupy(first.map, ws(0), swordA, heldOpts);
        assert.equal(result.ok, true);
        assert.equal(cellAt(result.map, hb())?.uuid, 'Item.swordA');
        assert.equal(cellAt(result.map, ws(0))?.uuid, 'Item.swordA');
    });

    it('refuses occupy of a reserved two-handed off-hand Slot', () => {
        const first = occupy(emptyMap(), ws(0, '0-0'), twoHanded, heldOpts);
        const result = occupy(first.map, ws(0, '1-0'), shield, heldOpts);
        assert.equal(result.ok, false);
        assert.equal(result.reason, OCCUPANCY_REFUSE.RESERVED);
    });
});

describe('move', () => {
    it('clears the Hotbar Slot when moving a held item onto an empty Weapon set Slot', () => {
        const parked = occupy(emptyMap(), hb(), swordA, heldOpts);
        const result = move(parked.map, hb(), ws(0), heldOpts);
        assert.equal(result.ok, true);
        assert.equal(cellAt(result.map, hb()), null);
        assert.equal(cellAt(result.map, ws(0))?.uuid, 'Item.swordA');
    });

    it('clears the Weapon set Slot when moving onto an empty Hotbar Slot', () => {
        const parked = occupy(emptyMap(), ws(0), swordA, heldOpts);
        const result = move(parked.map, ws(0), hb(), heldOpts);
        assert.equal(result.ok, true);
        assert.equal(cellAt(result.map, ws(0)), null);
        assert.equal(cellAt(result.map, hb())?.uuid, 'Item.swordA');
    });

    it('swaps when the destination Slot is occupied', () => {
        let map = occupy(emptyMap(), hb('0-0'), fireball).map;
        map = occupy(map, hb('1-0'), swordA, heldOpts).map;
        const result = move(map, hb('0-0'), hb('1-0'), heldOpts);
        assert.equal(result.ok, true);
        assert.equal(cellAt(result.map, hb('0-0'))?.uuid, 'Item.swordA');
        assert.equal(cellAt(result.map, hb('1-0'))?.uuid, 'Item.fireball');
    });

    it('swaps a Hotbar Cell onto an occupied Quick Access Slot', () => {
        let map = occupy(emptyMap(), hb(), fireball).map;
        map = occupy(map, qa(), swordA, heldOpts).map;
        const result = move(map, hb(), qa(), heldOpts);
        assert.equal(result.ok, true);
        assert.equal(cellAt(result.map, qa())?.uuid, 'Item.fireball');
        assert.equal(cellAt(result.map, hb())?.uuid, 'Item.swordA');
    });

    it('swaps across Hotbar and Weapon set', () => {
        let map = occupy(emptyMap(), hb(), swordA, heldOpts).map;
        map = occupy(map, ws(0), shield, heldOpts).map;
        const result = move(map, hb(), ws(0), heldOpts);
        assert.equal(result.ok, true);
        assert.equal(cellAt(result.map, ws(0))?.uuid, 'Item.swordA');
        assert.equal(cellAt(result.map, hb())?.uuid, 'Item.shield');
    });

    it('swaps occupied Slots across Weapon sets', () => {
        let map = occupy(emptyMap(), ws(0), swordA, heldOpts).map;
        map = occupy(map, ws(1), shield, heldOpts).map;
        const result = move(map, ws(0), ws(1), heldOpts);
        assert.equal(result.ok, true);
        assert.equal(cellAt(result.map, ws(1))?.uuid, 'Item.swordA');
        assert.equal(cellAt(result.map, ws(0))?.uuid, 'Item.shield');
    });

    it('refuses a move of Fireball onto a Weapon set', () => {
        const parked = occupy(emptyMap(), hb(), fireball).map;
        const result = move(parked, hb(), ws(0), heldOpts);
        assert.equal(result.ok, false);
        assert.equal(result.reason, OCCUPANCY_REFUSE.WRONG_KIND);
        assert.equal(cellAt(parked, hb())?.uuid, 'Item.fireball');
    });

    it('refuses a move that would park the same held item twice in one set', () => {
        let map = occupy(emptyMap(), ws(0, '0-0'), swordA, heldOpts).map;
        map = occupy(map, hb(), swordA, heldOpts).map;
        const result = move(map, hb(), ws(0, '1-0'), heldOpts);
        assert.equal(result.ok, false);
        assert.equal(result.reason, OCCUPANCY_REFUSE.SAME_SET);
    });
});

describe('clear and identity', () => {
    it('clears a Slot', () => {
        const parked = occupy(emptyMap(), hb(), fireball);
        const result = clear(parked.map, hb());
        assert.equal(result.ok, true);
        assert.equal(cellAt(result.map, hb()), null);
    });

    it('treats two PreparedSpell slots of the same spell as different Cells', () => {
        assert.notEqual(cellIdentity(preparedA), cellIdentity(preparedB));
        const first = occupy(emptyMap(), hb('0-0'), preparedA);
        const result = occupy(first.map, hb('1-0'), preparedB);
        assert.equal(result.ok, true);
    });

    it('treats two activities of one item as different Cells', () => {
        assert.notEqual(cellIdentity(activityStrike), cellIdentity(activityParry));
        const first = occupy(emptyMap(), hb('0-0'), activityStrike);
        const result = occupy(first.map, hb('1-0'), activityParry);
        assert.equal(result.ok, true);
        assert.equal(cellAt(result.map, hb('0-0'))?.uuid, 'Item.sword.Activity.strike');
        assert.equal(cellAt(result.map, hb('1-0'))?.uuid, 'Item.sword.Activity.parry');
    });

    it('does not treat a two-handed ghost as an occupant', () => {
        assert.equal(
            cellIdentity({ uuid: 'Item.maul', isTwoHandedDuplicate: true }),
            null
        );
    });

    it('matches every park of a Cell by the identity a notice would name', () => {
        let map = occupy(emptyMap(), hb('0-0'), fireball).map;
        map = occupy(map, hb('1-0'), fireball2).map;
        map = occupy(map, qa(), fireball).map;
        const notice = { parked: ['Item.fireball'] };
        const matches = [hb('0-0'), hb('1-0'), qa()].filter((slot) =>
            notice.parked.includes(cellIdentity(cellAt(map, slot)))
        );
        assert.equal(matches.length, 3);
    });
});

describe('auto-fill skip on use-grids', () => {
    it('reports a Cell already on the Hotbar so auto-fill can skip', () => {
        const parked = occupy(emptyMap(), hb(), fireball);
        assert.equal(alreadyOnUseGrids(parked.map, fireball), true);
        assert.equal(alreadyOnUseGrids(emptyMap(), fireball), false);
    });

    it('does not treat a Weapon set park as already on use-grids', () => {
        const parked = occupy(emptyMap(), ws(0), swordA, heldOpts);
        assert.equal(alreadyOnUseGrids(parked.map, swordA), false);
    });

    it('still occupies a second Hotbar copy when the caller does not skip', () => {
        const parked = occupy(emptyMap(), qa(), fireball);
        const result = occupy(parked.map, hb(), fireball);
        assert.equal(result.ok, true);
        assert.equal(cellAt(result.map, qa())?.uuid, 'Item.fireball');
        assert.equal(cellAt(result.map, hb())?.uuid, 'Item.fireball');
    });
});

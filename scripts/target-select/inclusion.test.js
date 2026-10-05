import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { areaKind, tokensInArea } from './inclusion.js';

const caster = { id: 'me', x: 0, y: 0, w: 100, h: 100, hasActor: true };
const orc = { id: 'orc', x: 200, y: 0, w: 100, h: 100, hasActor: true };
const paladin = { id: 'pal', x: 800, y: 800, w: 100, h: 100, hasActor: true };
const loot = { id: 'loot', x: 200, y: 0, w: 100, h: 100, hasActor: false };
const hidden = { id: 'scout', x: 150, y: 40, w: 100, h: 100, hasActor: true };

describe('tokens in an Area', () => {
    it('includes every actor Token in a sphere, including the caster and a hidden Token', () => {
        const inside = tokensInArea([caster, orc, paladin, loot, hidden], {
            kind: 'circle',
            origin: { x: 150, y: 50 },
            size: 160
        });
        const ids = inside.map((token) => token.id).sort();
        assert.deepEqual(ids, ['me', 'orc', 'scout']);
    });

    it('excludes a Token with no actor even when its space intersects', () => {
        const inside = tokensInArea([loot], {
            kind: 'circle',
            origin: { x: 250, y: 50 },
            size: 200
        });
        assert.equal(inside.length, 0);
    });

    it('includes a Token standing in a cone and excludes one behind the caster', () => {
        const ahead = { id: 'ahead', x: 300, y: 0, w: 50, h: 50, hasActor: true };
        const behind = { id: 'behind', x: 0, y: 0, w: 50, h: 50, hasActor: true };
        const inside = tokensInArea([ahead, behind], {
            kind: 'cone',
            origin: { x: 100, y: 25 },
            toward: { x: 400, y: 25 },
            size: 400
        });
        assert.deepEqual(inside.map((token) => token.id), ['ahead']);
    });

    it('maps Fireball-style templates to a circle and a cube to a square', () => {
        assert.equal(areaKind('sphere'), 'circle');
        assert.equal(areaKind('radius'), 'circle');
        assert.equal(areaKind('burst'), 'circle');
        assert.equal(areaKind('cube'), 'square');
        assert.equal(areaKind('cone'), 'cone');
        assert.equal(areaKind('line'), 'line');
    });
});

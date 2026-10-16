import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { TargetSelectorMath } from './TargetSelectorMath.js';

// TargetSelectorMath reads the Foundry `canvas` global for grid size. Stub just
// what calculateTokenDistance/getTokenGridBounds actually touch: canvas.grid.size.
const GRID_SIZE = 100;

function mockToken(x, y, w = GRID_SIZE, h = GRID_SIZE) {
    return { x, y, w, h };
}

describe('TargetSelectorMath.calculateTokenDistance', () => {
    before(() => {
        globalThis.canvas = { grid: { size: GRID_SIZE } };
    });

    after(() => {
        delete globalThis.canvas;
    });

    it('returns 0 for two tokens on the same cell', () => {
        const sourceToken = mockToken(0, 0);
        const targetToken = mockToken(0, 0);

        assert.equal(TargetSelectorMath.calculateTokenDistance(sourceToken, targetToken), 0);
    });

    it('returns 1 for two orthogonally adjacent tokens', () => {
        const sourceToken = mockToken(0, 0);
        const targetToken = mockToken(GRID_SIZE, 0);

        assert.equal(TargetSelectorMath.calculateTokenDistance(sourceToken, targetToken), 1);
    });

    it('measures edge-to-edge for a large (multi-square) token', () => {
        // Source is a 2x2 token occupying grid columns/rows 0-1.
        const sourceToken = mockToken(0, 0, GRID_SIZE * 2, GRID_SIZE * 2);
        // Target is a 1x1 token three columns over (grid column 3), same row.
        const targetToken = mockToken(GRID_SIZE * 3, 0);

        // Nearest edge of source is column 1; target is column 3 -> distance 2.
        assert.equal(TargetSelectorMath.calculateTokenDistance(sourceToken, targetToken), 2);
    });

    it('uses Chebyshev distance for a diagonal case', () => {
        // Two grid squares diagonally away in both x and y.
        const sourceToken = mockToken(0, 0);
        const targetToken = mockToken(GRID_SIZE * 2, GRID_SIZE * 2);

        // Chebyshev distance = max(dx, dy) = max(2, 2) = 2, not Euclidean/Manhattan.
        assert.equal(TargetSelectorMath.calculateTokenDistance(sourceToken, targetToken), 2);
    });
});

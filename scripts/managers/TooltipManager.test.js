import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeTooltipPosition } from './TooltipManager.js';

const viewport = { width: 1200, height: 800 };

describe('computeTooltipPosition', () => {
    it('centers above the target when there is room', () => {
        const targetRect = { left: 500, top: 400, bottom: 440, width: 100, height: 40 };
        const tooltipRect = { width: 200, height: 60 };

        const result = computeTooltipPosition(targetRect, tooltipRect, viewport, 'UP');

        // Centered: 500 + 100/2 - 200/2 = 450
        assert.equal(result.left, 450);
        // Above: 400 - 60 - 10(gap) = 330
        assert.equal(result.top, 330);
        assert.equal(result.placedBelow, false);
        assert.equal(result.maxHeight, null);
    });

    it('flips below the target when there is not enough room above', () => {
        const targetRect = { left: 500, top: 10, bottom: 50, width: 100, height: 40 };
        const tooltipRect = { width: 200, height: 60 };

        const result = computeTooltipPosition(targetRect, tooltipRect, viewport, 'UP');

        // Above would be 10 - 60 - 10 = -60, which is < edge(8), so flip below
        assert.equal(result.placedBelow, true);
        // Below: bottom(50) + gap(10) = 60
        assert.equal(result.top, 60);
    });

    it('clamps horizontally so the tooltip stays within the viewport', () => {
        // Target near the right edge: centered tooltip would overflow the right edge
        const targetRect = { left: 1150, top: 400, bottom: 440, width: 40, height: 40 };
        const tooltipRect = { width: 200, height: 60 };

        const result = computeTooltipPosition(targetRect, tooltipRect, viewport, 'UP');

        // Clamped to viewport.width - tooltipRect.width - edge(8) = 1200 - 200 - 8 = 992
        assert.equal(result.left, 992);

        // Target near the left edge: centered tooltip would overflow the left edge
        const leftTargetRect = { left: 0, top: 400, bottom: 440, width: 10, height: 40 };
        const leftResult = computeTooltipPosition(leftTargetRect, tooltipRect, viewport, 'UP');
        assert.equal(leftResult.left, 8);
    });

    it('sets maxHeight when a very tall tooltip does not fit in the flipped (below) region', () => {
        // Tooltip taller than the viewport forces a flip below (no room above) and then
        // still does not fit below, so it must be capped with maxHeight/overflow.
        const targetRect = { left: 500, top: 300, bottom: 340, width: 100, height: 40 };
        const tooltipRect = { width: 200, height: 1000 };

        const result = computeTooltipPosition(targetRect, tooltipRect, viewport, 'UP');

        assert.equal(result.placedBelow, true);
        // Below: bottom(340) + gap(10) = 350
        assert.equal(result.top, 350);
        // available = max(120, maxBottom(792) - top(350)) = 442
        assert.equal(result.maxHeight, 442);
    });

    it('clamps vertically when placed below and the viewport is too short for the full tooltip', () => {
        const targetRect = { left: 500, top: 0, bottom: 20, width: 100, height: 20 };
        const tooltipRect = { width: 200, height: 1000 };

        const result = computeTooltipPosition(targetRect, tooltipRect, viewport, 'UP');

        assert.equal(result.placedBelow, true);
        // Below: bottom(20) + gap(10) = 30, available = max(120, maxBottom(792) - 30) = 762
        assert.equal(result.maxHeight, 762);
        // top clamped so top + min(height, available) <= maxBottom(792): top <= 792 - 762 = 30
        assert.equal(result.top, 30);
    });
});

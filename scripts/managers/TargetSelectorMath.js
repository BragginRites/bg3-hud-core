/**
 * Target Selector Math Utilities
 * System-agnostic distance calculations and range validation for target selection.
 * All methods are static and pure - no DOM, no side effects.
 */
export class TargetSelectorMath {
    /**
     * Calculate distance between two tokens using edge-to-edge grid-based measurement.
     * Uses Chebyshev distance (common for square grid diagonals).
     * @param {Token} sourceToken - The source token
     * @param {Token} targetToken - The target token
     * @returns {number} Distance in GRID SQUARES (not feet/meters)
     */
    static calculateTokenDistance(sourceToken, targetToken) {
        if (!canvas?.grid || !sourceToken || !targetToken) {
            return Infinity;
        }

        const gridSize = canvas.grid.size;

        // Get token bounds in grid squares
        const sourceBounds = this.getTokenGridBounds(sourceToken);
        const targetBounds = this.getTokenGridBounds(targetToken);

        let minDistance = Infinity;

        // Check all squares of source token against all squares of target token
        // Find the minimum distance between any pair of squares
        for (let sx = sourceBounds.left; sx <= sourceBounds.right; sx++) {
            for (let sy = sourceBounds.top; sy <= sourceBounds.bottom; sy++) {
                for (let tx = targetBounds.left; tx <= targetBounds.right; tx++) {
                    for (let ty = targetBounds.top; ty <= targetBounds.bottom; ty++) {
                        // Chebyshev distance (max of dx, dy) for grid-based measurement
                        const dx = Math.abs(sx - tx);
                        const dy = Math.abs(sy - ty);
                        const squareDistance = Math.max(dx, dy);

                        if (squareDistance < minDistance) {
                            minDistance = squareDistance;
                        }
                    }
                }
            }
        }

        // If tokens overlap, distance is 0
        if (minDistance === Infinity) {
            minDistance = 0;
        }

        // Return distance in GRID SQUARES (adapters now return range in grid squares too)
        return minDistance;
    }

    /**
     * Get token bounds in grid coordinates.
     * @param {Token} token - The token to get bounds for
     * @returns {Object} Bounds object with left, right, top, bottom in grid squares
     */
    static getTokenGridBounds(token) {
        if (!canvas?.grid || !token) {
            return { left: 0, right: 0, top: 0, bottom: 0 };
        }

        const gridSize = canvas.grid.size;

        // Convert token position to grid coordinates
        const leftGrid = Math.floor(token.x / gridSize);
        const topGrid = Math.floor(token.y / gridSize);

        // Calculate token size in grid squares
        const widthInSquares = Math.max(1, Math.round(token.w / gridSize));
        const heightInSquares = Math.max(1, Math.round(token.h / gridSize));

        return {
            left: leftGrid,
            right: leftGrid + widthInSquares - 1,
            top: topGrid,
            bottom: topGrid + heightInSquares - 1
        };
    }
}

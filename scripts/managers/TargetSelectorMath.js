/**
 * Target Selector Math Utilities
 * System-agnostic distance calculations and range validation for target selection.
 * All methods are static and pure - no DOM, no side effects.
 */
export class TargetSelectorMath {
    /**
     * Calculate distance between two tokens using edge-to-edge grid-based measurement.
     * Uses D&D 5e/PF2e style diagonal counting (Chebyshev distance).
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

    /**
     * Check if a target token is within range of the source token.
     * @param {Token} sourceToken - The source token
     * @param {Token} targetToken - The target token
     * @param {number} range - Range in scene units
     * @returns {boolean} True if target is within range
     */
    static isWithinRange(sourceToken, targetToken, range) {
        if (!range || range <= 0) {
            return true; // No range limit
        }

        const distance = this.calculateTokenDistance(sourceToken, targetToken);
        return distance <= range;
    }

    /**
     * Get all tokens within range of the source token.
     * @param {Token} sourceToken - The source token
     * @param {number} range - Range in scene units (0 or null = all tokens)
     * @param {Object} options - Optional filters
     * @param {boolean} options.excludeSource - Exclude source token (default: true)
     * @param {boolean} options.visibleOnly - Only visible tokens (default: true)
     * @returns {Token[]} Array of tokens within range
     */
    static getTokensInRange(sourceToken, range, options = {}) {
        const { excludeSource = true, visibleOnly = true } = options;

        if (!canvas?.tokens?.placeables) {
            return [];
        }

        return canvas.tokens.placeables.filter(token => {
            // Exclude source if requested
            if (excludeSource && token === sourceToken) {
                return false;
            }

            // Only visible tokens if requested
            if (visibleOnly && (!token.isVisible || token.document.hidden)) {
                return false;
            }

            // Check range if specified
            if (range && range > 0) {
                return this.isWithinRange(sourceToken, token, range);
            }

            return true;
        });
    }

    /**
     * Calculate the center point between multiple tokens.
     * Useful for positioning UI elements.
     * @param {Token[]} tokens - Array of tokens
     * @returns {{x: number, y: number}} Center point coordinates
     */
    static calculateCenterPoint(tokens) {
        if (!tokens || tokens.length === 0) {
            return { x: 0, y: 0 };
        }

        const totalX = tokens.reduce((sum, token) => sum + token.center.x, 0);
        const totalY = tokens.reduce((sum, token) => sum + token.center.y, 0);

        return {
            x: totalX / tokens.length,
            y: totalY / tokens.length
        };
    }

    /**
     * Convert range between different unit systems.
     * @param {number} value - The range value
     * @param {string} fromUnit - Source unit (ft, m, mi, km)
     * @param {string} toUnit - Target unit
     * @returns {number} Converted value (rounded to 2 decimal places)
     */
    static convertRangeUnits(value, fromUnit, toUnit) {
        if (fromUnit === toUnit || !value) {
            return value;
        }

        // Conversion factors to feet (base unit)
        const toFeet = {
            'ft': 1,
            'feet': 1,
            'm': 3.28084,
            'meter': 3.28084,
            'meters': 3.28084,
            'mi': 5280,
            'mile': 5280,
            'miles': 5280,
            'km': 3280.84,
            'kilometer': 3280.84,
            'kilometers': 3280.84
        };

        // Convert to feet first, then to target unit
        const inFeet = value * (toFeet[fromUnit] || 1);
        const result = inFeet / (toFeet[toUnit] || 1);

        return Math.round(result * 100) / 100;
    }

    /**
     * Get the range in scene units, handling unit conversion.
     * @param {number} rangeValue - The numeric range value
     * @param {string} rangeUnits - The range units from the item
     * @returns {number|null} Range in scene units, or null if unlimited/special
     */
    static getRangeInSceneUnits(rangeValue, rangeUnits) {
        if (!rangeValue || rangeValue <= 0) {
            return null;
        }

        // Handle special range types
        const specialRanges = ['self', 'touch', 'sight', 'unlimited', 'special', 'none'];
        if (specialRanges.includes(rangeUnits)) {
            if (rangeUnits === 'touch') {
                // Touch range = 1 grid square distance
                return canvas?.scene?.grid?.distance || 5;
            }
            return null; // No range limit for other special types
        }

        // Get scene units
        const sceneUnits = canvas?.scene?.grid?.units || 'ft';

        // Convert if needed
        if (rangeUnits && rangeUnits !== sceneUnits) {
            return this.convertRangeUnits(rangeValue, rangeUnits, sceneUnits);
        }

        return rangeValue;
    }

    /**
     * Check if a point is within a certain pixel distance of a token.
     * Useful for mouse proximity detection.
     * @param {Token} token - The token to check against
     * @param {{x: number, y: number}} point - Point with x, y coordinates
     * @param {number} distance - Distance in pixels
     * @returns {boolean} True if point is within distance
     */
    static isPointNearToken(token, point, distance = 50) {
        if (!token || !point) {
            return false;
        }

        const tokenCenter = token.center;
        const dx = Math.abs(tokenCenter.x - point.x);
        const dy = Math.abs(tokenCenter.y - point.y);
        const actualDistance = Math.sqrt(dx * dx + dy * dy);

        return actualDistance <= distance;
    }

    /**
     * Get the token at a canvas position.
     * @param {{x: number, y: number}} position - Canvas coordinates
     * @returns {Token|null} The token at the position, or null
     */
    static getTokenAtPosition(position) {
        if (!canvas?.tokens?.placeables || !position) {
            return null;
        }

        return canvas.tokens.placeables.find(token => {
            const bounds = token.bounds;
            return position.x >= bounds.x &&
                position.x <= bounds.x + bounds.width &&
                position.y >= bounds.y &&
                position.y <= bounds.y + bounds.height;
        }) || null;
    }
}

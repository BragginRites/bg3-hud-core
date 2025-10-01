/**
 * Persistence Manager
 * Handles saving and loading hotbar cell data to/from actor flags
 * Per-token based persistence system
 */
export class PersistenceManager {
    constructor() {
        this.MODULE_ID = 'bg3-hud-core';
        this.FLAG_NAME = 'hotbarData';
        this.currentToken = null;
        this.currentActor = null;
        this.gridsData = [];
        // Tracks whether the last write originated locally so UI can avoid redundant refresh
        this._lastSaveWasLocal = false;
        
        // Default grid configuration - can be overridden by system adapters
        this.DEFAULT_GRID_CONFIG = {
            rows: 1,
            cols: 5,
            gridCount: 3
        };
    }

    /**
     * Set the current token/actor
     * @param {Token} token - The token to manage persistence for
     */
    setToken(token) {
        this.currentToken = token;
        this.currentActor = token?.actor || null;
    }

    /**
     * Load hotbar data from actor flags
     * @returns {Promise<Array>} Array of grid data objects
     */
    async load() {
        if (!this.currentActor) {
            console.log('BG3 HUD Core | PersistenceManager: No actor to load from');
            return this._getDefaultGrids();
        }

        const savedData = this.currentActor.getFlag(this.MODULE_ID, this.FLAG_NAME);

        if (savedData && Array.isArray(savedData)) {
            console.log('BG3 HUD Core | PersistenceManager: Loaded data from flags:', savedData);
            this.gridsData = foundry.utils.deepClone(savedData);
            return this.gridsData;
        }

        console.log('BG3 HUD Core | PersistenceManager: No saved data, using defaults');
        this.gridsData = this._getDefaultGrids();
        return this.gridsData;
    }

    /**
     * Save hotbar data to actor flags
     * @param {Array} gridsData - Array of grid data objects
     * @returns {Promise<void>}
     */
    async save(gridsData) {
        if (!this.currentActor) {
            console.warn('BG3 HUD Core | PersistenceManager: No actor to save to');
            return;
        }

        this.gridsData = gridsData;
        
        try {
            this._lastSaveWasLocal = true;
            await this.currentActor.setFlag(this.MODULE_ID, this.FLAG_NAME, gridsData);
            console.log('BG3 HUD Core | PersistenceManager: Saved data to flags');
        } catch (error) {
            console.error('BG3 HUD Core | PersistenceManager: Error saving data:', error);
            ui.notifications.error('Failed to save hotbar data');
        }
    }

    /**
     * Update a specific cell's data
     * @param {number} gridIndex - Index of the grid
     * @param {string} slotKey - Slot key (e.g., "0-0")
     * @param {Object|null} cellData - Cell data or null to clear
     * @returns {Promise<void>}
     */
    async updateCell(gridIndex, slotKey, cellData) {
        if (!this.gridsData[gridIndex]) {
            console.error('BG3 HUD Core | PersistenceManager: Invalid grid index:', gridIndex);
            return;
        }

        if (!this.gridsData[gridIndex].items) {
            this.gridsData[gridIndex].items = {};
        }

        if (cellData === null || cellData === undefined) {
            // Clear cell
            delete this.gridsData[gridIndex].items[slotKey];
        } else {
            // Set cell data
            this.gridsData[gridIndex].items[slotKey] = cellData;
        }

        await this.save(this.gridsData);
    }

    /**
     * Swap two cells
     * @param {number} grid1Index - First grid index
     * @param {string} slot1Key - First slot key
     * @param {number} grid2Index - Second grid index
     * @param {string} slot2Key - Second slot key
     * @returns {Promise<void>}
     */
    async swapCells(grid1Index, slot1Key, grid2Index, slot2Key) {
        const grid1 = this.gridsData[grid1Index];
        const grid2 = this.gridsData[grid2Index];

        if (!grid1 || !grid2) {
            console.error('BG3 HUD Core | PersistenceManager: Invalid grid indices');
            return;
        }

        if (!grid1.items) grid1.items = {};
        if (!grid2.items) grid2.items = {};

        // Swap cell data
        const temp = grid1.items[slot1Key];
        grid1.items[slot1Key] = grid2.items[slot2Key];
        grid2.items[slot2Key] = temp;

        // Clean up null/undefined entries
        if (!grid1.items[slot1Key]) delete grid1.items[slot1Key];
        if (!grid2.items[slot2Key]) delete grid2.items[slot2Key];

        await this.save(this.gridsData);
    }

    /**
     * Clear all hotbar data
     * @returns {Promise<void>}
     */
    async clear() {
        if (!this.currentActor) {
            console.warn('BG3 HUD Core | PersistenceManager: No actor to clear');
            return;
        }

        try {
            await this.currentActor.unsetFlag(this.MODULE_ID, this.FLAG_NAME);
            this.gridsData = this._getDefaultGrids();
            console.log('BG3 HUD Core | PersistenceManager: Cleared all data');
        } catch (error) {
            console.error('BG3 HUD Core | PersistenceManager: Error clearing data:', error);
        }
    }

    /**
     * Get default grid configuration
     * @returns {Array} Default grid data
     * @private
     */
    _getDefaultGrids() {
        const grids = [];
        for (let i = 0; i < this.DEFAULT_GRID_CONFIG.gridCount; i++) {
            grids.push({
                rows: this.DEFAULT_GRID_CONFIG.rows,
                cols: this.DEFAULT_GRID_CONFIG.cols,
                items: {},
                id: 'hotbar',
                index: i
            });
        }
        return grids;
    }

    /**
     * Get current grids data
     * @returns {Array} Current grid data
     */
    getGridsData() {
        return this.gridsData;
    }

    /**
     * Update grid configuration (rows/cols)
     * @param {number} gridIndex - Index of the grid
     * @param {Object} config - Configuration {rows, cols}
     * @returns {Promise<void>}
     */
    async updateGridConfig(gridIndex, config) {
        if (!this.gridsData[gridIndex]) {
            console.error('BG3 HUD Core | PersistenceManager: Invalid grid index:', gridIndex);
            return;
        }

        if (config.rows !== undefined) {
            this.gridsData[gridIndex].rows = config.rows;
        }
        if (config.cols !== undefined) {
            this.gridsData[gridIndex].cols = config.cols;
        }

        await this.save(this.gridsData);
    }
}

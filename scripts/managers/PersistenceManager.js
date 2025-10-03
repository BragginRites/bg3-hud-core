/**
 * Persistence Manager
 * Single source of truth for all HUD state
 * Uses unified flag: bg3-hud-core.hudState
 */
export class PersistenceManager {
    constructor() {
        this.MODULE_ID = 'bg3-hud-core';
        this.FLAG_NAME = 'hudState';
        this.VERSION = 1;
        this.currentToken = null;
        this.currentActor = null;
        this.state = null; // Cached state
        this._saveInProgress = false; // Prevent concurrent saves
        this._lastSaveTimestamp = 0; // Track when we last saved locally
        
        // Default grid configuration - can be overridden by system adapters
        this.DEFAULT_GRID_CONFIG = {
            rows: 1,
            cols: 5,
            gridCount: 3
        };
    }

    /**
     * Set the current token/actor
     * Always clears cache to force fresh load
     * @param {Token} token - The token to manage persistence for
     */
    setToken(token) {
        this.currentToken = token;
        this.currentActor = token?.actor || null;
        this.state = null; // Clear cache
        console.log('BG3 HUD Core | PersistenceManager: Token set, cache cleared');
    }

    /**
     * Load complete state from actor flags
     * Always returns a valid state object with defaults
     * Includes automatic migration from old flag format
     * @returns {Promise<Object>} Complete HUD state
     */
    async loadState() {
        if (!this.currentActor) {
            console.warn('BG3 HUD Core | PersistenceManager: No actor, returning defaults');
            return this._getDefaultState();
        }

        // Try to load unified state
        const savedState = this.currentActor.getFlag(this.MODULE_ID, this.FLAG_NAME);
        
        if (savedState && savedState.version === this.VERSION) {
            console.log('BG3 HUD Core | PersistenceManager: Loaded state from flags');
            this.state = foundry.utils.deepClone(savedState);
            return this.state;
        }

        // Check for old flags and migrate
        const oldHotbarData = this.currentActor.getFlag(this.MODULE_ID, 'hotbarData');
        const oldWeaponSets = this.currentActor.getFlag(this.MODULE_ID, 'weaponSets');
        const oldQuickAccess = this.currentActor.getFlag(this.MODULE_ID, 'quickAccessGrid');
        const oldActiveSet = this.currentActor.getFlag(this.MODULE_ID, 'activeWeaponSet');

        if (oldHotbarData || oldWeaponSets || oldQuickAccess) {
            console.log('BG3 HUD Core | PersistenceManager: Migrating from old flag format');
            this.state = await this._migrateFromOldFlags(oldHotbarData, oldWeaponSets, oldQuickAccess, oldActiveSet);
            
            // Save migrated state
            await this.saveState(this.state);
            
            // Clean up old flags
            await this._cleanupOldFlags();
            
            console.log('BG3 HUD Core | PersistenceManager: Migration complete, old flags cleaned');
            return this.state;
        }

        console.log('BG3 HUD Core | PersistenceManager: No saved state, using defaults');
        this.state = this._getDefaultState();
        return this.state;
    }

    /**
     * Save complete state to actor flags
     * Includes concurrency protection
     * @param {Object} state - Complete HUD state
     * @returns {Promise<void>}
     */
    async saveState(state) {
        if (!this.currentActor) {
            console.warn('BG3 HUD Core | PersistenceManager: No actor to save to');
            return;
        }

        // Wait for any in-progress save
        while (this._saveInProgress) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        try {
            this._saveInProgress = true;
            console.log('BG3 HUD Core | PersistenceManager: Saving state');
            
            // Mark that we're saving locally (to prevent reload on updateActor hook)
            this._lastSaveTimestamp = Date.now();
            
            await this.currentActor.setFlag(this.MODULE_ID, this.FLAG_NAME, state);
            this.state = foundry.utils.deepClone(state);
            
            console.log('BG3 HUD Core | PersistenceManager: State saved successfully');
        } catch (error) {
            console.error('BG3 HUD Core | PersistenceManager: Error saving state:', error);
            throw error;
        } finally {
            this._saveInProgress = false;
        }
    }

    /**
     * Update a single cell atomically
     * Load → Modify → Save pattern prevents race conditions
     * @param {Object} options - Update options
     * @param {string} options.container - Container type: 'hotbar', 'weaponSet', 'quickAccess'
     * @param {number} options.containerIndex - Container index (for hotbar/weaponSet)
     * @param {string} options.slotKey - Slot key (e.g., "0-0")
     * @param {Object|null} options.data - Cell data or null to clear
     * @returns {Promise<void>}
     */
    async updateCell(options) {
        const { container, containerIndex, slotKey, data } = options;
        
        // ALWAYS load fresh state from flags
        const state = await this.loadState();
        
        // Navigate to the correct items object
        let items;
        switch (container) {
            case 'hotbar':
                if (!state.hotbar.grids[containerIndex]) {
                    console.error('BG3 HUD Core | PersistenceManager: Invalid hotbar grid index:', containerIndex);
                    return;
                }
                items = state.hotbar.grids[containerIndex].items;
                break;
                
            case 'weaponSet':
                if (!state.weaponSets.sets[containerIndex]) {
                    console.error('BG3 HUD Core | PersistenceManager: Invalid weapon set index:', containerIndex);
                    return;
                }
                items = state.weaponSets.sets[containerIndex].items;
                break;
                
            case 'quickAccess':
                // Convert array to object-like helper for manipulation by slotKey
                // slotKey is in format "col-row"
                // We will update the array by translating slotKey → index
                if (!Array.isArray(state.quickAccess.items)) state.quickAccess.items = [];
                items = state.quickAccess.items;
                break;
                
            default:
                console.error('BG3 HUD Core | PersistenceManager: Unknown container type:', container);
                return;
        }
        
        // Update or delete the cell
        if (container === 'quickAccess') {
            const [colStr, rowStr] = slotKey.split('-');
            const col = Number(colStr);
            const row = Number(rowStr);
            const cols = state.quickAccess.cols;
            const index = row * cols + col;
            if (data === null || data === undefined) {
                items[index] = undefined;
            } else {
                items[index] = data;
            }
        } else {
            if (data === null || data === undefined) {
                delete items[slotKey];
            } else {
                items[slotKey] = data;
            }
        }
        
        // Save the entire state
        await this.saveState(state);
    }

    /**
     * Update active weapon set
     * @param {number} index - Active set index (0-2)
     * @returns {Promise<void>}
     */
    async setActiveWeaponSet(index) {
        const state = await this.loadState();
        state.weaponSets.activeSet = index;
        await this.saveState(state);
    }

    /**
     * Update hotbar grid configuration
     * @param {number} gridIndex - Grid index
     * @param {Object} config - Configuration {rows, cols}
     * @returns {Promise<void>}
     */
    async updateGridConfig(gridIndex, config) {
        const state = await this.loadState();
        
        if (!state.hotbar.grids[gridIndex]) {
            console.error('BG3 HUD Core | PersistenceManager: Invalid grid index:', gridIndex);
            return;
        }
        
        if (config.rows !== undefined) {
            state.hotbar.grids[gridIndex].rows = config.rows;
        }
        if (config.cols !== undefined) {
            state.hotbar.grids[gridIndex].cols = config.cols;
        }
        
        await this.saveState(state);
    }

    /**
     * Update entire container's items (used by sort, auto-populate, etc.)
     * @param {string} containerType - Container type: 'hotbar', 'weaponSet', 'quickAccess'
     * @param {number} containerIndex - Container index (for hotbar/weaponSet)
     * @param {Object} items - Complete items object for the container
     * @returns {Promise<void>}
     */
    async updateContainer(containerType, containerIndex, items) {
        const state = await this.loadState();
        
        switch (containerType) {
            case 'hotbar':
                if (!state.hotbar.grids[containerIndex]) {
                    console.error('BG3 HUD Core | PersistenceManager: Invalid hotbar grid index:', containerIndex);
                    return;
                }
                state.hotbar.grids[containerIndex].items = items;
                break;
                
            case 'weaponSet':
                if (!state.weaponSets.sets[containerIndex]) {
                    console.error('BG3 HUD Core | PersistenceManager: Invalid weapon set index:', containerIndex);
                    return;
                }
                state.weaponSets.sets[containerIndex].items = items;
                break;
                
            case 'quickAccess':
                state.quickAccess.items = items;
                break;
                
            default:
                console.error('BG3 HUD Core | PersistenceManager: Unknown container type:', containerType);
                return;
        }
        
        await this.saveState(state);
    }

    /**
     * Clear all items from all containers
     * @returns {Promise<void>}
     */
    async clearAll() {
        const state = await this.loadState();
        
        // Clear hotbar grids
        for (const grid of state.hotbar.grids) {
            grid.items = {};
        }
        
        // Clear weapon sets
        for (const set of state.weaponSets.sets) {
            set.items = {};
        }
        
        // Clear quick access
        state.quickAccess.items = {};
        
        await this.saveState(state);
    }

    /**
     * Get default state structure
     * @returns {Object} Default HUD state
     * @private
     */
    _getDefaultState() {
        const grids = [];
        for (let i = 0; i < this.DEFAULT_GRID_CONFIG.gridCount; i++) {
            grids.push({
                rows: this.DEFAULT_GRID_CONFIG.rows,
                cols: this.DEFAULT_GRID_CONFIG.cols,
                items: {}
            });
        }

        return {
            version: this.VERSION,
            hotbar: {
                grids: grids
            },
            weaponSets: {
                sets: [
                    { rows: 1, cols: 2, items: {} },
                    { rows: 1, cols: 2, items: {} },
                    { rows: 1, cols: 2, items: {} }
                ],
                activeSet: 0
            },
            quickAccess: {
                rows: 2,
                cols: 3,
                // Store as array of cell entries (row-major), to allow full replacement semantics
                items: []
            }
        };
    }

    /**
     * Migrate from old flag format to unified state
     * @param {Array} oldHotbarData - Old hotbarData flag
     * @param {Array} oldWeaponSets - Old weaponSets flag
     * @param {Object} oldQuickAccess - Old quickAccessGrid flag
     * @param {number} oldActiveSet - Old activeWeaponSet flag
     * @returns {Promise<Object>} Migrated state
     * @private
     */
    async _migrateFromOldFlags(oldHotbarData, oldWeaponSets, oldQuickAccess, oldActiveSet) {
        const state = this._getDefaultState();
        
        // Migrate hotbar data
        if (Array.isArray(oldHotbarData)) {
            for (let i = 0; i < Math.min(oldHotbarData.length, state.hotbar.grids.length); i++) {
                const oldGrid = oldHotbarData[i];
                if (oldGrid) {
                    state.hotbar.grids[i].rows = oldGrid.rows || state.hotbar.grids[i].rows;
                    state.hotbar.grids[i].cols = oldGrid.cols || state.hotbar.grids[i].cols;
                    state.hotbar.grids[i].items = oldGrid.items || {};
                }
            }
        }
        
        // Migrate weapon sets
        if (Array.isArray(oldWeaponSets)) {
            for (let i = 0; i < Math.min(oldWeaponSets.length, state.weaponSets.sets.length); i++) {
                const oldSet = oldWeaponSets[i];
                if (oldSet) {
                    state.weaponSets.sets[i].rows = oldSet.rows || state.weaponSets.sets[i].rows;
                    state.weaponSets.sets[i].cols = oldSet.cols || state.weaponSets.sets[i].cols;
                    state.weaponSets.sets[i].items = oldSet.items || {};
                }
            }
        }
        
        // Migrate active weapon set
        if (typeof oldActiveSet === 'number') {
            state.weaponSets.activeSet = oldActiveSet;
        }
        
        // Migrate quick access
        if (oldQuickAccess) {
            state.quickAccess.rows = oldQuickAccess.rows || state.quickAccess.rows;
            state.quickAccess.cols = oldQuickAccess.cols || state.quickAccess.cols;
            // Old format used an object map keyed by "col-row". Convert to array (row-major)
            const rows = state.quickAccess.rows;
            const cols = state.quickAccess.cols;
            const legacyItems = oldQuickAccess.items || {};
            const itemsArray = [];
            for (const key of Object.keys(legacyItems)) {
                const [colStr, rowStr] = key.split('-');
                const col = Number(colStr);
                const row = Number(rowStr);
                if (Number.isInteger(col) && Number.isInteger(row)) {
                    const index = row * cols + col;
                    itemsArray[index] = legacyItems[key];
                }
            }
            state.quickAccess.items = itemsArray;
        }
        
        console.log('BG3 HUD Core | PersistenceManager: Migration complete');
        return state;
    }

    /**
     * Clean up old flags after migration
     * @returns {Promise<void>}
     * @private
     */
    async _cleanupOldFlags() {
        if (!this.currentActor) return;
        
        try {
            console.log('BG3 HUD Core | PersistenceManager: Cleaning up old flags');
            await this.currentActor.unsetFlag(this.MODULE_ID, 'hotbarData');
            await this.currentActor.unsetFlag(this.MODULE_ID, 'weaponSets');
            await this.currentActor.unsetFlag(this.MODULE_ID, 'quickAccessGrid');
            await this.currentActor.unsetFlag(this.MODULE_ID, 'activeWeaponSet');
            console.log('BG3 HUD Core | PersistenceManager: Old flags removed');
        } catch (error) {
            console.warn('BG3 HUD Core | PersistenceManager: Error cleaning up old flags:', error);
        }
    }

    /**
     * Get current state (for export/display)
     * @returns {Object|null} Current state or null if not loaded
     */
    getState() {
        return this.state ? foundry.utils.deepClone(this.state) : null;
    }

    /**
     * Check if we should skip state reload (because we just saved locally)
     * Prevents race condition where updateActor hook fires before save completes
     * @returns {boolean} True if we should skip reload
     */
    shouldSkipReload() {
        // Skip if we saved in the last 100ms
        const timeSinceLastSave = Date.now() - this._lastSaveTimestamp;
        return timeSinceLastSave < 100;
    }

    /**
     * Legacy compatibility methods
     * These maintain compatibility with old code during transition
     */

    /**
     * Legacy: Load hotbar data
     * @returns {Promise<Array>} Hotbar grids
     */
    async load() {
        const state = await this.loadState();
        return state.hotbar.grids;
    }

    /**
     * Legacy: Save hotbar data (deprecated - use saveState)
     * @param {Array} gridsData - Array of grid data objects
     * @returns {Promise<void>}
     */
    async save(gridsData) {
        const state = await this.loadState();
        state.hotbar.grids = gridsData;
        await this.saveState(state);
    }

    /**
     * Legacy: Get grids data
     * @returns {Array} Hotbar grids
     */
    getGridsData() {
        return this.state?.hotbar.grids || [];
    }

    /**
     * Legacy: Load weapon sets
     * @returns {Promise<Array>} Weapon sets
     */
    async loadWeaponSets() {
        const state = await this.loadState();
        return state.weaponSets.sets;
    }

    /**
     * Legacy: Save weapon sets (deprecated - use saveState)
     * @param {Array} weaponSets - Array of weapon set data
     * @returns {Promise<void>}
     */
    async saveWeaponSets(weaponSets) {
        const state = await this.loadState();
        state.weaponSets.sets = weaponSets;
        await this.saveState(state);
    }

    /**
     * Legacy: Update weapon set cell (deprecated - use updateCell)
     * @param {number} setIndex - Set index
     * @param {string} slotKey - Slot key
     * @param {Object|null} cellData - Cell data
     * @returns {Promise<void>}
     */
    async updateWeaponSetCell(setIndex, slotKey, cellData) {
        await this.updateCell({
            container: 'weaponSet',
            containerIndex: setIndex,
            slotKey: slotKey,
            data: cellData
        });
    }

    /**
     * Legacy: Get weapon sets data
     * @returns {Array} Weapon sets
     */
    getWeaponSetsData() {
        return this.state?.weaponSets.sets || [];
    }

    /**
     * Legacy: Load quick access
     * @returns {Promise<Object>} Quick access grid
     */
    async loadQuickAccess() {
        const state = await this.loadState();
        return state.quickAccess;
    }

    /**
     * Legacy: Save quick access (deprecated - use saveState)
     * @param {Object} quickAccess - Quick access grid data
     * @returns {Promise<void>}
     */
    async saveQuickAccess(quickAccess) {
        const state = await this.loadState();
        state.quickAccess = quickAccess;
        await this.saveState(state);
    }

    /**
     * Legacy: Update quick access cell (deprecated - use updateCell)
     * @param {string} slotKey - Slot key
     * @param {Object|null} cellData - Cell data
     * @returns {Promise<void>}
     */
    async updateQuickAccessCell(slotKey, cellData) {
        await this.updateCell({
            container: 'quickAccess',
            containerIndex: 0, // Not used for quick access
            slotKey: slotKey,
            data: cellData
        });
    }

    /**
     * Legacy: Get quick access data
     * @returns {Object} Quick access grid
     */
    getQuickAccessData() {
        return this.state?.quickAccess || { rows: 2, cols: 3, items: {} };
    }

    /**
     * Legacy: Clear all (now uses clearAll)
     * @returns {Promise<void>}
     */
    async clear() {
        await this.clearAll();
    }
}

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
        this.socketManager = null; // Set by BG3Hotbar
        
        // Default grid configuration - can be overridden by system adapters
        this.DEFAULT_GRID_CONFIG = {
            rows: 1,
            cols: 5,
            gridCount: 3
        };
    }

    /**
     * Set socket manager reference
     * @param {SocketManager} socketManager
     */
    setSocketManager(socketManager) {
        this.socketManager = socketManager;
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
        let savedState = this.currentActor.getFlag(this.MODULE_ID, this.FLAG_NAME);
        
        if (savedState && savedState.version === this.VERSION) {
            console.log('BG3 HUD Core | PersistenceManager: Loaded state from flags');
            this.state = foundry.utils.deepClone(savedState);
            // Migrate quickAccess from array to object if needed
            this._migrateQuickAccessFormat(this.state);
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
        const { container, slotKey, data } = options;
        const containerIndex = options.containerIndex ?? 0;
        
        console.log('BG3 HUD | PersistenceManager.updateCell called:', { container, containerIndex, slotKey, data });
        
        // Use cached state if available, otherwise load fresh
        let state = this.state;
        if (!state) {
            state = await this.loadState();
        }
        
        // Navigate to the correct items object and assign directly
        switch (container) {
            case 'hotbar': {
                const grid = state.hotbar?.grids?.[containerIndex];
                if (!grid) {
                    console.warn('BG3 HUD Core | PersistenceManager: Hotbar grid not found:', containerIndex);
                    return;
                }
                grid.items[slotKey] = data;
                break;
            }
            case 'quickAccess': {
                if (!state.quickAccess || !Array.isArray(state.quickAccess.grids)) {
                    console.warn('BG3 HUD Core | PersistenceManager: QuickAccess branch missing, creating new one.');
                    state.quickAccess = { grids: [ { rows: 2, cols: 3, items: {} } ] };
                }
                const qGrid = state.quickAccess.grids[containerIndex] || (state.quickAccess.grids[containerIndex] = { rows: 2, cols: 3, items: {} });
                if (!qGrid.items || typeof qGrid.items !== 'object') {
                    qGrid.items = {};
                }
                qGrid.items[slotKey] = data;
                break;
            }
            case 'weaponSet': {
                const set = state.weaponSets?.sets?.[containerIndex];
                if (!set) {
                    console.warn('BG3 HUD Core | PersistenceManager: Weapon set not found:', containerIndex);
                    return;
                }
                set.items[slotKey] = data;
                break;
            }
            default:
                console.warn('BG3 HUD Core | PersistenceManager: Unknown container type:', container);
                return;
        }
        
        // Save the entire state
        await this.saveState(state);
        
        // Broadcast update via socket for instant sync
        if (this.socketManager && this.currentActor) {
            await this.socketManager.broadcastUpdate(this.currentActor.uuid, {
                type: 'cellUpdate',
                userId: game.user.id,
                container,
                containerIndex,
                slotKey,
                data
            });
        }
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
        
        // Broadcast update via socket for instant sync
        if (this.socketManager && this.currentActor) {
            await this.socketManager.broadcastUpdate(this.currentActor.uuid, {
                type: 'gridConfig',
                userId: game.user.id,
                gridIndex,
                config
            });
        }
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
                if (!state.quickAccess || !Array.isArray(state.quickAccess.grids)) {
                    state.quickAccess = { grids: [ { rows: 2, cols: 3, items: {} } ] };
                }
                if (!state.quickAccess.grids[containerIndex]) {
                    state.quickAccess.grids[containerIndex] = { rows: 2, cols: 3, items: {} };
                }
                state.quickAccess.grids[containerIndex].items = items;
                break;
                
            default:
                console.error('BG3 HUD Core | PersistenceManager: Unknown container type:', containerType);
                return;
        }
        
        await this.saveState(state);
        
        // Broadcast update via socket for instant sync
        if (this.socketManager && this.currentActor) {
            await this.socketManager.broadcastUpdate(this.currentActor.uuid, {
                type: 'containerUpdate',
                userId: game.user.id,
                containerType,
                containerIndex,
                items
            });
        }
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
        if (Array.isArray(state.quickAccess?.grids)) {
            for (const grid of state.quickAccess.grids) {
                grid.items = {};
            }
        }
        
        await this.saveState(state);
        
        // Broadcast update via socket for instant sync
        if (this.socketManager && this.currentActor) {
            await this.socketManager.broadcastUpdate(this.currentActor.uuid, {
                type: 'clearAll',
                userId: game.user.id
            });
        }
    }

    /**
     * Migrate quickAccess items from array format to object map
     * @param {Object} state - HUD state
     * @private
     */
    _migrateQuickAccessFormat(state) {
        if (!state.quickAccess) return;
        
        // If legacy quickAccess is a single grid object with items array, convert to object map and wrap into grids[]
        if (Array.isArray(state.quickAccess.items)) {
            console.log('BG3 HUD Core | PersistenceManager: Migrating quickAccess from array to object map');
            const cols = state.quickAccess.cols || 3;
            const arrayItems = state.quickAccess.items;
            const mapItems = {};
            
            for (let i = 0; i < arrayItems.length; i++) {
                if (arrayItems[i]) {
                    const row = Math.floor(i / cols);
                    const col = i % cols;
                    const slotKey = `${col}-${row}`;
                    mapItems[slotKey] = arrayItems[i];
                }
            }
            
            state.quickAccess.items = mapItems;
            console.log('BG3 HUD Core | PersistenceManager: QuickAccess migrated to object map format');
        }

        // Wrap single quickAccess grid into grids[] if not already
        if (!Array.isArray(state.quickAccess.grids)) {
            const rows = state.quickAccess.rows ?? 2;
            const cols = state.quickAccess.cols ?? 3;
            const items = state.quickAccess.items && typeof state.quickAccess.items === 'object' ? state.quickAccess.items : {};
            state.quickAccess = {
                grids: [ { rows, cols, items } ]
            };
            console.log('BG3 HUD Core | PersistenceManager: QuickAccess wrapped into grids[]');
        }
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
                grids: [
                    { rows: 2, cols: 3, items: {} }
                ]
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
            const rows = oldQuickAccess.rows || 2;
            const cols = oldQuickAccess.cols || 3;
            const legacyItems = oldQuickAccess.items || {};
            state.quickAccess = {
                grids: [
                    { rows, cols, items: legacyItems }
                ]
            };
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
     * Prevents flicker from updateActor hook triggering unnecessary re-renders
     * after optimistic UI updates during drag/drop operations
     * @returns {boolean} True if we should skip reload
     */
    shouldSkipReload() {
        // Skip if we saved in the last 500ms (generous window for Foundry's async hooks)
        const timeSinceLastSave = Date.now() - this._lastSaveTimestamp;
        return timeSinceLastSave < 500;
    }

    /**
     * Check if a UUID already exists anywhere in the HUD (prevents duplicates)
     * @param {string} uuid - UUID to check
     * @param {Object} options - Options
     * @param {string} options.excludeContainer - Container type to exclude from check
     * @param {number} options.excludeContainerIndex - Container index to exclude
     * @param {string} options.excludeSlotKey - Slot key to exclude (for moves within same location)
     * @returns {Object|null} Location where UUID exists {container, containerIndex, slotKey}, or null if not found
     */
    findUuidInHud(uuid, options = {}) {
        if (!uuid || !this.state) return null;

        const { excludeContainer, excludeContainerIndex, excludeSlotKey } = options;

        // Check hotbar grids
        if (excludeContainer !== 'hotbar') {
            for (let i = 0; i < this.state.hotbar.grids.length; i++) {
                const grid = this.state.hotbar.grids[i];
                for (const [slotKey, item] of Object.entries(grid.items || {})) {
                    if (item?.uuid === uuid) {
                        return { container: 'hotbar', containerIndex: i, slotKey };
                    }
                }
            }
        } else if (excludeContainerIndex !== undefined) {
            // Check other hotbar grids
            for (let i = 0; i < this.state.hotbar.grids.length; i++) {
                if (i === excludeContainerIndex) continue;
                const grid = this.state.hotbar.grids[i];
                for (const [slotKey, item] of Object.entries(grid.items || {})) {
                    if (item?.uuid === uuid) {
                        return { container: 'hotbar', containerIndex: i, slotKey };
                    }
                }
            }
            // Check the same grid but different slots
            const sameGrid = this.state.hotbar.grids[excludeContainerIndex];
            for (const [slotKey, item] of Object.entries(sameGrid.items || {})) {
                if (slotKey !== excludeSlotKey && item?.uuid === uuid) {
                    return { container: 'hotbar', containerIndex: excludeContainerIndex, slotKey };
                }
            }
        }

        // Check weapon sets
        if (excludeContainer !== 'weaponSet') {
            for (let i = 0; i < this.state.weaponSets.sets.length; i++) {
                const set = this.state.weaponSets.sets[i];
                for (const [slotKey, item] of Object.entries(set.items || {})) {
                    if (item?.uuid === uuid) {
                        return { container: 'weaponSet', containerIndex: i, slotKey };
                    }
                }
            }
        } else if (excludeContainerIndex !== undefined) {
            // Check other weapon sets
            for (let i = 0; i < this.state.weaponSets.sets.length; i++) {
                if (i === excludeContainerIndex) continue;
                const set = this.state.weaponSets.sets[i];
                for (const [slotKey, item] of Object.entries(set.items || {})) {
                    if (item?.uuid === uuid) {
                        return { container: 'weaponSet', containerIndex: i, slotKey };
                    }
                }
            }
            // Check the same set but different slots
            const sameSet = this.state.weaponSets.sets[excludeContainerIndex];
            for (const [slotKey, item] of Object.entries(sameSet.items || {})) {
                if (slotKey !== excludeSlotKey && item?.uuid === uuid) {
                    return { container: 'weaponSet', containerIndex: excludeContainerIndex, slotKey };
                }
            }
        }

        // Check quick access
        if (excludeContainer !== 'quickAccess') {
            for (const [slotKey, item] of Object.entries(this.state.quickAccess.items || {})) {
                if (item?.uuid === uuid) {
                    return { container: 'quickAccess', containerIndex: 0, slotKey };
                }
            }
        } else if (excludeSlotKey) {
            // Check different slots in quick access
            for (const [slotKey, item] of Object.entries(this.state.quickAccess.items || {})) {
                if (slotKey !== excludeSlotKey && item?.uuid === uuid) {
                    return { container: 'quickAccess', containerIndex: 0, slotKey };
                }
            }
        }

        return null;
    }

}

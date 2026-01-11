/**
 * Persistence Manager
 * Single source of truth for all HUD state
 * Uses unified flag: bg3-hud-core.hudState
 * 
 * Multi-user sync strategy:
 * - State is saved via actor.setFlag() which Foundry broadcasts to all clients
 * - Other clients receive the update via the 'updateActor' hook
 * - UpdateCoordinator._reconcileWithServerState() updates the UI on remote clients
 * - _lastSaveTimestamp prevents self-triggered hook reloads
 */
export class PersistenceManager {
    constructor() {
        this.MODULE_ID = 'bg3-hud-core';
        this.FLAG_NAME = 'hudState';
        this.VERSION = 2; // Bumped for views feature
        this.currentToken = null;
        this.currentActor = null;
        this.state = null; // Cached state
        this._saveInProgress = false; // Prevent concurrent saves
        this._lastSaveTimestamp = 0; // Track when we last saved locally

        // Default grid configuration - can be overridden by system adapters
        this.DEFAULT_GRID_CONFIG = {
            rows: 3,
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
        // Accept either a Token(ish) object or an Actor directly
        this.currentActor = token?.actor || (token instanceof Actor ? token : null);
        this.state = null; // Clear cache
    }

    /**
     * Check if currently in GM hotbar mode
     * @returns {boolean} True if in GM hotbar mode
     */
    isGMHotbarMode() {
        return !this.currentActor &&
            game.user.isGM &&
            game.settings.get(this.MODULE_ID, 'enableGMHotbar');
    }

    /**
     * Load complete state from actor flags or GM hotbar data
     * Always returns a valid state object with defaults
     * Includes automatic migration from old flag format
     * @returns {Promise<Object>} Complete HUD state
     */
    async loadState() {
        // Check if in GM hotbar mode
        if (this.isGMHotbarMode()) {
            const gmHotbarData = game.settings.get(this.MODULE_ID, 'gmHotbarData');
            if (gmHotbarData) {
                this.state = foundry.utils.deepClone(gmHotbarData);
                // Ensure GM hotbar state has proper structure
                if (!this.state.hotbar || !this.state.hotbar.grids) {
                    this.state = this._getDefaultGMHotbarState();
                }
                return this.state;
            }
            // No GM hotbar data, return default GM hotbar state
            this.state = this._getDefaultGMHotbarState();
            return this.state;
        }

        if (!this.currentActor) {
            console.warn('BG3 HUD Core | PersistenceManager: No actor, returning defaults');
            return this._getDefaultState();
        }

        // Try to load unified state
        let savedState = this.currentActor.getFlag(this.MODULE_ID, this.FLAG_NAME);

        if (savedState && savedState.version === this.VERSION) {
            this.state = foundry.utils.deepClone(savedState);
            // Migrate quickAccess from array to object if needed
            this._migrateQuickAccessFormat(this.state);
            // Ensure views structure exists
            this._ensureViewsStructure(this.state);
            return this.state;
        }

        // Check for version 1 state (needs views migration)
        if (savedState && savedState.version === 1) {
            console.log('BG3 HUD Core | PersistenceManager: Migrating from version 1 to version 2 (views)');
            this.state = await this._migrateToVersion2(savedState);
            await this.saveState(this.state);
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
     * Hydrate cell data from UUIDs to ensure fresh data
     * Re-fetches item data and uses adapter's transformation
     * This ensures quantity, uses, and other system-specific data are current
     * @param {Object} state - The loaded state to hydrate
     * @returns {Promise<Object>} Hydrated state
     */
    async hydrateState(state) {
        const adapter = ui.BG3HOTBAR?.registry?.activeAdapter;
        if (!adapter || typeof adapter.transformItemToCellData !== 'function') {
            console.warn('BG3 HUD Core | PersistenceManager: No adapter or transform method available for hydration');
            return state;
        }

        let totalItems = 0;
        let hydratedItems = 0;

        // Hydrate hotbar grids
        if (state.hotbar?.grids) {
            for (let i = 0; i < state.hotbar.grids.length; i++) {
                const grid = state.hotbar.grids[i];
                if (grid.items) {
                    const counts = await this._hydrateItemsObject(grid.items, adapter, `hotbar.grid[${i}]`);
                    totalItems += counts.total;
                    hydratedItems += counts.hydrated;
                }
            }
        }

        // Hydrate weapon sets
        if (state.weaponSets?.sets) {
            for (let i = 0; i < state.weaponSets.sets.length; i++) {
                const set = state.weaponSets.sets[i];
                if (set.items) {
                    const counts = await this._hydrateItemsObject(set.items, adapter, `weaponSets.set[${i}]`);
                    totalItems += counts.total;
                    hydratedItems += counts.hydrated;
                }
            }
        }

        // Hydrate quick access (grids array)
        if (state.quickAccess?.grids) {
            for (let i = 0; i < state.quickAccess.grids.length; i++) {
                const grid = state.quickAccess.grids[i];
                if (grid?.items) {
                    const counts = await this._hydrateItemsObject(grid.items, adapter, `quickAccess.grid[${i}]`);
                    totalItems += counts.total;
                    hydratedItems += counts.hydrated;
                }
            }
        }

        return state;
    }

    /**
     * Hydrate a single items object (slotKey: cellData mapping)
     * @param {Object} items - Items object to hydrate
     * @param {Object} adapter - The system adapter
     * @param {string} containerPath - Debug path (e.g., "hotbar.grid[0]")
     * @returns {Object} Counts of total and hydrated items
     * @private
     */
    async _hydrateItemsObject(items, adapter, containerPath = 'unknown') {
        let total = 0;
        let hydrated = 0;

        for (const slotKey in items) {
            const cellData = items[slotKey];
            total++;

            // Skip Macro cells - they are world-level documents that don't need hydration
            // and passing them to adapter.transformItemToCellData() causes validation errors
            // because "script" is not a valid Item type
            if (cellData?.type === 'Macro') {
                continue;
            }

            if (cellData?.uuid) {
                try {
                    const item = await fromUuid(cellData.uuid);
                    if (item) {
                        // Re-transform using adapter to get fresh data
                        const freshData = await adapter.transformItemToCellData(item);
                        if (freshData) {
                            items[slotKey] = freshData;
                            hydrated++;
                        } else {
                            console.warn(`BG3 HUD Core | ✗ Transform returned null for ${containerPath}[${slotKey}]`);
                        }
                    } else {
                        console.warn(`BG3 HUD Core | ✗ Could not resolve UUID for ${containerPath}[${slotKey}]:`, cellData.uuid);
                    }
                } catch (error) {
                    console.error(`BG3 HUD Core | ✗ Failed to hydrate ${containerPath}[${slotKey}]:`, error);
                }
            }
        }

        return { total, hydrated };
    }

    /**
     * Save complete state to actor flags or GM hotbar data
     * Includes concurrency protection and revision tracking
     * @param {Object} state - Complete HUD state
     * @returns {Promise<void>}
     */
    async saveState(state) {
        // Check if in GM hotbar mode
        if (this.isGMHotbarMode()) {
            // Save to GM hotbar data setting
            await game.settings.set(this.MODULE_ID, 'gmHotbarData', state);
            this.state = foundry.utils.deepClone(state);
            return;
        }

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

            // Mark that we're saving locally (to prevent reload on updateActor hook)
            this._lastSaveTimestamp = Date.now();

            await this.currentActor.setFlag(this.MODULE_ID, this.FLAG_NAME, state);
            this.state = foundry.utils.deepClone(state);
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
        const { container, slotKey, data, parentCell } = options;
        const containerIndex = options.containerIndex ?? 0;

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
                    state.quickAccess = { grids: [{ rows: 2, cols: 3, items: {} }] };
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
            case 'containerPopover': {
                // Container popovers save nested within their parent cell's data
                if (!parentCell) {
                    console.error('BG3 HUD Core | PersistenceManager: No parent cell provided for containerPopover');
                    return;
                }

                // Get the parent container's state
                let parentGrid;
                switch (parentCell.containerType) {
                    case 'hotbar':
                        parentGrid = state.hotbar?.grids?.[parentCell.containerIndex];
                        break;
                    case 'quickAccess':
                        if (!state.quickAccess?.grids) {
                            state.quickAccess = { grids: [{ rows: 2, cols: 3, items: {} }] };
                        }
                        parentGrid = state.quickAccess.grids[parentCell.containerIndex];
                        break;
                    case 'weaponSet':
                        parentGrid = state.weaponSets?.sets?.[parentCell.containerIndex];
                        break;
                    default:
                        console.error('BG3 HUD Core | PersistenceManager: Unknown parent container type:', parentCell.containerType);
                        return;
                }

                if (!parentGrid) {
                    console.error('BG3 HUD Core | PersistenceManager: Parent grid not found', {
                        parentType: parentCell.containerType,
                        parentIndex: parentCell.containerIndex
                    });
                    return;
                }

                const parentSlotKey = parentCell.getSlotKey();
                const parentCellData = parentGrid.items[parentSlotKey];

                if (!parentCellData) {
                    console.error('BG3 HUD Core | PersistenceManager: Parent cell has no data', {
                        parentSlotKey,
                        availableSlots: Object.keys(parentGrid.items)
                    });
                    return;
                }

                // Initialize containerGrid if it doesn't exist
                if (!parentCellData.containerGrid) {
                    parentCellData.containerGrid = {
                        rows: 3,
                        cols: 5,
                        items: {}
                    };
                }

                // Update the nested item
                parentCellData.containerGrid.items[slotKey] = data;

                // CRITICAL: Update the parent cell's in-memory data so it reflects the changes
                // This ensures the popover reads the correct data when reopened
                if (parentCell.data) {
                    if (!parentCell.data.containerGrid) {
                        parentCell.data.containerGrid = {
                            rows: 3,
                            cols: 5,
                            items: {}
                        };
                    }
                    parentCell.data.containerGrid.items[slotKey] = data;
                }

                break;
            }
            default:
                console.warn('BG3 HUD Core | PersistenceManager: Unknown container type:', container);
                return;
        }

        // Sync changes to active view's hotbar state
        this._syncCurrentStateToActiveView(state);

        // Save the entire state (Foundry broadcasts to all clients via updateActor hook)
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

        // Sync to active view
        this._syncCurrentStateToActiveView(state);

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

        // Sync to active view
        this._syncCurrentStateToActiveView(state);

        await this.saveState(state);
    }

    /**
     * Update row count for ALL hotbar grids at once
     * Batches the operation into a single save to prevent race conditions
     * @param {number} rowChange - Change in rows (+1 or -1)
     * @returns {Promise<void>}
     */
    async updateAllGridsRows(rowChange) {
        const state = await this.loadState();
        const grids = state.hotbar.grids;

        // Validation: Check if any grid would go below 1 row
        if (rowChange < 0) {
            const minRows = Math.min(...grids.map(g => g.rows));
            if (minRows + rowChange < 1) return;
        }

        // Apply change to all grids
        for (const grid of grids) {
            grid.rows += rowChange;
        }

        // Sync to active view
        this._syncCurrentStateToActiveView(state);

        // Single save for all grids
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
                if (!state.quickAccess || !Array.isArray(state.quickAccess.grids)) {
                    state.quickAccess = { grids: [{ rows: 2, cols: 3, items: {} }] };
                }
                if (!state.quickAccess.grids[containerIndex]) {
                    state.quickAccess.grids[containerIndex] = { rows: 2, cols: 3, items: {} };
                }
                state.quickAccess.grids[containerIndex].items = items;
                break;

            case 'containerPopover':
                // Container popovers save their grid state nested within the parent container item's cell data
                // The containerIndex for popovers is actually the parent cell's slot key
                return;

            default:
                console.error('BG3 HUD Core | PersistenceManager: Unknown container type:', containerType);
                return;
        }

        // Sync to active view
        this._syncCurrentStateToActiveView(state);

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
        if (Array.isArray(state.quickAccess?.grids)) {
            for (const grid of state.quickAccess.grids) {
                grid.items = {};
            }
        }

        // Sync to active view
        this._syncCurrentStateToActiveView(state);

        await this.saveState(state);
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
                grids: [{ rows, cols, items }]
            };
            console.log('BG3 HUD Core | PersistenceManager: QuickAccess wrapped into grids[]');
        }
    }

    /**
     * Get default GM hotbar state structure
     * GM hotbar only includes hotbar grids (no weapon sets, quick access, or views)
     * @returns {Object} Default GM hotbar state
     * @private
     */
    _getDefaultGMHotbarState() {
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
            }
        };
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

        const hotbarState = {
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

        const defaultViewId = this._generateViewId();

        return {
            version: this.VERSION,
            views: {
                list: [
                    {
                        id: defaultViewId,
                        name: 'Default',
                        icon: 'fa-bookmark',
                        hotbarState: foundry.utils.deepClone(hotbarState)
                    }
                ],
                activeViewId: defaultViewId
            },
            // Current hotbar state (synced with active view)
            ...hotbarState
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

    /* ==========================================================================
       VIEW MANAGEMENT METHODS
       ========================================================================== */

    /**
     * Create a new view with empty hotbar state
     * @param {string} name - View name
     * @param {string|null} icon - Font Awesome icon class (optional)
     * @returns {Promise<string>} New view ID
     */
    async createView(name, icon = null) {
        const state = await this.loadState();

        // Generate new view ID
        const viewId = this._generateViewId();

        // Create empty hotbar state for new view
        const emptyHotbarState = this._getEmptyHotbarState();

        // Create new view
        const newView = {
            id: viewId,
            name: name,
            icon: icon || 'fa-bookmark',
            hotbarState: emptyHotbarState
        };

        // Add view to list
        state.views.list.push(newView);

        // Switch to new view (this will load the empty state)
        state.views.activeViewId = viewId;

        // Load the new view's empty hotbar state into current state
        state.hotbar = foundry.utils.deepClone(emptyHotbarState.hotbar);

        await this.saveState(state);

        console.log('BG3 HUD Core | PersistenceManager: Created empty view:', name);
        return viewId;
    }

    /**
     * Delete a view
     * @param {string} viewId - View ID to delete
     * @returns {Promise<void>}
     */
    async deleteView(viewId) {
        let state = await this.loadState();

        // Can't delete if it's the only view
        if (state.views.list.length <= 1) {
            console.warn('BG3 HUD Core | PersistenceManager: Cannot delete the only view');
            return;
        }

        // Find view index
        const viewIndex = state.views.list.findIndex(v => v.id === viewId);
        if (viewIndex === -1) {
            console.warn('BG3 HUD Core | PersistenceManager: View not found:', viewId);
            return;
        }

        // If deleting active view, switch to another view first
        if (state.views.activeViewId === viewId) {
            // Switch to first available view that's not this one
            const newActiveView = state.views.list.find(v => v.id !== viewId);
            if (newActiveView) {
                await this.switchView(newActiveView.id);
                // Reload state after switch
                state = await this.loadState();
            }
        }

        // Remove view from list
        state.views.list.splice(viewIndex, 1);

        await this.saveState(state);

        console.log('BG3 HUD Core | PersistenceManager: Deleted view:', viewId);
    }

    /**
     * Switch to a different view
     * @param {string} viewId - View ID to switch to
     * @returns {Promise<void>}
     */
    async switchView(viewId) {
        const state = await this.loadState();

        // Find the view
        const view = state.views.list.find(v => v.id === viewId);
        if (!view) {
            console.warn('BG3 HUD Core | PersistenceManager: View not found:', viewId);
            return;
        }

        // Update active view ID
        state.views.activeViewId = viewId;

        // Load the view's hotbar state into current state (views only affect hotbar)
        state.hotbar = foundry.utils.deepClone(view.hotbarState.hotbar);

        await this.saveState(state);

    }

    /**
     * Rename a view
     * @param {string} viewId - View ID to rename
     * @param {string} newName - New view name
     * @param {string|null} newIcon - New icon (optional)
     * @returns {Promise<void>}
     */
    async renameView(viewId, newName, newIcon = null) {
        const state = await this.loadState();

        // Find the view
        const view = state.views.list.find(v => v.id === viewId);
        if (!view) {
            console.warn('BG3 HUD Core | PersistenceManager: View not found:', viewId);
            return;
        }

        // Update name and icon
        view.name = newName;
        if (newIcon !== null) {
            view.icon = newIcon;
        }

        await this.saveState(state);

        console.log('BG3 HUD Core | PersistenceManager: Renamed view to:', newName);
    }

    /**
     * Duplicate a view
     * @param {string} viewId - View ID to duplicate
     * @param {string|null} newName - Name for duplicated view (optional)
     * @returns {Promise<string>} New view ID
     */
    async duplicateView(viewId, newName = null) {
        const state = await this.loadState();

        // Find the view to duplicate
        const sourceView = state.views.list.find(v => v.id === viewId);
        if (!sourceView) {
            console.warn('BG3 HUD Core | PersistenceManager: View not found:', viewId);
            return null;
        }

        // Generate new view ID
        const newViewId = this._generateViewId();

        // Create duplicate view
        const duplicateView = {
            id: newViewId,
            name: newName || `${sourceView.name} (Copy)`,
            icon: sourceView.icon,
            hotbarState: foundry.utils.deepClone(sourceView.hotbarState)
        };

        // Add to list
        state.views.list.push(duplicateView);

        await this.saveState(state);

        console.log('BG3 HUD Core | PersistenceManager: Duplicated view:', duplicateView.name);
        return newViewId;
    }

    /**
     * Update a view with current hotbar state
     * @param {string|null} viewId - View ID to update (null = active view)
     * @returns {Promise<void>}
     */
    async updateView(viewId = null) {
        const state = await this.loadState();

        // Default to active view if not specified
        const targetViewId = viewId || state.views.activeViewId;

        // Find the view
        const view = state.views.list.find(v => v.id === targetViewId);
        if (!view) {
            console.warn('BG3 HUD Core | PersistenceManager: View not found:', targetViewId);
            return;
        }

        // Update view's hotbar state with current state
        view.hotbarState = {
            hotbar: foundry.utils.deepClone(state.hotbar),
            weaponSets: foundry.utils.deepClone(state.weaponSets),
            quickAccess: foundry.utils.deepClone(state.quickAccess)
        };

        await this.saveState(state);

        console.log('BG3 HUD Core | PersistenceManager: Updated view:', view.name);
    }

    /**
     * Get all views
     * @returns {Array<Object>} List of views
     */
    getViews() {
        if (!this.state?.views?.list) return [];
        return foundry.utils.deepClone(this.state.views.list);
    }

    /**
     * Get active view ID
     * @returns {string|null} Active view ID
     */
    getActiveViewId() {
        return this.state?.views?.activeViewId || null;
    }

    /**
     * Get a specific view
     * @param {string} viewId - View ID
     * @returns {Object|null} View data or null
     */
    getView(viewId) {
        const view = this.state?.views?.list?.find(v => v.id === viewId);
        return view ? foundry.utils.deepClone(view) : null;
    }

    /**
     * Get active view
     * @returns {Object|null} Active view data or null
     */
    getActiveView() {
        const activeViewId = this.getActiveViewId();
        return activeViewId ? this.getView(activeViewId) : null;
    }

    /* ==========================================================================
       HELPER METHODS FOR VIEWS
       ========================================================================== */

    /**
     * Generate a unique view ID
     * @returns {string} Unique view ID
     * @private
     */
    _generateViewId() {
        return `view-${foundry.utils.randomID(16)}`;
    }

    /**
     * Sync current hotbar state to the active view's stored hotbarState
     * This ensures the active view stays up-to-date with any changes
     * @param {Object} state - Current state
     * @private
     */
    _syncCurrentStateToActiveView(state) {
        if (!state.views || !state.views.activeViewId) return;

        const activeView = state.views.list.find(v => v.id === state.views.activeViewId);
        if (!activeView) return;

        // Update the active view's hotbar state with current hotbar state only
        activeView.hotbarState = {
            hotbar: foundry.utils.deepClone(state.hotbar)
        };
    }

    /**
     * Get empty hotbar state (for new views)
     * @returns {Object} Empty hotbar state
     * @private
     */
    _getEmptyHotbarState() {
        const grids = [];
        for (let i = 0; i < this.DEFAULT_GRID_CONFIG.gridCount; i++) {
            grids.push({
                rows: this.DEFAULT_GRID_CONFIG.rows,
                cols: this.DEFAULT_GRID_CONFIG.cols,
                items: {}
            });
        }

        return {
            hotbar: {
                grids: grids
            }
        };
    }

    /**
     * Ensure views structure exists in state
     * @param {Object} state - HUD state
     * @private
     */
    _ensureViewsStructure(state) {
        if (!state.views) {
            // Create default view from current hotbar state only
            const defaultView = {
                id: this._generateViewId(),
                name: 'Default',
                icon: 'fa-bookmark',
                hotbarState: {
                    hotbar: foundry.utils.deepClone(state.hotbar)
                }
            };

            state.views = {
                list: [defaultView],
                activeViewId: defaultView.id
            };
        } else if (!state.views.activeViewId && state.views.list.length > 0) {
            // Set first view as active if none is set
            state.views.activeViewId = state.views.list[0].id;
        }
    }

    /**
     * Migrate from version 1 to version 2 (add views structure)
     * @param {Object} oldState - Version 1 state
     * @returns {Object} Version 2 state
     * @private
     */
    _migrateToVersion2(oldState) {
        // Create default view from existing hotbar state only
        const defaultView = {
            id: this._generateViewId(),
            name: 'Default',
            icon: 'fa-bookmark',
            hotbarState: {
                hotbar: foundry.utils.deepClone(oldState.hotbar)
            }
        };

        return {
            version: 2,
            views: {
                list: [defaultView],
                activeViewId: defaultView.id
            },
            // Keep current hotbar state
            hotbar: oldState.hotbar,
            weaponSets: oldState.weaponSets,
            quickAccess: oldState.quickAccess
        };
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

        // Check weapon sets (GM hotbar mode doesn't have weapon sets)
        if (this.state.weaponSets?.sets) {
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
        }

        // Check quick access (grids array)
        if (this.state.quickAccess?.grids) {
            if (excludeContainer !== 'quickAccess') {
                for (let i = 0; i < this.state.quickAccess.grids.length; i++) {
                    const grid = this.state.quickAccess.grids[i];
                    for (const [slotKey, item] of Object.entries(grid?.items || {})) {
                        if (item?.uuid === uuid) {
                            return { container: 'quickAccess', containerIndex: i, slotKey };
                        }
                    }
                }
            } else if (excludeContainerIndex !== undefined) {
                // Check other quick access grids
                for (let i = 0; i < this.state.quickAccess.grids.length; i++) {
                    if (i === excludeContainerIndex) continue;
                    const grid = this.state.quickAccess.grids[i];
                    for (const [slotKey, item] of Object.entries(grid?.items || {})) {
                        if (item?.uuid === uuid) {
                            return { container: 'quickAccess', containerIndex: i, slotKey };
                        }
                    }
                }
                // Check the same grid but different slots
                const sameGrid = this.state.quickAccess.grids[excludeContainerIndex];
                for (const [slotKey, item] of Object.entries(sameGrid?.items || {})) {
                    if (slotKey !== excludeSlotKey && item?.uuid === uuid) {
                        return { container: 'quickAccess', containerIndex: excludeContainerIndex, slotKey };
                    }
                }
            }
        }

        return null;
    }

    /**
     * Check if a specific PreparedSpell slot already exists in the HUD
     * Uses entryId + groupId + slotId to identify unique slots
     * @param {string} entryId - Spellcasting entry ID
     * @param {number} groupId - Spell rank (0-10)
     * @param {number} slotId - Slot index within the rank
     * @returns {Object|null} Location where slot exists {container, containerIndex, slotKey}, or null if not found
     */
    findPreparedSpellSlot(entryId, groupId, slotId) {
        if (!entryId || !this.state) return null;

        // Helper to check a container's items
        const checkContainer = (items, containerType, containerIndex) => {
            for (const [slotKey, item] of Object.entries(items || {})) {
                if (item?.type === 'PreparedSpell' &&
                    item.entryId === entryId &&
                    item.groupId === groupId &&
                    item.slotId === slotId) {
                    return { container: containerType, containerIndex, slotKey };
                }
            }
            return null;
        };

        // Check hotbar grids
        for (let i = 0; i < this.state.hotbar.grids.length; i++) {
            const result = checkContainer(this.state.hotbar.grids[i].items, 'hotbar', i);
            if (result) return result;
        }

        // Check weapon sets
        if (this.state.weaponSets?.sets) {
            for (let i = 0; i < this.state.weaponSets.sets.length; i++) {
                const result = checkContainer(this.state.weaponSets.sets[i].items, 'weaponSet', i);
                if (result) return result;
            }
        }

        // Check quick access
        if (this.state.quickAccess?.grids) {
            for (let i = 0; i < this.state.quickAccess.grids.length; i++) {
                const result = checkContainer(this.state.quickAccess.grids[i]?.items, 'quickAccess', i);
                if (result) return result;
            }
        }

        return null;
    }

}

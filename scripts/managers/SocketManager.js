/**
 * Socket Manager
 * Handles real-time synchronization of HUD updates across all clients
 * Uses socketlib for instant UI updates without waiting for server roundtrip
 * 
 * Multi-user sync strategy:
 * - Updates are broadcast to all clients viewing the same actor
 * - Batching collects updates within a short window before applying
 * - Coalescing deduplicates and orders updates (shape changes before content)
 * - Server state is authoritative - reconciliation happens on flag update
 */
export class SocketManager {
    constructor(hotbarApp) {
        this.hotbarApp = hotbarApp;
        this.socket = null;
        this.MODULE_ID = 'bg3-hud-core';

        // Inbound batching (receiving updates from other clients)
        this._updateQueue = [];
        this._updateTimeout = null;
        this._batchDelay = 50; // ms - batch updates within this window
        this._isProcessing = false; // Prevent concurrent batch processing

        // Outbound batching (sending updates to other clients)
        this._outboundQueue = [];
        this._outboundTimeout = null;
        this._outboundDelay = 100; // ms - collect updates within this window before sending
    }

    /**
     * Initialize socket connection
     * Requires socketlib module to be active
     */
    initialize() {
        // Check if socketlib is available
        if (!game.modules.get('socketlib')?.active) {
            console.warn('BG3 HUD Core | socketlib not available - real-time sync disabled');
            return false;
        }

        try {
            this.socket = socketlib.registerModule(this.MODULE_ID);

            // Register socket handlers
            this.socket.register('hudStateUpdate', this._onHudStateUpdate.bind(this));

            console.log('BG3 HUD Core | Socket manager initialized');
            return true;
        } catch (error) {
            console.error('BG3 HUD Core | Failed to initialize socket manager:', error);
            return false;
        }
    }

    /**
     * Broadcast HUD state update to all clients
     * Updates are queued and debounced to prevent flooding during rapid operations
     * @param {string} actorUuid - Actor UUID
     * @param {Object} updateData - Update payload
     */
    async broadcastUpdate(actorUuid, updateData) {
        if (!this.socket) return;

        // Add timestamp for ordering
        updateData.timestamp = Date.now();

        // Queue the update for batched sending
        this._outboundQueue.push({ actorUuid, updateData });

        // Reset debounce timer
        if (this._outboundTimeout) {
            clearTimeout(this._outboundTimeout);
        }

        this._outboundTimeout = setTimeout(() => {
            this._flushOutboundQueue();
        }, this._outboundDelay);
    }

    /**
     * Flush outbound queue - coalesce and send all pending updates
     * Groups updates by actor, coalesces them, and sends as batch payloads
     * @private
     */
    async _flushOutboundQueue() {
        if (this._outboundQueue.length === 0) return;

        const updates = [...this._outboundQueue];
        this._outboundQueue = [];
        this._outboundTimeout = null;

        // Group by actorUuid
        const byActor = new Map();
        for (const { actorUuid, updateData } of updates) {
            if (!byActor.has(actorUuid)) {
                byActor.set(actorUuid, []);
            }
            byActor.get(actorUuid).push(updateData);
        }

        // Send coalesced updates per actor
        for (const [actorUuid, actorUpdates] of byActor) {
            // Coalesce to remove redundant updates
            const coalesced = this._coalesceUpdates(actorUpdates);

            if (coalesced.length === 0) continue;

            try {
                // Send as batch payload
                await this.socket.executeForEveryone('hudStateUpdate', actorUuid, {
                    type: 'batch',
                    updates: coalesced,
                    userId: game.user.id,
                    timestamp: Date.now()
                });
            } catch (error) {
                console.error('BG3 HUD Core | Failed to broadcast batch update:', error);
            }
        }
    }

    /**
     * Handle incoming HUD state update from another client
     * Batches updates to prevent incremental rendering
     * @param {string} actorUuid - Actor UUID
     * @param {Object} updateData - Update payload (may be a batch or single update)
     * @private
     */
    async _onHudStateUpdate(actorUuid, updateData) {
        // Ignore if we don't have a current actor or it's not the same actor
        if (!this.hotbarApp.currentActor || this.hotbarApp.currentActor.uuid !== actorUuid) {
            return;
        }

        // Ignore updates from self (we already have optimistic update)
        if (updateData.userId === game.user.id) {
            return;
        }

        // Handle batch payloads (coalesced updates from sender)
        if (updateData.type === 'batch' && Array.isArray(updateData.updates)) {
            for (const update of updateData.updates) {
                this._updateQueue.push(update);
            }
        } else {
            // Single update (legacy or non-batched)
            this._updateQueue.push(updateData);
        }

        // Clear existing timeout
        if (this._updateTimeout) {
            clearTimeout(this._updateTimeout);
        }

        // Set new timeout to process batch
        this._updateTimeout = setTimeout(() => {
            this._processBatchedUpdates();
        }, this._batchDelay);
    }

    /**
     * Coalesce queued updates to prevent conflicts and redundant renders
     * - Deduplicates: keeps only the latest update per target (grid/cell/container)
     * - Orders: shape changes (gridConfig) before content changes (cellUpdate)
     * - Filters: removes cell updates for slots that will be lost after grid shrink
     * @param {Array} updates - Raw update queue
     * @returns {Array} Coalesced and ordered updates
     * @private
     */
    _coalesceUpdates(updates) {
        // Group updates by type and target
        const gridConfigs = new Map(); // gridIndex -> latest config
        const cellUpdates = new Map(); // "container-index-slot" -> latest update
        const containerUpdates = new Map(); // "type-index" -> latest update
        let weaponSetChange = null; // Only keep latest weapon set change
        let clearAll = null;

        for (const update of updates) {
            switch (update.type) {
                case 'clearAll':
                    // clearAll supersedes everything before it
                    clearAll = update;
                    gridConfigs.clear();
                    cellUpdates.clear();
                    containerUpdates.clear();
                    weaponSetChange = null;
                    break;

                case 'gridConfig':
                    // Keep latest grid config per grid index
                    gridConfigs.set(update.gridIndex, update);
                    break;

                case 'cellUpdate': {
                    const key = `${update.container}-${update.containerIndex}-${update.slotKey}`;
                    cellUpdates.set(key, update);
                    break;
                }

                case 'containerUpdate': {
                    const key = `${update.containerType}-${update.containerIndex}`;
                    // Container update supersedes individual cell updates for same container
                    containerUpdates.set(key, update);
                    // Remove any cell updates for this container
                    for (const cellKey of cellUpdates.keys()) {
                        if (cellKey.startsWith(`${update.containerType}-${update.containerIndex}-`)) {
                            cellUpdates.delete(cellKey);
                        }
                    }
                    break;
                }

                case 'weaponSetChange':
                    // Keep only the latest weapon set change
                    weaponSetChange = update;
                    break;
            }
        }

        // Filter out cell updates that target slots outside new grid dimensions
        for (const [key, cellUpdate] of cellUpdates.entries()) {
            if (cellUpdate.container === 'hotbar') {
                const gridConfig = gridConfigs.get(cellUpdate.containerIndex);
                if (gridConfig) {
                    const [col, row] = cellUpdate.slotKey.split('-').map(Number);
                    const newRows = gridConfig.config.rows;
                    const newCols = gridConfig.config.cols;
                    if ((newRows !== undefined && row >= newRows) ||
                        (newCols !== undefined && col >= newCols)) {
                        cellUpdates.delete(key);
                    }
                }
            }
        }

        // Build ordered result: clearAll -> gridConfigs -> containerUpdates -> weaponSetChange -> cellUpdates
        const result = [];

        if (clearAll) {
            result.push(clearAll);
        }

        // Grid configs first (shape changes)
        for (const config of gridConfigs.values()) {
            result.push(config);
        }

        // Container updates (bulk content)
        for (const container of containerUpdates.values()) {
            result.push(container);
        }

        // Weapon set change
        if (weaponSetChange) {
            result.push(weaponSetChange);
        }

        // Cell updates last (individual content)
        for (const cell of cellUpdates.values()) {
            result.push(cell);
        }

        return result;
    }

    /**
     * Process all queued updates in a single batch
     * Coalesces updates to prevent conflicts and minimize renders
     * Applies grid config changes atomically to prevent visual jank
     * @private
     */
    async _processBatchedUpdates() {
        if (this._updateQueue.length === 0 || this._isProcessing) return;

        this._isProcessing = true;

        try {
            const rawUpdates = [...this._updateQueue];
            this._updateQueue = [];
            this._updateTimeout = null;

            // Coalesce updates to prevent conflicts
            const updates = this._coalesceUpdates(rawUpdates);

            // Separate grid config updates from other updates
            // Grid configs must be applied atomically (all together) before any content updates
            const gridConfigUpdates = [];
            const otherUpdates = [];

            for (const update of updates) {
                if (update.type === 'gridConfig') {
                    gridConfigUpdates.push(update);
                } else {
                    otherUpdates.push(update);
                }
            }

            // Apply all grid config changes atomically (update data, then render all together)
            if (gridConfigUpdates.length > 0) {
                await this._applyGridConfigUpdatesAtomically(gridConfigUpdates);
            }

            // Process other updates in order
            for (const updateData of otherUpdates) {
                switch (updateData.type) {
                    case 'cellUpdate':
                        await this._applyCellUpdate(updateData);
                        break;
                    case 'containerUpdate':
                        await this._applyContainerUpdate(updateData);
                        break;
                    case 'weaponSetChange':
                        await this._applyWeaponSetChange(updateData);
                        break;
                    case 'clearAll':
                        await this._applyClearAll(updateData);
                        break;
                }
            }

            // Update persistence manager's cached state to match
            await this._syncCachedState();

        } finally {
            this._isProcessing = false;
        }
    }

    /**
     * Sync persistence manager's cached state with current UI state
     * Ensures consistency after remote updates
     * @private
     */
    async _syncCachedState() {
        const persistenceManager = this.hotbarApp.persistenceManager;
        if (!persistenceManager || !persistenceManager.state) return;

        const state = persistenceManager.state;
        const components = this.hotbarApp.components;

        // Sync hotbar grids
        if (components?.hotbar?.gridContainers) {
            for (let i = 0; i < components.hotbar.gridContainers.length; i++) {
                const gridContainer = components.hotbar.gridContainers[i];
                if (state.hotbar?.grids?.[i]) {
                    state.hotbar.grids[i].rows = gridContainer.rows;
                    state.hotbar.grids[i].cols = gridContainer.cols;
                    state.hotbar.grids[i].items = { ...gridContainer.items };
                }
            }
        }

        // Sync weapon sets
        if (components?.weaponSets?.gridContainers) {
            for (let i = 0; i < components.weaponSets.gridContainers.length; i++) {
                const gridContainer = components.weaponSets.gridContainers[i];
                if (state.weaponSets?.sets?.[i]) {
                    state.weaponSets.sets[i].items = { ...gridContainer.items };
                }
            }
        }

        // Sync quick access
        if (components?.quickAccess?.gridContainers?.[0]) {
            const gridContainer = components.quickAccess.gridContainers[0];
            if (state.quickAccess?.grids?.[0]) {
                state.quickAccess.grids[0].items = { ...gridContainer.items };
            }
        }
    }

    /**
     * Apply multiple grid configuration updates atomically
     * Updates all grid data structures first, then triggers parent container render
     * This ensures all grids, separators, and layout elements update together
     * Prevents visual jank when multiple grids change shape simultaneously
     * @param {Array} gridConfigUpdates - Array of grid config update objects
     * @private
     */
    async _applyGridConfigUpdatesAtomically(gridConfigUpdates) {
        const hotbarContainer = this.hotbarApp.components?.hotbar;
        if (!hotbarContainer) return;

        // Phase 1: Update all grid data structures (no rendering yet)
        for (const updateData of gridConfigUpdates) {
            const { gridIndex, config } = updateData;

            if (hotbarContainer.grids[gridIndex]) {
                // Update grid data in the parent container's grids array
                if (config.rows !== undefined) {
                    hotbarContainer.grids[gridIndex].rows = config.rows;
                }
                if (config.cols !== undefined) {
                    hotbarContainer.grids[gridIndex].cols = config.cols;
                }
            }
        }

        // Phase 2: Trigger parent HotbarContainer render
        // This will update all child gridContainers, separators, and layout together
        // The HotbarContainer.render() method handles batching all grid updates atomically
        await hotbarContainer.render();
    }

    /**
     * Apply grid configuration update (row/col changes)
     * Legacy method - kept for compatibility but prefer _applyGridConfigUpdatesAtomically
     * @param {Object} updateData
     * @param {Set} [containersToRender] - Optional set to track containers needing render
     * @private
     */
    async _applyGridConfigUpdate(updateData, containersToRender) {
        const { gridIndex, config } = updateData;
        const hotbarContainer = this.hotbarApp.components?.hotbar;

        if (!hotbarContainer) return;

        // Update grid data
        if (hotbarContainer.grids[gridIndex]) {
            if (config.rows !== undefined) {
                hotbarContainer.grids[gridIndex].rows = config.rows;
            }
            if (config.cols !== undefined) {
                hotbarContainer.grids[gridIndex].cols = config.cols;
            }

            // Update grid container
            const gridContainer = hotbarContainer.gridContainers[gridIndex];
            if (gridContainer) {
                gridContainer.rows = hotbarContainer.grids[gridIndex].rows;
                gridContainer.cols = hotbarContainer.grids[gridIndex].cols;

                // If tracking containers, mark for render; otherwise render immediately
                if (containersToRender) {
                    containersToRender.add(`hotbar-${gridIndex}`);
                }
                await gridContainer.render();
            }
        }
    }

    /**
     * Apply cell update
     * @param {Object} updateData
     * @private
     */
    async _applyCellUpdate(updateData) {
        const { container, containerIndex, slotKey, data } = updateData;

        // Find the appropriate container and update the cell
        let targetContainer = null;

        switch (container) {
            case 'hotbar':
                targetContainer = this.hotbarApp.components?.hotbar?.gridContainers[containerIndex];
                break;
            case 'weaponSet':
                targetContainer = this.hotbarApp.components?.weaponSets?.gridContainers[containerIndex];
                break;
            case 'quickAccess':
                targetContainer = this.hotbarApp.components?.quickAccess?.gridContainers[0];
                break;
        }

        if (!targetContainer) return;

        // Validate slot is within grid bounds (safety check after grid config changes)
        const [col, row] = slotKey.split('-').map(Number);
        if (container === 'hotbar' && targetContainer.rows !== undefined && targetContainer.cols !== undefined) {
            if (row >= targetContainer.rows || col >= targetContainer.cols) {
                // Slot is outside grid bounds - skip this update
                // This can happen if a grid config change reduced the grid size
                // and a cell update for an old slot arrives after
                return;
            }
        }

        // Update the item data and re-render the specific cell
        targetContainer.items[slotKey] = data;

        // Find and update the cell
        const cell = targetContainer.getCell(col, row);
        if (cell) {
            await cell.setData(data, { skipSave: true });
        }
    }

    /**
     * Apply container update (full container refresh)
     * @param {Object} updateData
     * @private
     */
    async _applyContainerUpdate(updateData) {
        const { containerType, containerIndex, items } = updateData;

        let targetContainer = null;

        switch (containerType) {
            case 'hotbar':
                targetContainer = this.hotbarApp.components?.hotbar?.gridContainers[containerIndex];
                break;
            case 'weaponSet':
                targetContainer = this.hotbarApp.components?.weaponSets?.gridContainers[containerIndex];
                break;
            case 'quickAccess':
                targetContainer = this.hotbarApp.components?.quickAccess?.gridContainers[0];
                break;
        }

        if (targetContainer) {
            targetContainer.items = items;
            await targetContainer.render();
        }
    }

    /**
     * Apply weapon set change (active set switch)
     * @param {Object} updateData
     * @private
     */
    async _applyWeaponSetChange(updateData) {
        const { activeSet } = updateData;
        const weaponSetsContainer = this.hotbarApp.components?.weaponSets;

        if (weaponSetsContainer && typeof weaponSetsContainer.setActiveSet === 'function') {
            await weaponSetsContainer.setActiveSet(activeSet, true);
        }
    }

    /**
     * Apply clear all update
     * @param {Object} updateData
     * @private
     */
    async _applyClearAll(updateData) {
        const updates = [];

        // Clear hotbar grids
        const hotbarContainer = this.hotbarApp.components?.hotbar;
        if (hotbarContainer) {
            for (let i = 0; i < hotbarContainer.gridContainers.length; i++) {
                const gridContainer = hotbarContainer.gridContainers[i];
                gridContainer.items = {};
                updates.push(gridContainer.render());
            }
        }

        // Clear weapon sets
        const weaponSetsContainer = this.hotbarApp.components?.weaponSets;
        if (weaponSetsContainer) {
            for (let i = 0; i < weaponSetsContainer.gridContainers.length; i++) {
                const gridContainer = weaponSetsContainer.gridContainers[i];
                gridContainer.items = {};
                updates.push(gridContainer.render());
            }
        }

        // Clear quick access
        const quickAccessContainer = this.hotbarApp.components?.quickAccess;
        if (quickAccessContainer?.gridContainers[0]) {
            const gridContainer = quickAccessContainer.gridContainers[0];
            gridContainer.items = {};
            updates.push(gridContainer.render());
        }

        await Promise.all(updates);
    }
}


/**
 * Socket Manager
 * Handles real-time synchronization of HUD updates across all clients
 * Uses socketlib for instant UI updates without waiting for server roundtrip
 */
export class SocketManager {
    constructor(hotbarApp) {
        this.hotbarApp = hotbarApp;
        this.socket = null;
        this.MODULE_ID = 'bg3-hud-core';
        this._updateQueue = [];
        this._updateTimeout = null;
        this._batchDelay = 50; // ms - batch updates within this window
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
     * Called immediately after local optimistic update
     * @param {string} actorUuid - Actor UUID
     * @param {Object} updateData - Update payload
     */
    async broadcastUpdate(actorUuid, updateData) {
        if (!this.socket) return;

        try {
            await this.socket.executeForEveryone('hudStateUpdate', actorUuid, updateData);
        } catch (error) {
            console.error('BG3 HUD Core | Failed to broadcast update:', error);
        }
    }

    /**
     * Handle incoming HUD state update from another client
     * Batches updates to prevent incremental rendering
     * @param {string} actorUuid - Actor UUID
     * @param {Object} updateData - Update payload
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

        console.log('BG3 HUD Core | Received socket update:', updateData.type, 'from user', updateData.userId);

        // Add to queue and batch process
        this._updateQueue.push(updateData);
        
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
     * Process all queued updates in a single batch
     * @private
     */
    async _processBatchedUpdates() {
        if (this._updateQueue.length === 0) return;
        
        const updates = [...this._updateQueue];
        this._updateQueue = [];
        this._updateTimeout = null;
        
        console.log(`BG3 HUD Core | Processing ${updates.length} batched updates`);
        
        // Process all updates
        for (const updateData of updates) {
            switch (updateData.type) {
                case 'gridConfig':
                    await this._applyGridConfigUpdate(updateData);
                    break;
                case 'cellUpdate':
                    await this._applyCellUpdate(updateData);
                    break;
                case 'containerUpdate':
                    await this._applyContainerUpdate(updateData);
                    break;
                case 'clearAll':
                    await this._applyClearAll(updateData);
                    break;
                default:
                    console.warn('BG3 HUD Core | Unknown socket update type:', updateData.type);
            }
        }
        
        console.log('BG3 HUD Core | Batch update complete');
    }

    /**
     * Apply grid configuration update (row/col changes)
     * @param {Object} updateData
     * @private
     */
    async _applyGridConfigUpdate(updateData) {
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

        if (targetContainer) {
            // Update the item data and re-render the specific cell
            targetContainer.items[slotKey] = data;
            
            // Find and update the cell
            const [col, row] = slotKey.split('-').map(Number);
            const cell = targetContainer.getCell(col, row);
            if (cell) {
                await cell.setData(data, { skipSave: true });
            }
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


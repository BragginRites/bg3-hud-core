import { ContainerTypeDetector } from './ContainerTypeDetector.js';
import { SlotContextMenu } from '../components/ui/SlotContextMenu.js';

/**
 * Interaction Coordinator
 * Orchestrates cell interactions and drag/drop operations
 * Routes clicks to adapter, coordinates persistence
 * Context menus delegated to SlotContextMenu
 */
export class InteractionCoordinator {
    constructor(options = {}) {
        this.hotbarApp = options.hotbarApp;
        this.persistenceManager = options.persistenceManager;
        this.adapter = options.adapter;
        
        // Drag state tracking
        this.dragSourceCell = null;
        
        // Context menu builder (adapter set via setAdapter)
        this.contextMenu = new SlotContextMenu({
            interactionCoordinator: this,
            adapter: this.adapter
        });
    }

    /**
     * Update adapter reference (for late binding)
     * @param {Object} adapter
     */
    setAdapter(adapter) {
        this.adapter = adapter;
        this.contextMenu.adapter = adapter;
    }

    /**
     * Handle cell click
     * @param {GridCell} cell
     * @param {MouseEvent} event
     */
    handleClick(cell, event) {
        // Block clicks on inactive weapon set cells
        if (ContainerTypeDetector.isWeaponSet(cell)) {
            const weaponContainer = this.hotbarApp.components.weaponSets;
            const activeSet = weaponContainer ? weaponContainer.getActiveSet() : 0;
            if (!ContainerTypeDetector.isActiveWeaponSet(cell, activeSet)) {
                return;
            }
        }
        
        // If no data in cell, do nothing
        if (!cell.data) return;

        // Call adapter's click handler if available
        if (this.adapter && typeof this.adapter.onCellClick === 'function') {
            this.adapter.onCellClick(cell, event);
        }
    }

    /**
     * Handle cell right-click
     * Delegates to SlotContextMenu for menu building
     * @param {GridCell} cell
     * @param {MouseEvent} event
     * @param {GridContainer} container - The container owning the cell
     */
    async handleRightClick(cell, event, container) {
        await this.contextMenu.show(cell, event, container);
    }


    /**
     * Sort a container using adapter's sort implementation
     * @param {GridContainer} container
     */
    async sortContainer(container) {
        if (!this.adapter || !this.adapter.autoSort) {
            ui.notifications.warn('AutoSort not available');
            return;
        }

        try {
            await this.adapter.autoSort.sortContainer(container);
            
            // Persist the changes
            const containerInfo = ContainerTypeDetector.detectContainer(container.cells[0]);
            if (containerInfo && this.persistenceManager) {
                await this.persistenceManager.updateContainer(
                    containerInfo.type,
                    containerInfo.index,
                    container.items
                );
            }
        } catch (error) {
            console.error('BG3 HUD Core | Error sorting container:', error);
            ui.notifications.error('Failed to sort container');
        }
    }

    /**
     * Auto-populate a container (delegates to adapter)
     * @param {GridContainer} container
     */
    async autoPopulateContainer(container) {
        if (!this.adapter || !this.adapter.autoPopulate) {
            console.warn('BG3 HUD Core | No adapter or autoPopulate capability');
            return;
        }

        // Get actor from hotbar app
        const actor = this.hotbarApp?.currentActor;
        if (!actor) {
            return;
        }

        try {
            // Pass persistence manager for global UUID duplicate checking
            await this.adapter.autoPopulate.populateContainer(container, actor, this.persistenceManager);
            
            // Persist the changes
            const containerInfo = ContainerTypeDetector.detectContainer(container.cells[0]);
            if (containerInfo && this.persistenceManager) {
                await this.persistenceManager.updateContainer(
                    containerInfo.type,
                    containerInfo.index,
                    container.items
                );
            }
        } catch (error) {
            console.error('BG3 HUD Core | Error auto-populating container:', error);
            ui.notifications.error('Failed to auto-populate container');
        }
    }

    /**
     * Clear all items from a container
     * @param {GridContainer} container
     */
    async clearContainer(container) {
        try {
            // Clear the container visually
            await container.clear();
            
            // Persist the changes using container's own metadata
            if (this.persistenceManager) {
                await this.persistenceManager.updateContainer(
                    container.containerType,
                    container.containerIndex ?? 0,
                    {}
                );
            }

        } catch (error) {
            console.error('BG3 HUD Core | Error clearing container:', error);
            ui.notifications.error('Failed to clear container');
        }
    }

    /**
     * Remove item from a cell
     * Single orchestration point for cell removal
     * Follows clean pattern: extract data → update UI → persist state
     * @param {GridCell} cell
     */
    async removeCell(cell) {
        // STEP 1: Update visual state
        await cell.setData(null, { skipSave: true });

        // STEP 2: Persist the removal
        if (this.persistenceManager) {
            await this.persistenceManager.updateCell({
                container: cell.containerType,
                containerIndex: cell.containerIndex,
                slotKey: cell.getSlotKey(),
                data: null
            });
        }
        
        // STEP 3: Notify weapon set container if this was a weapon set update
        if (ContainerTypeDetector.isWeaponSet(cell)) {
            const weaponContainer = this.hotbarApp.components.weaponSets;
            if (weaponContainer?.onCellUpdated) {
                await weaponContainer.onCellUpdated(cell.containerIndex, cell.getSlotKey());
            }
        }
    }

    /**
     * Handle cell drag start - track source cell
     * @param {GridCell} cell
     * @param {DragEvent} event
     */
    handleDragStart(cell, event) {
        // Block drags from inactive weapon sets
        if (ContainerTypeDetector.isWeaponSet(cell)) {
            const weaponContainer = this.hotbarApp.components.weaponSets;
            const activeSet = weaponContainer ? weaponContainer.getActiveSet() : 0;
            if (!ContainerTypeDetector.isActiveWeaponSet(cell, activeSet)) {
                event.preventDefault();
                return;
            }
        }
        
        this.dragSourceCell = cell;
    }

    /**
     * Handle cell drag end - clear source cell
     * @param {GridCell} cell
     * @param {DragEvent} event
     */
    handleDragEnd(cell, event) {
        this.dragSourceCell = null;
    }

    /**
     * Handle cell drop
     * Main drop handler that routes to appropriate strategy
     * @param {GridCell} targetCell
     * @param {DragEvent} event
     * @param {Object} dragData
     */
    async handleDrop(targetCell, event, dragData) {
        // Block drops on inactive weapon sets
        if (ContainerTypeDetector.isWeaponSet(targetCell)) {
            const weaponContainer = this.hotbarApp.components.weaponSets;
            const activeSet = weaponContainer ? weaponContainer.getActiveSet() : 0;
            if (!ContainerTypeDetector.isActiveWeaponSet(targetCell, activeSet)) {
                ui.notifications.warn('Switch to this weapon set first to modify it');
                return;
            }
            
            // Check if weapon set container wants to prevent this drop (e.g., locked slots)
            if (weaponContainer?.shouldPreventDrop && weaponContainer.shouldPreventDrop(targetCell)) {
                return; // Drop prevented
            }
        }
        
        // Internal drop (from another cell)
        if (dragData?.sourceSlot && this.dragSourceCell) {
            await this._handleInternalDrop(targetCell, dragData);
        } else {
            // External drop (from character sheet, compendium, etc.)
            await this._handleExternalDrop(targetCell, event);
        }
    }

    /**
     * Handle internal drop (cell to cell)
     * Single orchestration point for all cell-to-cell moves
     * Follows clean pattern: extract data → validate → update UI → persist state
     * @param {GridCell} targetCell
     * @param {Object} dragData
     * @private
     */
    async _handleInternalDrop(targetCell, dragData) {
        const sourceCell = this.dragSourceCell;
        if (!sourceCell) {
            console.warn('BG3 HUD Core | No source cell for internal drop');
            return;
        }

        // Same cell - do nothing
        if (sourceCell === targetCell) {
            return;
        }

        // STEP 1: Extract data (capture current state before any changes)
        const sourceData = sourceCell.data;
        const targetData = targetCell.data;
        const sourceSlotKey = sourceCell.getSlotKey();
        const targetSlotKey = targetCell.getSlotKey();

        // STEP 2: Validate UUID uniqueness for swaps
        // When swapping, check if the target item's UUID would conflict at source location
        if (targetData?.uuid) {
            const existingLocation = this.persistenceManager.findUuidInHud(targetData.uuid, {
                excludeContainer: targetCell.containerType,
                excludeContainerIndex: targetCell.containerIndex,
                excludeSlotKey: targetSlotKey
            });
            
            if (existingLocation) {
                ui.notifications.warn('This item already exists elsewhere in the HUD');
                return;
            }
        }

        // Check if same container or cross-container
        const sameContainer = ContainerTypeDetector.areSameContainer(sourceCell, targetCell);

        // STEP 3: Check for UUID conflicts in moves (not swaps)
        if (!sameContainer && sourceData?.uuid && !targetData) {
            // Moving item to empty slot in different container - check for duplicates
            const existingLocation = this.persistenceManager.findUuidInHud(sourceData.uuid, {
                excludeContainer: sourceCell.containerType,
                excludeContainerIndex: sourceCell.containerIndex,
                excludeSlotKey: sourceSlotKey
            });
            
            if (existingLocation) {
                ui.notifications.warn('This item already exists elsewhere in the HUD');
                return;
            }
        }

        if (sameContainer) {
            // SAME CONTAINER: Swap items
            
            // STEP 2: Update visual state (both cells in parallel)
            await Promise.all([
                sourceCell.setData(targetData, { skipSave: true }),
                targetCell.setData(sourceData, { skipSave: true })
            ]);

            // STEP 3: Persist both changes (single source of truth)
            if (this.persistenceManager) {
                await this.persistenceManager.updateCell({
                    container: sourceCell.containerType,
                    containerIndex: sourceCell.containerIndex,
                    slotKey: sourceSlotKey,
                    data: targetData
                });
                
                await this.persistenceManager.updateCell({
                    container: targetCell.containerType,
                    containerIndex: targetCell.containerIndex,
                    slotKey: targetSlotKey,
                    data: sourceData
                });
            }
            
            // STEP 4: Notify weapon set container if this was a weapon set update
            if (ContainerTypeDetector.isWeaponSet(sourceCell)) {
                const weaponContainer = this.hotbarApp.components.weaponSets;
                if (weaponContainer?.onCellUpdated) {
                    await weaponContainer.onCellUpdated(sourceCell.containerIndex, sourceSlotKey);
                    await weaponContainer.onCellUpdated(targetCell.containerIndex, targetSlotKey);
                }
            }
        } else {
            // CROSS-CONTAINER: Move item (clear source)
            
            // STEP 2: Update visual state (both cells in parallel)
            await Promise.all([
                sourceCell.setData(null, { skipSave: true }),
                targetCell.setData(sourceData, { skipSave: true })
            ]);

            // STEP 3: Persist both changes (clear source, set target)
            if (this.persistenceManager) {
                await this.persistenceManager.updateCell({
                    container: sourceCell.containerType,
                    containerIndex: sourceCell.containerIndex,
                    slotKey: sourceSlotKey,
                    data: null
                });
                
                await this.persistenceManager.updateCell({
                    container: targetCell.containerType,
                    containerIndex: targetCell.containerIndex,
                    slotKey: targetSlotKey,
                    data: sourceData
                });
            }
            
            // STEP 4: Notify weapon set containers if either was a weapon set update
            const weaponContainer = this.hotbarApp.components.weaponSets;
            if (weaponContainer?.onCellUpdated) {
                if (ContainerTypeDetector.isWeaponSet(sourceCell)) {
                    await weaponContainer.onCellUpdated(sourceCell.containerIndex, sourceSlotKey);
                }
                if (ContainerTypeDetector.isWeaponSet(targetCell)) {
                    await weaponContainer.onCellUpdated(targetCell.containerIndex, targetSlotKey);
                }
            }
        }
    }


    /**
     * Handle external drop (from character sheet, compendium, etc.)
     * Single orchestration point for external item drops
     * Follows clean pattern: extract data → validate → update UI → persist state
     * @param {GridCell} targetCell
     * @param {DragEvent} event
     * @private
     */
    async _handleExternalDrop(targetCell, event) {
        // STEP 1: Get and transform item data
        const item = await this._getItemFromDragData(event);
        if (!item) {
            console.warn('BG3 HUD Core | Could not get item from drag data');
            return;
        }

        // STEP 2: Validate item ownership (must belong to current actor)
        const currentActor = this.hotbarApp?.currentActor;
        if (!currentActor) {
            ui.notifications.warn('No actor selected');
            return;
        }

        if (item.actor && item.actor.id !== currentActor.id) {
            ui.notifications.warn(`This item belongs to ${item.actor.name}, not ${currentActor.name}`);
            return;
        }

        // STEP 3: Transform item to cell data
        const cellData = await this._transformItemToCellData(item);
        if (!cellData) {
            console.warn('BG3 HUD Core | Could not transform item to cell data');
            return;
        }

        // STEP 4: Check for UUID duplicates (only if UUID exists)
        if (cellData.uuid) {
            const existingLocation = this.persistenceManager.findUuidInHud(cellData.uuid);
            if (existingLocation) {
                ui.notifications.warn('This item is already in the HUD');
                return;
            }
        }

        // STEP 2: Update visual state
        await targetCell.setData(cellData, { skipSave: true });

        // STEP 3: Persist the change
        if (this.persistenceManager) {
            await this.persistenceManager.updateCell({
                container: targetCell.containerType,
                containerIndex: targetCell.containerIndex,
                slotKey: targetCell.getSlotKey(),
                data: cellData
            });
        }
        
        // STEP 4: Notify weapon set container if this was a weapon set update
        if (ContainerTypeDetector.isWeaponSet(targetCell)) {
            const weaponContainer = this.hotbarApp.components.weaponSets;
            if (weaponContainer?.onCellUpdated) {
                await weaponContainer.onCellUpdated(targetCell.containerIndex, targetCell.getSlotKey());
            }
        }
    }

    /**
     * Get item from drag data
     * @param {DragEvent} event
     * @returns {Promise<Item|null>}
     * @private
     */
    async _getItemFromDragData(event) {
        try {
            const dragData = JSON.parse(event.dataTransfer.getData('text/plain'));
            if (dragData.type === 'Item') {
                return await fromUuid(dragData.uuid);
            }
        } catch (e) {
            console.warn('BG3 HUD Core | Failed to parse drag data:', e);
        }
        return null;
    }

    /**
     * Transform item to cell data
     * @param {Item} item
     * @returns {Promise<Object>}
     * @private
     */
    async _transformItemToCellData(item) {
        // Use adapter if available
        if (this.adapter && typeof this.adapter.transformItemToCellData === 'function') {
            return await this.adapter.transformItemToCellData(item);
        }
        
        // Default transformation
        return {
            uuid: item.uuid,
            name: item.name,
            img: item.img
        };
    }
}


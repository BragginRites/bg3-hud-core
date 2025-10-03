import { ContainerTypeDetector } from './ContainerTypeDetector.js';
import { DropStrategyFactory } from './DropStrategy.js';

/**
 * Interaction Coordinator
 * Routes all cell interactions to appropriate handlers
 * Eliminates 347+ lines of duplicate logic from BG3Hotbar
 */
export class InteractionCoordinator {
    constructor(options = {}) {
        this.hotbarApp = options.hotbarApp;
        this.persistenceManager = options.persistenceManager;
        this.dragDropManager = options.dragDropManager;
        this.adapter = options.adapter;
        
        // Create drop strategy factory
        this.dropStrategyFactory = new DropStrategyFactory(this.persistenceManager);
    }

    /**
     * Update adapter reference (for late binding)
     * @param {Object} adapter
     */
    setAdapter(adapter) {
        this.adapter = adapter;
    }

    /**
     * Handle cell click
     * @param {GridCell} cell
     * @param {MouseEvent} event
     */
    handleClick(cell, event) {
        console.log('BG3 HUD Core | Cell clicked:', cell.index, cell.data);
        
        // Block clicks on inactive weapon set cells
        if (ContainerTypeDetector.isWeaponSet(cell)) {
            const weaponContainer = this.hotbarApp.components.weaponSets;
            const activeSet = weaponContainer ? weaponContainer.getActiveSet() : 0;
            if (!ContainerTypeDetector.isActiveWeaponSet(cell, activeSet)) {
                console.log('BG3 HUD Core | Click blocked on inactive weapon set');
                return;
            }
        }
        
        // If no data in cell, do nothing
        if (!cell.data) return;

        // Call adapter's click handler if available
        if (this.adapter && typeof this.adapter.onCellClick === 'function') {
            this.adapter.onCellClick(cell, event);
        } else {
            console.log('BG3 HUD Core | No adapter click handler - cell has data:', cell.data);
        }
    }

    /**
     * Handle cell right-click
     * @param {GridCell} cell
     * @param {MouseEvent} event
     */
    async handleRightClick(cell, event) {
        console.log('BG3 HUD Core | Cell right-clicked:', cell.index, cell.data);

        // Build context menu items
        const menuItems = [];

        // SECTION 1: Cell-level actions (if cell has data)
        if (cell.data) {
            menuItems.push({
                label: 'Remove Item',
                icon: 'fas fa-trash',
                onClick: async () => {
                    await this.removeCell(cell);
                }
            });

            // Let adapter add custom cell menu items
            if (this.adapter && typeof this.adapter.getCellMenuItems === 'function') {
                const adapterItems = await this.adapter.getCellMenuItems(cell);
                if (adapterItems && adapterItems.length > 0) {
                    menuItems.push(...adapterItems);
                }
            }
        }

        // SECTION 2: Container-level actions (always shown)
        const container = this._getContainerFromCell(cell);
        if (container) {
            // Add separator if we already have cell-level items
            if (menuItems.length > 0) {
                menuItems.push({ separator: true });
            }

            const hasItems = container.items && Object.keys(container.items).length > 0;

            // Sort container (only enabled if container has items)
            if (this.adapter && this.adapter.autoSort) {
                menuItems.push({
                    label: 'Sort Container',
                    icon: 'fas fa-sort',
                    onClick: async () => {
                        if (!hasItems) {
                            ui.notifications.warn('Container is empty - nothing to sort');
                            return;
                        }
                        await this.sortContainer(container);
                    }
                });
            }

            // Clear container (only enabled if container has items)
            menuItems.push({
                label: 'Clear Container',
                icon: 'fas fa-times-circle',
                onClick: async () => {
                    if (!hasItems) {
                        ui.notifications.warn('Container is already empty');
                        return;
                    }
                    await this.clearContainer(container);
                }
            });

            // Auto-populate (placeholder for future implementation)
            // This will be enabled by the adapter when auto-populate is implemented
            if (this.adapter && this.adapter.autoPopulate) {
                menuItems.push({
                    label: 'Auto-Populate Container',
                    icon: 'fas fa-magic',
                    onClick: async () => {
                        await this.autoPopulateContainer(container);
                    }
                });
            }

            // Let adapter add custom container menu items
            if (this.adapter && typeof this.adapter.getContainerMenuItems === 'function') {
                const adapterItems = await this.adapter.getContainerMenuItems(container);
                if (adapterItems && adapterItems.length > 0) {
                    menuItems.push(...adapterItems);
                }
            }
        }

        // Show context menu if we have items
        if (menuItems.length > 0) {
            const { ContextMenu } = await import('../components/ui/ContextMenu.js');
            const menu = new ContextMenu({
                items: menuItems,
                event: event,
                parent: document.body
            });
            await menu.render();
        }
    }

    /**
     * Get the container that owns a cell
     * @param {GridCell} cell
     * @returns {GridContainer|null}
     * @private
     */
    _getContainerFromCell(cell) {
        // Get container from cell's parent element
        const containerElement = cell.element?.closest('.bg3-grid-container');
        if (!containerElement) return null;

        // Find the container component instance
        const containerId = containerElement.dataset.id;
        const containerIndex = parseInt(containerElement.dataset.index);

        // Search in hotbar components
        if (this.hotbarApp.components.hotbar) {
            const grid = this.hotbarApp.components.hotbar.getGrid(containerIndex);
            if (grid && grid.id === containerId) return grid;
        }

        // Search in weapon sets
        if (this.hotbarApp.components.weaponSets) {
            const grid = this.hotbarApp.components.weaponSets.getGrid(containerIndex);
            if (grid && grid.id === containerId) return grid;
        }

        // Search in quick access
        if (this.hotbarApp.components.quickAccess && containerId === 'quick-access') {
            return this.hotbarApp.components.quickAccess.gridContainer;
        }

        return null;
    }


    /**
     * Sort a container using adapter's sort implementation
     * @param {GridContainer} container
     */
    async sortContainer(container) {
        if (!this.adapter || !this.adapter.autoSort) {
            console.warn('BG3 HUD Core | No adapter or autoSort capability');
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

        try {
            await this.adapter.autoPopulate.populateContainer(container);
            
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
            // Clear the container
            await container.clear();
            
            // Persist the changes
            const containerInfo = ContainerTypeDetector.detectContainer(container.cells[0]);
            if (containerInfo && this.persistenceManager) {
                await this.persistenceManager.updateContainer(
                    containerInfo.type,
                    containerInfo.index,
                    {}
                );
            }

            ui.notifications.info('Container cleared');
        } catch (error) {
            console.error('BG3 HUD Core | Error clearing container:', error);
            ui.notifications.error('Failed to clear container');
        }
    }

    /**
     * Remove item from a cell
     * @param {GridCell} cell
     */
    async removeCell(cell) {
        const container = ContainerTypeDetector.detectContainer(cell);
        console.log('BG3 HUD Core | Removing item from cell:', cell.index, 'Container:', container);
        
        // Clear the cell visually
        await cell.setData(null);

        // Use strategy to persist based on container type
        const strategy = this.dropStrategyFactory.getStrategy(cell);
        if (strategy) {
            console.log('BG3 HUD Core | Persisting removal via strategy:', container.type);
            await strategy.persistCell(cell);
            console.log('BG3 HUD Core | Removal persisted');
        } else {
            console.warn('BG3 HUD Core | No strategy found for cell container type');
        }

        ui.notifications.info('Item removed from hotbar');
    }

    /**
     * Handle cell drag start
     * @param {GridCell} cell
     * @param {DragEvent} event
     */
    handleDragStart(cell, event) {
        this.dragDropManager.onDragStart(cell, event);
    }

    /**
     * Handle cell drag end
     * @param {GridCell} cell
     * @param {DragEvent} event
     */
    handleDragEnd(cell, event) {
        this.dragDropManager.onDragEnd(cell, event);
    }

    /**
     * Handle cell drop
     * Main drop handler that routes to appropriate strategy
     * @param {GridCell} targetCell
     * @param {DragEvent} event
     * @param {Object} dragData
     */
    async handleDrop(targetCell, event, dragData) {
        console.log('BG3 HUD Core | Drop on cell:', targetCell.index, dragData);

        // Get target strategy
        const targetStrategy = this.dropStrategyFactory.getStrategy(targetCell);
        if (!targetStrategy) {
            console.warn('BG3 HUD Core | No strategy for target container');
            return;
        }

        // Internal drop (from another cell)
        if (dragData?.sourceSlot && this.dragDropManager.dragSourceCell) {
            await this._handleInternalDrop(targetCell, dragData, targetStrategy);
        } else {
            // External drop (from character sheet, compendium, etc.)
            await this._handleExternalDrop(targetCell, event, targetStrategy);
        }
    }

    /**
     * Handle internal drop (cell to cell)
     * @param {GridCell} targetCell
     * @param {Object} dragData
     * @param {DropStrategy} targetStrategy
     * @private
     */
    async _handleInternalDrop(targetCell, dragData, targetStrategy) {
        const sourceCell = this.dragDropManager.dragSourceCell;
        if (!sourceCell) {
            console.warn('BG3 HUD Core | No source cell for internal drop');
            return;
        }

        // Same cell - do nothing
        if (sourceCell === targetCell) {
            return;
        }

        console.log('BG3 HUD Core | Internal drop from', dragData.sourceSlot, 'to', ContainerTypeDetector.getSlotKey(targetCell));

        // Check if same container (for swap) or cross-container (for move)
        if (ContainerTypeDetector.areSameContainer(sourceCell, targetCell)) {
            // Same container - swap items
            await targetStrategy.handleSwap(sourceCell, targetCell);
        } else {
            // Cross-container - move item
            await this._handleCrossContainerMove(sourceCell, targetCell);
        }
    }

    /**
     * Handle cross-container move
     * Uses unified updateCell API - order doesn't matter since operations are atomic
     * @param {GridCell} sourceCell
     * @param {GridCell} targetCell
     * @private
     */
    async _handleCrossContainerMove(sourceCell, targetCell) {
        console.log('BG3 HUD Core | Cross-container move');

        const sourceContainer = ContainerTypeDetector.detectContainer(sourceCell);
        const targetContainer = ContainerTypeDetector.detectContainer(targetCell);
        
        // Get data
        const sourceData = sourceCell.data;

        // Move: set target and clear source
        await targetCell.setData(sourceData);
        await sourceCell.setData(null);

        // Use unified API - order doesn't matter now since they're atomic
        const sourceKey = ContainerTypeDetector.getSlotKey(sourceCell);
        const targetKey = ContainerTypeDetector.getSlotKey(targetCell);
        
        await this.persistenceManager.updateCell({
            container: targetContainer.type,
            containerIndex: targetContainer.index,
            slotKey: targetKey,
            data: sourceData
        });
        
        await this.persistenceManager.updateCell({
            container: sourceContainer.type,
            containerIndex: sourceContainer.index,
            slotKey: sourceKey,
            data: null
        });
    }

    /**
     * Handle external drop (from character sheet, compendium, etc.)
     * @param {GridCell} targetCell
     * @param {DragEvent} event
     * @param {DropStrategy} targetStrategy
     * @private
     */
    async _handleExternalDrop(targetCell, event, targetStrategy) {
        console.log('BG3 HUD Core | External drop');

        // Get item from drag data
        const item = await this._getItemFromDragData(event);
        if (!item) {
            console.warn('BG3 HUD Core | Could not get item from drag data');
            return;
        }

        console.log('BG3 HUD Core | Got item from drag:', item.name);

        // Transform item to cell data
        const cellData = await this._transformItemToCellData(item);
        if (!cellData) {
            console.warn('BG3 HUD Core | Could not transform item to cell data');
            return;
        }

        // Use strategy to handle drop
        await targetStrategy.handleExternalDrop(targetCell, cellData);

        ui.notifications.info(`Added ${cellData.name || 'item'} to hotbar`);
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


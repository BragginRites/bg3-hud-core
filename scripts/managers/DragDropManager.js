/**
 * Drag & Drop Manager
 * Coordinates drag and drop operations between cells
 * System-agnostic - adapters provide validation and data transformation
 */
export class DragDropManager {
    constructor() {
        this.dragSourceCell = null;
        this.adapter = null;
        this.persistenceManager = null;
    }

    /**
     * Set the system adapter for validation
     * @param {Object} adapter - System adapter instance
     */
    setAdapter(adapter) {
        this.adapter = adapter;
    }

    /**
     * Set the persistence manager for saving data
     * @param {PersistenceManager} persistenceManager - Persistence manager instance
     */
    setPersistenceManager(persistenceManager) {
        this.persistenceManager = persistenceManager;
    }

    /**
     * Handle drag start
     * @param {GridCell} sourceCell - The cell being dragged from
     * @param {DragEvent} event - The drag event
     */
    onDragStart(sourceCell, event) {
        this.dragSourceCell = sourceCell;
        console.log('BG3 HUD Core | Drag started from cell:', sourceCell.index);
    }

    /**
     * Handle drag end
     * @param {GridCell} sourceCell - The cell being dragged from
     * @param {DragEvent} event - The drag event
     */
    onDragEnd(sourceCell, event) {
        this.dragSourceCell = null;
        console.log('BG3 HUD Core | Drag ended');
    }

    /**
     * Handle drop on cell
     * @param {GridCell} targetCell - The cell being dropped on
     * @param {DragEvent} event - The drop event
     * @param {Object} dragData - Parsed drag data
     */
    async onDrop(targetCell, event, dragData) {
        console.log('BG3 HUD Core | Drop on cell:', targetCell.index, dragData);

        // Check if this is an internal drag (from another cell in the hotbar)
        if (dragData && dragData.sourceSlot && this.dragSourceCell) {
            console.log('BG3 HUD Core | Internal drag detected');
            await this._handleInternalDrop(targetCell, dragData);
            return;
        }

        // Otherwise, it's an external drop (from character sheet, compendium, etc.)
        console.log('BG3 HUD Core | External drag detected');
        await this._handleExternalDrop(targetCell, event);
    }

    /**
     * Handle drop from another cell (internal reordering/swapping)
     * @param {GridCell} targetCell - Target cell
     * @param {Object} dragData - Source cell data
     * @private
     */
    async _handleInternalDrop(targetCell, dragData) {
        if (!this.dragSourceCell) {
            console.warn('BG3 HUD Core | No drag source cell');
            return;
        }

        // Same cell - do nothing
        if (this.dragSourceCell === targetCell) {
            return;
        }

        console.log(`BG3 HUD Core | Moving item from ${dragData.sourceSlot} to ${targetCell.col}-${targetCell.row}`);

        // Swap or move items
        const sourceData = this.dragSourceCell.data;
        const targetData = targetCell.data;

        // Update cells
        await this.dragSourceCell.setData(targetData);
        await targetCell.setData(sourceData);

        // Save to persistence
        if (this.persistenceManager) {
            const sourceSlotKey = `${this.dragSourceCell.col}-${this.dragSourceCell.row}`;
            const targetSlotKey = `${targetCell.col}-${targetCell.row}`;
            
            // Update persistence data
            await this.persistenceManager.updateCell(this.dragSourceCell.gridIndex || 0, sourceSlotKey, targetData);
            await this.persistenceManager.updateCell(targetCell.gridIndex || 0, targetSlotKey, sourceData);
        }

        // Notify adapter (if available)
        if (this.adapter && typeof this.adapter.onCellDataChanged === 'function') {
            this.adapter.onCellDataChanged(this.dragSourceCell, targetCell);
        }

        // Trigger hook for other modules
        Hooks.callAll('bg3HudCellsUpdated', {
            source: this.dragSourceCell,
            target: targetCell
        });
    }

    /**
     * Handle drop from external source (character sheet, compendium, etc.)
     * @param {GridCell} targetCell - Target cell
     * @param {DragEvent} event - Drop event
     * @private
     */
    async _handleExternalDrop(targetCell, event) {
        console.log('BG3 HUD Core | External drop detected on cell:', targetCell.index);

        // Try to get drop data from event
        let dropData;
        try {
            const dataString = event.dataTransfer.getData("text/plain");
            console.log('BG3 HUD Core | Raw drop data string:', dataString);
            
            if (!dataString) {
                console.warn('BG3 HUD Core | No data in dataTransfer');
                return;
            }
            
            dropData = JSON.parse(dataString);
            console.log('BG3 HUD Core | Parsed drop data:', dropData);
        } catch (e) {
            console.error('BG3 HUD Core | Could not parse drop data:', e);
            return;
        }

        if (!dropData || !dropData.uuid) {
            console.warn('BG3 HUD Core | No UUID in drop data');
            return;
        }

        console.log('BG3 HUD Core | External drop data type:', dropData.type, 'uuid:', dropData.uuid);

        // Ask adapter to validate and transform the drop
        if (this.adapter && typeof this.adapter.validateDrop === 'function') {
            const isValid = await this.adapter.validateDrop(dropData, targetCell);
            if (!isValid) {
                ui.notifications.warn('Cannot add this item to the hotbar');
                return;
            }
        }

        let cellData = null;

        // Ask adapter to convert drop data to cell data (if available)
        if (this.adapter && typeof this.adapter.dropDataToCellData === 'function') {
            cellData = await this.adapter.dropDataToCellData(dropData);
        } else {
            // Fallback: Create basic cell data from Foundry drop data (for testing without adapter)
            console.log('BG3 HUD Core | No adapter available, using fallback drop handler');
            cellData = await this._createBasicCellData(dropData);
        }

        if (cellData) {
            await targetCell.setData(cellData);

            // Save to persistence
            if (this.persistenceManager) {
                const slotKey = `${targetCell.col}-${targetCell.row}`;
                await this.persistenceManager.updateCell(targetCell.gridIndex || 0, slotKey, cellData);
            }

            // Notify adapter (if available)
            if (this.adapter && typeof this.adapter.onCellDataChanged === 'function') {
                this.adapter.onCellDataChanged(null, targetCell);
            }

            // Trigger hook for other modules
            Hooks.callAll('bg3HudCellsUpdated', {
                target: targetCell,
                dropData: dropData
            });

            ui.notifications.info(`Added ${cellData.name || 'item'} to hotbar`);
        } else {
            console.warn('BG3 HUD Core | Could not create cell data from drop');
        }
    }

    /**
     * Create basic cell data from Foundry drop data (fallback when no adapter)
     * @param {Object} dropData - Foundry drop data
     * @returns {Promise<Object|null>} Basic cell data
     * @private
     */
    async _createBasicCellData(dropData) {
        if (dropData.type !== 'Item') {
            console.warn('BG3 HUD Core | Only Item drops are supported without an adapter');
            return null;
        }

        try {
            // Get the item document
            const item = await fromUuid(dropData.uuid);
            if (!item) {
                console.warn('BG3 HUD Core | Could not find item:', dropData.uuid);
                return null;
            }

            // Create basic cell data structure
            const cellData = {
                uuid: dropData.uuid,
                name: item.name,
                img: item.img,
                type: item.type
            };

            // Add uses if available
            if (item.system?.uses?.max > 0) {
                cellData.uses = {
                    value: item.system.uses.value ?? 0,
                    max: item.system.uses.max
                };
            }

            // Add quantity if available
            if (item.system?.quantity > 1) {
                cellData.quantity = item.system.quantity;
            }

            console.log('BG3 HUD Core | Created basic cell data:', cellData);
            return cellData;
        } catch (error) {
            console.error('BG3 HUD Core | Error creating cell data:', error);
            return null;
        }
    }

    /**
     * Clear drag state
     */
    clear() {
        this.dragSourceCell = null;
    }
}

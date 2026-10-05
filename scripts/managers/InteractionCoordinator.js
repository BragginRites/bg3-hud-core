import { ContainerTypeDetector } from './ContainerTypeDetector.js';
import { SlotContextMenu } from '../components/ui/SlotContextMenu.js';
import { ContainerPopover } from '../components/ui/ContainerPopover.js';
import { Logger } from '../utils/logger.js';
import {
    occupy,
    move,
    clear as clearPark,
    parkMapFromState,
    slotOf,
    cellAt,
    OCCUPANCY_REFUSE
} from '../occupancy/occupancy.js';

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

        // Container popover tracking
        this.activePopover = null;
    }

    /**
     * Update adapter reference (for late binding)
     * @param {Object} adapter
     */
    setAdapter(adapter) {
        this.adapter = adapter;
        this.contextMenu.adapter = adapter;
    }

    _occupancyOpts() {
        const adapter = this.adapter;
        return {
            isHeldItem: (cell) => adapter?.isHeldItem?.(cell) === true,
            isTwoHanded: (cell) => adapter?.isTwoHanded?.(cell) === true
        };
    }

    _notifyOccupancyRefuse(reason) {
        const keys = {
            [OCCUPANCY_REFUSE.WRONG_KIND]: 'bg3-hud-core.Notifications.OccupancyWrongKind',
            [OCCUPANCY_REFUSE.SAME_SET]: 'bg3-hud-core.Notifications.OccupancySameSet',
            [OCCUPANCY_REFUSE.RESERVED]: 'bg3-hud-core.Notifications.OccupancyReserved',
            [OCCUPANCY_REFUSE.OCCUPIED]: 'bg3-hud-core.Notifications.OccupancyOccupied'
        };
        const key = keys[reason];
        if (key) ui.notifications.warn(game.i18n.localize(key));
    }

    async _commitParkedSlots(map, gridCells) {
        const patches = [];
        for (const cell of gridCells) {
            const slot = slotOf(cell);
            const data = cellAt(map, slot);
            await cell.setData(data, { skipSave: true });
            this._updateRuntimeGridItem(cell, data);
            patches.push({
                container: slot.container,
                containerIndex: slot.containerIndex,
                slotKey: slot.slotKey,
                data,
                parentCell: cell.parentCell
            });
        }

        const weaponContainer = this.hotbarApp.components?.weaponSets;
        if (weaponContainer?.onCellUpdated) {
            const updates = [];
            for (const cell of gridCells) {
                if (ContainerTypeDetector.isWeaponSet(cell)) {
                    updates.push(weaponContainer.onCellUpdated(cell.containerIndex, cell.getSlotKey()));
                }
            }
            if (updates.length) await Promise.all(updates);
        }

        if (this.persistenceManager && patches.length) {
            await this.persistenceManager.updateCells(patches);
        }
    }

    /**
     * Handle cell click
     * @param {GridCell} cell
     * @param {MouseEvent} event
     */
    async handleClick(cell, event) {
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

        // Handle macros directly in core (system-agnostic)
        if (cell.data.type === 'Macro') {
            await this._executeMacro(cell.data.uuid);
            return;
        }

        // Check if this is a container item (ask adapter)
        const isContainer = this.adapter && typeof this.adapter.isContainer === 'function'
            ? await this.adapter.isContainer(cell.data)
            : false;

        if (isContainer) {
            // Open container popover
            await this.openContainerPopover(cell, event);
        } else {
            // Call adapter's click handler if available (use item normally)
            if (this.adapter && typeof this.adapter.onCellClick === 'function') {
                this.adapter.onCellClick(cell, event);
            }
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
     * Open a container popover for a container item
     * @param {GridCell} cell - The cell containing the container
     * @param {MouseEvent} event - The click event
     */
    async openContainerPopover(cell, event) {
        // Toggle: if clicking the same cell that opened the current popover, close it
        if (this.activePopover && this.activePopover.triggerCell === cell) {
            this.activePopover.close();
            this.activePopover = null;
            return;
        }

        // Close any existing popover (different cell)
        if (this.activePopover) {
            this.activePopover.close();
            this.activePopover = null;
        }

        // Get the container item
        const containerItem = cell.data?.uuid ? await fromUuid(cell.data.uuid) : null;
        if (!containerItem) {
            Logger.warn('InteractionCoordinator | Could not resolve container item');
            return;
        }

        // Create shared interaction handlers for popover cells
        const handlers = {
            onCellClick: this.handleClick.bind(this),
            onCellRightClick: this.handleRightClick.bind(this),
            onCellDragStart: this.handleDragStart.bind(this),
            onCellDragEnd: this.handleDragEnd.bind(this),
            onCellDrop: this.handleDrop.bind(this),
            triggerCell: cell // Pass the parent cell for nested persistence
        };

        // Create and render popover
        this.activePopover = new ContainerPopover({
            containerItem: containerItem,
            triggerElement: cell.element,
            triggerCell: cell, // Store reference to trigger cell for toggle logic
            actor: this.hotbarApp?.currentActor,
            token: this.hotbarApp?.currentToken,
            adapter: this.adapter,
            persistenceManager: this.persistenceManager,
            ...handlers,
            onClose: () => {
                this.activePopover = null;
            }
        });

        await this.activePopover.render();
    }

    /**
     * Close any active container popover
     */
    closeContainerPopover() {
        if (this.activePopover) {
            this.activePopover.close();
            this.activePopover = null;
        }
    }


    /**
     * Sort a container using adapter's sort implementation
     * @param {GridContainer} container
     */
    async sortContainer(container) {
        if (!this.adapter || !this.adapter.autoSort) {
            ui.notifications.warn(game.i18n.localize('bg3-hud-core.Notifications.AutoSortNotAvailable'));
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
            Logger.error('Error sorting container:', error);
            ui.notifications.error(game.i18n.localize('bg3-hud-core.Notifications.SortFailed'));
        }
    }

    /**
     * Auto-populate a container (delegates to adapter)
     * @param {GridContainer} container
     */
    async autoPopulateContainer(container) {
        if (!this.adapter || !this.adapter.autoPopulate) {
            Logger.warn('No adapter or autoPopulate capability');
            return;
        }

        if (this.persistenceManager?.isGMHotbarMode?.()) {
            return;
        }

        if (container?.containerType === 'weaponSet') {
            return;
        }

        // Get actor from hotbar app
        const actor = this.hotbarApp?.currentActor;
        if (!actor) {
            return;
        }

        try {
            // Pass persistence so auto-fill can consult the park map before occupy
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
            Logger.error('Error auto-populating container:', error);
            ui.notifications.error(game.i18n.localize('bg3-hud-core.Notifications.AutoPopulateFailed'));
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
            Logger.error('Error clearing container:', error);
            ui.notifications.error(game.i18n.localize('bg3-hud-core.Notifications.ClearContainerFailed'));
        }
    }

    /**
     * Remove item from a cell
     * Single orchestration point for cell removal
     * Follows clean pattern: extract data → update UI → persist state
     * @param {GridCell} cell
     */
    async removeCell(cell) {
        if (cell.containerType === 'containerPopover') {
            await cell.setData(null, { skipSave: true });
            this._updateRuntimeGridItem(cell, null);
            if (this.persistenceManager) {
                await this.persistenceManager.updateCell({
                    container: cell.containerType,
                    containerIndex: cell.containerIndex,
                    slotKey: cell.getSlotKey(),
                    data: null,
                    parentCell: cell.parentCell
                });
            }
            return;
        }

        const map = parkMapFromState(this.persistenceManager?.state);
        const result = clearPark(map, slotOf(cell));
        await this._commitParkedSlots(result.map, [cell]);
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
            Logger.warn('No source cell for internal drop');
            return;
        }

        // Same cell - do nothing
        if (sourceCell === targetCell) {
            return;
        }

        // Block cross-container moves involving container popovers
        const sourceIsPopover = sourceCell.containerType === 'containerPopover';
        const targetIsPopover = targetCell.containerType === 'containerPopover';

        if (sourceIsPopover !== targetIsPopover) {
            ui.notifications.warn(game.i18n.localize('bg3-hud-core.Notifications.CrossContainerMoveBlocked'));
            return;
        }

        if (sourceIsPopover && targetIsPopover) {
            const sourceData = sourceCell.data;
            const targetData = targetCell.data;
            const sourceSlotKey = sourceCell.getSlotKey();
            const targetSlotKey = targetCell.getSlotKey();
            await Promise.all([
                sourceCell.setData(targetData, { skipSave: true }),
                targetCell.setData(sourceData, { skipSave: true })
            ]);
            if (this.persistenceManager) {
                await this.persistenceManager.updateCells([
                    {
                        container: sourceCell.containerType,
                        containerIndex: sourceCell.containerIndex,
                        slotKey: sourceSlotKey,
                        data: targetData,
                        parentCell: sourceCell.parentCell
                    },
                    {
                        container: targetCell.containerType,
                        containerIndex: targetCell.containerIndex,
                        slotKey: targetSlotKey,
                        data: sourceData,
                        parentCell: targetCell.parentCell
                    }
                ]);
            }
            return;
        }

        const map = parkMapFromState(this.persistenceManager?.state);
        const result = move(map, slotOf(sourceCell), slotOf(targetCell), this._occupancyOpts());
        if (!result.ok) {
            this._notifyOccupancyRefuse(result.reason);
            return;
        }
        await this._commitParkedSlots(result.map, [sourceCell, targetCell]);
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
        // STEP 1: Get document from drag data (supports Item, Macro, and Activity)
        const result = await this._getDocumentFromDragData(event);
        if (!result) {
            Logger.warn('Could not get document from drag data');
            return;
        }

        // Fast path: adapter supplied pre-built cell data (e.g. system actions with no document UUID)
        if (result.cellData) {
            await this._handleExternalCellData(targetCell, result.cellData);
            return;
        }

        const { document, type, augment } = result;
        const isMacro = type === 'Macro';
        const isActivity = type === 'Activity';

        // STEP 2: Check if adapter wants to block this item from the hotbar (Items only)
        if (!isMacro && !isActivity && this.adapter && typeof this.adapter.shouldBlockFromHotbar === 'function') {
            const blockResult = await this.adapter.shouldBlockFromHotbar(document);
            if (blockResult?.blocked) {
                ui.notifications.warn(blockResult.reason || 'This item cannot be added to the hotbar');
                return;
            }
        }

        // STEP 3: Validate ownership (Items and Activities - Macros are world-level)
        if (!isMacro) {
            const currentActor = this.hotbarApp?.currentActor;
            if (!currentActor) {
                ui.notifications.warn(game.i18n.localize('bg3-hud-core.Notifications.NoActorSelected'));
                return;
            }

            // For activities, check the parent item's actor
            const ownerActor = isActivity ? document.actor : document.actor;
            if (ownerActor && ownerActor.id !== currentActor.id) {
                ui.notifications.warn(game.i18n.format('bg3-hud-core.Notifications.ItemOwnerMismatch', { type: isActivity ? 'activity' : 'item', owner: ownerActor.name, current: currentActor.name }));
                return;
            }
        }

        // STEP 4: Transform document to cell data
        let cellData;
        if (isMacro) {
            cellData = this._transformMacroToCellData(document);
        } else if (isActivity) {
            // Use adapter's activity transformer if available
            if (this.adapter && typeof this.adapter.transformActivityToCellData === 'function') {
                cellData = await this.adapter.transformActivityToCellData(document);
            } else {
                // Fallback transformation
                cellData = {
                    uuid: document.uuid,
                    name: document.name,
                    img: document.img || document.item?.img,
                    type: 'Activity'
                };
            }
        } else {
            cellData = await this._transformItemToCellData(document);
        }

        if (augment && typeof augment === 'object' && cellData) {
            Object.assign(cellData, augment);
        }

        if (!cellData) {
            Logger.warn('Could not transform document to cell data');
            return;
        }

        if (targetCell.containerType === 'containerPopover') {
            await targetCell.setData(cellData, { skipSave: true });
            if (this.persistenceManager) {
                await this.persistenceManager.updateCell({
                    container: targetCell.containerType,
                    containerIndex: targetCell.containerIndex,
                    slotKey: targetCell.getSlotKey(),
                    data: cellData,
                    parentCell: targetCell.parentCell
                });
            }
            return;
        }

        const map = parkMapFromState(this.persistenceManager?.state);
        const parked = occupy(map, slotOf(targetCell), cellData, this._occupancyOpts());
        if (!parked.ok) {
            this._notifyOccupancyRefuse(parked.reason);
            return;
        }
        await this._commitParkedSlots(parked.map, [targetCell]);
    }

    /**
     * Persist adapter-supplied cell data that has no backing document (e.g. system actions).
     * Mirrors the document path: validate ownership, occupy, then persist.
     * @param {GridCell} targetCell
     * @param {Object} cellData
     * @private
     */
    async _handleExternalCellData(targetCell, cellData) {
        const currentActor = this.hotbarApp?.currentActor;
        if (!currentActor) {
            ui.notifications.warn(game.i18n.localize('bg3-hud-core.Notifications.NoActorSelected'));
            return;
        }

        // Ownership check when the cell references a specific actor
        if (cellData.actorUuid && currentActor.uuid !== cellData.actorUuid) {
            ui.notifications.warn(game.i18n.format('bg3-hud-core.Notifications.ItemOwnerMismatch', { type: 'action', owner: cellData.name ?? '', current: currentActor.name }));
            return;
        }

        if (targetCell.containerType === 'containerPopover') {
            await targetCell.setData(cellData, { skipSave: true });
            if (this.persistenceManager) {
                await this.persistenceManager.updateCell({
                    container: targetCell.containerType,
                    containerIndex: targetCell.containerIndex,
                    slotKey: targetCell.getSlotKey(),
                    data: cellData,
                    parentCell: targetCell.parentCell
                });
            }
            return;
        }

        const map = parkMapFromState(this.persistenceManager?.state);
        const result = occupy(map, slotOf(targetCell), cellData, this._occupancyOpts());
        if (!result.ok) {
            this._notifyOccupancyRefuse(result.reason);
            return;
        }
        await this._commitParkedSlots(result.map, [targetCell]);
    }

    /**
     * Resolve drag-transfer JSON to a document adapters can augment (see BG3HudDragResolution).
     * @param {DragEvent} event
     * @returns {Promise<null|{ document?: Document, type?: string, augment?: Record<string, unknown>, cellData?: Object }>}
     * @private
     */
    async _getDocumentFromDragData(event) {
        try {
            const dragData = JSON.parse(event.dataTransfer.getData('text/plain'));

            if (this.adapter && typeof this.adapter.resolveExternalDragData === 'function') {
                const adapterResult = await this.adapter.resolveExternalDragData(dragData, event);
                if (adapterResult) {
                    return adapterResult;
                }
            }

            if (dragData.type === 'Item' || dragData.type === 'Macro') {
                const document = await fromUuid(dragData.uuid);
                if (document) {
                    return { document, type: dragData.type };
                }
            }

            // Activity payloads (embedded document UUID)
            if (dragData.type === 'Activity' && dragData.uuid) {
                const activity = await fromUuid(dragData.uuid);
                if (activity) {
                    return { document: activity, type: 'Activity' };
                }
            }
        } catch (e) {
            Logger.warn('Failed to parse drag data:', e);
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

        // Default transformation - canonical type (never system subtypes like 'spell')
        return {
            uuid: item.uuid,
            name: item.name,
            img: item.img,
            type: 'Item'
        };
    }

    /**
     * Transform macro to cell data
     * @param {Macro} macro
     * @returns {Object}
     * @private
     */
    _transformMacroToCellData(macro) {
        return {
            uuid: macro.uuid,
            name: macro.name,
            img: macro.img || 'icons/svg/dice-target.svg',
            type: 'Macro'
        };
    }

    /**
     * Execute a macro
     * @param {string} uuid - Macro UUID
     * @private
     */
    async _executeMacro(uuid) {
        const macro = await fromUuid(uuid);
        if (!macro) {
            ui.notifications.warn(game.i18n.localize('bg3-hud-core.Notifications.MacroNotFound'));
            return;
        }

        // Execute with current actor/token context
        const actor = this.hotbarApp?.currentActor;
        const token = this.hotbarApp?.currentToken;

        Logger.debug('Executing macro:', macro.name);
        await macro.execute({ actor, token });
    }

    /**
     * Keep runtime grid item maps in sync with direct cell mutations.
     * Prevents stale item data from reappearing on container re-renders
     * (for example while resizing with drag bars) before persistence settles.
     * @param {GridCell} cell
     * @param {Object|null} data
     * @private
     */
    _updateRuntimeGridItem(cell, data) {
        if (!cell) return;

        const containerMap = {
            hotbar: this.hotbarApp?.components?.hotbar?.gridContainers,
            weaponSet: this.hotbarApp?.components?.weaponSets?.gridContainers,
            quickAccess: this.hotbarApp?.components?.quickAccess?.gridContainers
        };

        const grid = containerMap[cell.containerType]?.[cell.containerIndex];
        if (!grid) return;

        const slotKey = cell.getSlotKey();
        if (!grid.items || typeof grid.items !== 'object') {
            grid.items = {};
        }

        if (data === null || data === undefined) {
            delete grid.items[slotKey];
        } else {
            grid.items[slotKey] = data;
        }
    }

}


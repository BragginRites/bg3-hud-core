import { ContainerTypeDetector } from './ContainerTypeDetector.js';
import { SlotContextMenu } from '../components/ui/SlotContextMenu.js';
import { ContainerPopover } from '../components/ui/ContainerPopover.js';

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
            console.warn('InteractionCoordinator | Could not resolve container item');
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

        // Update two-handed weapon display immediately (parallel with visual update)
        if (ContainerTypeDetector.isWeaponSet(cell)) {
            const weaponContainer = this.hotbarApp.components.weaponSets;
            if (weaponContainer?.onCellUpdated) {
                await weaponContainer.onCellUpdated(cell.containerIndex, cell.getSlotKey());
            }
        }

        // STEP 2: Persist the removal
        if (this.persistenceManager) {
            await this.persistenceManager.updateCell({
                container: cell.containerType,
                containerIndex: cell.containerIndex,
                slotKey: cell.getSlotKey(),
                data: null,
                parentCell: cell.parentCell // For containerPopover
            });
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

        // Block cross-container moves involving container popovers
        const sourceIsPopover = sourceCell.containerType === 'containerPopover';
        const targetIsPopover = targetCell.containerType === 'containerPopover';

        if (sourceIsPopover !== targetIsPopover) {
            ui.notifications.warn('Cannot move items between the container and the hotbar');
            return;
        }

        // STEP 1: Extract data (capture current state before any changes)
        const sourceData = sourceCell.data;
        const targetData = targetCell.data;
        const sourceSlotKey = sourceCell.getSlotKey();
        const targetSlotKey = targetCell.getSlotKey();
        const sourceIsWeaponSet = ContainerTypeDetector.isWeaponSet(sourceCell);
        const targetIsWeaponSet = ContainerTypeDetector.isWeaponSet(targetCell);

        // STEP 2: Validate UUID uniqueness for swaps
        // When swapping, check if the target item's UUID would conflict at source location
        if (targetData?.uuid && !sourceIsWeaponSet && !targetIsWeaponSet) {
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
        if (!sameContainer && sourceData?.uuid && !targetData && !sourceIsWeaponSet && !targetIsWeaponSet) {
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

            // STEP 3: Update two-handed weapon display BEFORE persisting (for immediate visual feedback)
            if (ContainerTypeDetector.isWeaponSet(sourceCell)) {
                const weaponContainer = this.hotbarApp.components.weaponSets;
                if (weaponContainer?.onCellUpdated) {
                    await Promise.all([
                        weaponContainer.onCellUpdated(sourceCell.containerIndex, sourceSlotKey),
                        weaponContainer.onCellUpdated(targetCell.containerIndex, targetSlotKey)
                    ]);
                }
            }

            // STEP 4: Persist both changes
            if (this.persistenceManager) {
                await this.persistenceManager.updateCell({
                    container: sourceCell.containerType,
                    containerIndex: sourceCell.containerIndex,
                    slotKey: sourceSlotKey,
                    data: targetData,
                    parentCell: sourceCell.parentCell // For containerPopover
                });

                await this.persistenceManager.updateCell({
                    container: targetCell.containerType,
                    containerIndex: targetCell.containerIndex,
                    slotKey: targetSlotKey,
                    data: sourceData,
                    parentCell: targetCell.parentCell // For containerPopover
                });
            }
        } else {
            // CROSS-CONTAINER: Move item (clear source)

            // STEP 2: Update visual state (both cells in parallel)
            await Promise.all([
                sourceCell.setData(null, { skipSave: true }),
                targetCell.setData(sourceData, { skipSave: true })
            ]);

            // STEP 3: Update two-handed weapon display BEFORE persisting (for immediate visual feedback)
            const weaponContainer = this.hotbarApp.components.weaponSets;
            if (weaponContainer?.onCellUpdated) {
                const updates = [];
                if (ContainerTypeDetector.isWeaponSet(sourceCell)) {
                    updates.push(weaponContainer.onCellUpdated(sourceCell.containerIndex, sourceSlotKey));
                }
                if (ContainerTypeDetector.isWeaponSet(targetCell)) {
                    updates.push(weaponContainer.onCellUpdated(targetCell.containerIndex, targetSlotKey));
                }
                if (updates.length > 0) {
                    await Promise.all(updates);
                }
            }

            // STEP 4: Persist both changes (clear source, set target)
            if (this.persistenceManager) {
                await this.persistenceManager.updateCell({
                    container: sourceCell.containerType,
                    containerIndex: sourceCell.containerIndex,
                    slotKey: sourceSlotKey,
                    data: null,
                    parentCell: sourceCell.parentCell // For containerPopover
                });

                await this.persistenceManager.updateCell({
                    container: targetCell.containerType,
                    containerIndex: targetCell.containerIndex,
                    slotKey: targetSlotKey,
                    data: sourceData,
                    parentCell: targetCell.parentCell // For containerPopover
                });
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
        // STEP 1: Get document from drag data (supports Item, Macro, and Activity)
        const result = await this._getDocumentFromDragData(event);
        if (!result) {
            console.warn('BG3 HUD Core | Could not get document from drag data');
            return;
        }

        const { document, type } = result;
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
                ui.notifications.warn('No actor selected');
                return;
            }

            // For activities, check the parent item's actor
            const ownerActor = isActivity ? document.actor : document.actor;
            if (ownerActor && ownerActor.id !== currentActor.id) {
                ui.notifications.warn(`This ${isActivity ? 'activity' : 'item'} belongs to ${ownerActor.name}, not ${currentActor.name}`);
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

        if (!cellData) {
            console.warn('BG3 HUD Core | Could not transform document to cell data');
            return;
        }

        // STEP 5: Check for UUID duplicates (only if UUID exists)
        if (cellData.uuid && !ContainerTypeDetector.isWeaponSet(targetCell)) {
            const existingLocation = this.persistenceManager.findUuidInHud(cellData.uuid);
            if (existingLocation) {
                const label = isMacro ? 'macro' : isActivity ? 'activity' : 'item';
                ui.notifications.warn(`This ${label} is already in the HUD`);
                return;
            }
        }

        // STEP 6: Update visual state and two-handed weapon display simultaneously
        await targetCell.setData(cellData, { skipSave: true });

        // Update two-handed weapon display immediately (parallel with visual update)
        if (ContainerTypeDetector.isWeaponSet(targetCell)) {
            const weaponContainer = this.hotbarApp.components.weaponSets;
            if (weaponContainer?.onCellUpdated) {
                await weaponContainer.onCellUpdated(targetCell.containerIndex, targetCell.getSlotKey());
            }
        }

        // STEP 7: Persist the change
        if (this.persistenceManager) {
            await this.persistenceManager.updateCell({
                container: targetCell.containerType,
                containerIndex: targetCell.containerIndex,
                slotKey: targetCell.getSlotKey(),
                data: cellData,
                parentCell: targetCell.parentCell // For containerPopover
            });
        }
    }

    /**
     * Get document from drag data (supports Item, Macro, Activity, and PF2e Action)
     * @param {DragEvent} event
     * @returns {Promise<{document: Document, type: string, pf2eActionIndex?: number}|null>}
     * @private
     */
    async _getDocumentFromDragData(event) {
        try {
            const dragData = JSON.parse(event.dataTransfer.getData('text/plain'));

            if (dragData.type === 'Item' || dragData.type === 'Macro') {
                const document = await fromUuid(dragData.uuid);
                if (document) {
                    return { document, type: dragData.type };
                }
            }

            // Handle Activity type (D&D 5e v5+)
            if (dragData.type === 'Activity' && dragData.uuid) {
                const activity = await fromUuid(dragData.uuid);
                if (activity) {
                    return { document: activity, type: 'Activity' };
                }
            }

            // Handle PF2e Action type (strikes from actor.system.actions)
            if (dragData.type === 'Action' && dragData.actorUUID !== undefined) {
                const actor = await fromUuid(dragData.actorUUID);
                if (actor) {
                    const actionIndex = dragData.index;
                    const strike = actor.system?.actions?.[actionIndex];
                    if (strike?.item) {
                        // Return the strike's underlying weapon/item
                        // Pass the action index for PF2e adapter to use
                        return {
                            document: strike.item,
                            type: 'Item',
                            pf2eActionIndex: actionIndex,
                            pf2eStrikeSlug: strike.slug
                        };
                    }
                }
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
            ui.notifications.warn('Macro not found');
            return;
        }

        // Execute with current actor/token context
        const actor = this.hotbarApp?.currentActor;
        const token = this.hotbarApp?.currentToken;

        console.log('BG3 HUD Core | Executing macro:', macro.name);
        await macro.execute({ actor, token });
    }

}


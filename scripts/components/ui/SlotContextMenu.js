import { ContextMenu } from './ContextMenu.js';

/**
 * Slot Context Menu Builder
 * Handles right-click context menu creation for grid cells and containers
 * Separates UI concern from InteractionCoordinator's drag/drop logic
 */
export class SlotContextMenu {
    constructor(options = {}) {
        this.interactionCoordinator = options.interactionCoordinator;
        this._adapterGetter = options.adapter;
    }

    /**
     * Get the current adapter (supports getter functions)
     * @returns {Object|null}
     */
    get adapter() {
        if (typeof this._adapterGetter === 'function') {
            return this._adapterGetter();
        }
        return this._adapterGetter;
    }

    /**
     * Set the adapter (for late binding)
     * @param {Object|Function} adapter
     */
    set adapter(value) {
        this._adapterGetter = value;
    }

    /**
     * Build and show context menu for a cell
     * @param {GridCell} cell - The cell to show menu for
     * @param {MouseEvent} event - The triggering event
     * @param {GridContainer} container - The container owning the cell
     */
    async show(cell, event, container) {
        const menuItems = await this._buildMenuItems(cell, container);

        // Show context menu if we have items
        if (menuItems.length > 0) {
            const menu = new ContextMenu({
                items: menuItems,
                event: event,
                parent: document.body
            });
            await menu.render();
        }
    }

    /**
     * Build complete menu items list
     * @param {GridCell} cell
     * @param {GridContainer} container
     * @returns {Promise<Array>} Menu items
     * @private
     */
    async _buildMenuItems(cell, container) {
        const menuItems = [];

        // SECTION 1: Cell-level actions (if cell has data)
        if (cell.data) {
            // Adapter-provided cell menu items first (so they appear at the top)
            if (this.adapter && typeof this.adapter.getCellMenuItems === 'function') {
                const adapterItems = await this.adapter.getCellMenuItems(cell, container);
                if (adapterItems && adapterItems.length > 0) {
                    menuItems.push(...adapterItems);
                    menuItems.push({ separator: true });
                }
            }

            // Open item sheet (if cell has uuid - works for any item type)
            if (cell.data.uuid) {
                menuItems.push({
                    label: 'Edit Item',
                    icon: 'fas fa-edit',
                    onClick: async () => {
                        const item = await fromUuid(cell.data.uuid);
                        if (item && item.sheet) {
                            item.sheet.render(true);
                        }
                    }
                });
            }

            menuItems.push({
                label: 'Remove Item',
                icon: 'fas fa-trash',
                onClick: async () => {
                    await this.interactionCoordinator.removeCell(cell);
                }
            });

            // Let adapter add custom cell menu items
            // (already handled above)
        }

        // SECTION 2: Container-level actions (always shown if we have a container)
        if (container) {
            // Add separator if we already have cell-level items
            if (menuItems.length > 0) {
                menuItems.push({ separator: true });
            }

            // Determine if the container has any items based on live cells first (source of truth)
            const hasItems = Array.isArray(container?.cells)
                ? container.cells.some(c => c && c.data)
                : !!(container.items && Object.keys(container.items).length > 0);

            // Sort container (only enabled if container has items and adapter supports sorting)
            if (this.adapter && this.adapter.autoSort) {
                menuItems.push({
                    label: 'Sort Container',
                    icon: 'fas fa-sort',
                    onClick: async () => {
                        if (!hasItems) {
                            return;
                        }
                        await this.interactionCoordinator.sortContainer(container);
                    }
                });
            }

            // Clear container (always allowed; no-op if already empty)
            menuItems.push({
                label: 'Clear Container',
                icon: 'fas fa-times-circle',
                onClick: async () => {
                    await this.interactionCoordinator.clearContainer(container);
                }
            });

            // Auto-populate (if adapter supports it)
            // Note: This is for player characters. NPCs auto-populate on token creation.
            if (this.adapter && this.adapter.autoPopulate) {
                menuItems.push({
                    label: 'Auto-Populate Container',
                    icon: 'fas fa-magic',
                    title: 'Manually populate this container with items from the actor. Note: NPCs auto-populate on token creation, but player characters should use this option.',
                    onClick: async () => {
                        await this.interactionCoordinator.autoPopulateContainer(container);
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

        return menuItems;
    }
}


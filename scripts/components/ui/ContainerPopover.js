import { BG3Component } from '../BG3Component.js';
import { GridContainer } from '../containers/GridContainer.js';

/**
 * Container Popover Component
 * Displays a floating grid of items from a container (bag, pouch, box, etc.)
 * Appears above the hotbar when a container item is clicked
 * System-agnostic - adapters provide container detection and item extraction
 */
export class ContainerPopover extends BG3Component {
    /**
     * Create a new container popover
     * @param {Object} options - Popover options
     * @param {Object} options.containerItem - The container item being opened
     * @param {HTMLElement} options.triggerElement - The cell element that triggered the popover
     * @param {Actor} options.actor - The actor who owns the container
     * @param {Token} options.token - The token
     * @param {Object} options.adapter - System adapter for container logic
     * @param {PersistenceManager} options.persistenceManager - Persistence manager
     * @param {Function} options.onCellClick - Cell click handler
     * @param {Function} options.onCellRightClick - Cell right-click handler
     * @param {Function} options.onCellDragStart - Cell drag start handler
     * @param {Function} options.onCellDragEnd - Cell drag end handler
     * @param {Function} options.onCellDrop - Cell drop handler
     * @param {Function} options.onClose - Callback when popover closes
     */
    constructor(options = {}) {
        super(options);
        this.containerItem = options.containerItem;
        this.triggerElement = options.triggerElement;
        this.triggerCell = options.triggerCell; // The GridCell that contains the container
        this.actor = options.actor;
        this.token = options.token;
        this.adapter = options.adapter;
        this.persistenceManager = options.persistenceManager;
        this.onCellClick = options.onCellClick;
        this.onCellRightClick = options.onCellRightClick;
        this.onCellDragStart = options.onCellDragStart;
        this.onCellDragEnd = options.onCellDragEnd;
        this.onCellDrop = options.onCellDrop;
        this.onClose = options.onClose;
        
        this.gridContainer = null;
        this.isOpen = false;
    }

    /**
     * Get container contents from saved positions or adapter
     * @returns {Promise<Object>} Grid data with items
     * @private
     */
    async _getContainerContents() {
        // Check if we have saved positions from previous sessions
        const savedGrid = this.triggerCell?.data?.containerGrid;
        
        // Get the actual container contents from the adapter
        let adapterContents = { rows: 3, cols: 5, items: {} };
        if (this.adapter && typeof this.adapter.getContainerContents === 'function') {
            adapterContents = await this.adapter.getContainerContents(this.containerItem, this.actor);
        } else {
            console.warn('ContainerPopover | Adapter does not provide getContainerContents method');
        }

        if (!savedGrid) {
            // No saved data, use adapter contents as-is (first time opening)
            return adapterContents;
        }

        // We have saved positions - use them, but sync with actual container contents
        
        // Build a map of UUIDs from adapter contents (what actually exists)
        const adapterItemsByUuid = new Map();
        for (const [slot, itemData] of Object.entries(adapterContents.items)) {
            if (itemData?.uuid) {
                adapterItemsByUuid.set(itemData.uuid, itemData);
            }
        }

        // Build result from saved positions, but only include items that still exist
        const syncedItems = {};
        for (const [slot, itemData] of Object.entries(savedGrid.items || {})) {
            if (itemData?.uuid && adapterItemsByUuid.has(itemData.uuid)) {
                // Item still exists in container, use saved position with fresh data
                syncedItems[slot] = adapterItemsByUuid.get(itemData.uuid);
                adapterItemsByUuid.delete(itemData.uuid); // Mark as placed
            }
            // If item doesn't exist in adapter anymore, it's been removed - don't include it
        }

        // Add any new items that weren't in saved positions (newly added to container)
        const cols = savedGrid.cols || adapterContents.cols || 5;
        const rows = savedGrid.rows || adapterContents.rows || 3;
        
        for (const [uuid, itemData] of adapterItemsByUuid.entries()) {
            // Find first empty slot
            let placed = false;
            for (let row = 0; row < rows && !placed; row++) {
                for (let col = 0; col < cols && !placed; col++) {
                    const slot = `${col}-${row}`;
                    if (!syncedItems[slot]) {
                        syncedItems[slot] = itemData;
                        placed = true;
                    }
                }
            }
            
            if (!placed) {
                console.warn('ContainerPopover | No empty slot found for new item:', itemData.name);
            }
        }

        return {
            rows: rows,
            cols: cols,
            items: syncedItems
        };
    }

    /**
     * Calculate popover position relative to trigger element
     * Centers horizontally above the trigger element
     * @returns {Object} Position with left and bottom CSS values
     * @private
     */
    _calculatePosition() {
        if (!this.triggerElement) {
            return { left: '50%', bottom: '150px', transform: 'translateX(-50%)' };
        }

        const triggerRect = this.triggerElement.getBoundingClientRect();
        const hudContainer = ui.BG3HUD_APP?.element?.querySelector('#bg3-hotbar-container');
        
        // Calculate popover dimensions based on grid size
        const rootStyles = getComputedStyle(document.documentElement);
        const cellSize = parseInt(rootStyles.getPropertyValue('--bg3-cell-size').trim()) || 50;
        const gridGap = parseInt(rootStyles.getPropertyValue('--bg3-grid-gap').trim()) || 2;
        
        const cols = 5;
        const rows = 3;
        const popoverWidth = (cellSize * cols) + (gridGap * (cols - 1)) + (gridGap * 2);
        
        if (hudContainer) {
            // Position relative to HUD container (absolute positioning)
            const containerRect = hudContainer.getBoundingClientRect();
            // Center horizontally over trigger
            const left = triggerRect.left - containerRect.left + (triggerRect.width / 2) - (popoverWidth / 2);
            // Position above trigger: distance from container bottom to trigger top + gap
            const bottom = containerRect.bottom - triggerRect.top + 10;
            
            return {
                left: `${left}px`,
                bottom: `${bottom}px`
            };
        } else {
            // Fallback: position relative to viewport (fixed positioning)
            const left = triggerRect.left + (triggerRect.width / 2) - (popoverWidth / 2);
            const bottom = window.innerHeight - triggerRect.top + 10;
            
            return {
                left: `${left}px`,
                bottom: `${bottom}px`
            };
        }
    }

    /**
     * Render the container popover
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        // Create popover container
        if (!this.element) {
            // Mark as BG3 HUD UI so TooltipManager picks up hover events
            this.element = this.createElement('div', ['bg3-container-popover', 'bg3-hud']);
            this.element.dataset.bg3Ui = 'true';
        }

        // Clear existing content
        this.element.innerHTML = '';

        // Get container contents
        const containerData = await this._getContainerContents();

        // Create grid container for items
        // Container popovers are fully interactive internally - items can be rearranged
        // Persistence saves nested within the parent cell's data
        this.gridContainer = new GridContainer({
            rows: containerData.rows || 3,
            cols: containerData.cols || 5,
            items: containerData.items || {},
            id: 'container-popover',
            index: 0,
            containerType: 'containerPopover',
            containerIndex: 0,
            parentCell: this.triggerCell, // Store reference to parent cell for nested persistence
            persistenceManager: this.persistenceManager,
            actor: this.actor,
            token: this.token,
            onCellClick: this.onCellClick,
            onCellRightClick: this.onCellRightClick,
            onCellDragStart: this.onCellDragStart,
            onCellDragEnd: this.onCellDragEnd,
            onCellDrop: this.onCellDrop,
            decorateCellElement: this.adapter?.decorateCellElement?.bind(this.adapter)
        });

        const gridElement = await this.gridContainer.render();
        this.element.appendChild(gridElement);

        // Position the popover
        const position = this._calculatePosition();
        this.element.style.left = position.left;
        this.element.style.bottom = position.bottom;
        if (position.transform) {
            this.element.style.transform = position.transform;
        }

        // Append to HUD container so TooltipManager recognizes it
        // Use absolute positioning relative to the container
        const hudContainer = ui.BG3HUD_APP?.element?.querySelector('#bg3-hotbar-container');
        if (hudContainer) {
            hudContainer.appendChild(this.element);
            // Change to absolute positioning when inside container
            this.element.style.position = 'absolute';
        } else {
            // Fallback to body with fixed positioning
            document.body.appendChild(this.element);
        }

        // Mark as open
        this.isOpen = true;

        // Animate in
        requestAnimationFrame(() => {
            this.element.classList.add('popover-visible');
        });

        // Close on escape key or click outside
        this._escapeHandler = (event) => {
            if (event.key === 'Escape') {
                this.close();
            }
        };
        document.addEventListener('keydown', this._escapeHandler);

        // Close when clicking outside the popover
        this._clickOutsideHandler = (event) => {
            if (!this.element.contains(event.target)) {
                this.close();
            }
        };
        // Use capture phase and delay slightly to avoid immediate close
        setTimeout(() => {
            document.addEventListener('click', this._clickOutsideHandler, true);
        }, 100);

        return this.element;
    }

    /**
     * Close the popover
     */
    close() {
        if (!this.isOpen) return;

        // Animate out
        this.element?.classList.remove('popover-visible');

        // Wait for animation, then destroy
        setTimeout(() => {
            this.destroy();
            if (this.onClose) {
                this.onClose();
            }
        }, 150);

        this.isOpen = false;
    }

    /**
     * Destroy the popover and cleanup
     */
    destroy() {
        // Remove event listeners
        if (this._escapeHandler) {
            document.removeEventListener('keydown', this._escapeHandler);
            this._escapeHandler = null;
        }
        
        if (this._clickOutsideHandler) {
            document.removeEventListener('click', this._clickOutsideHandler, true);
            this._clickOutsideHandler = null;
        }

        // Destroy grid container
        if (this.gridContainer) {
            this.gridContainer.destroy();
            this.gridContainer = null;
        }

        // Call parent destroy
        super.destroy();
    }

    /**
     * Update the popover contents
     * Useful when container contents change
     */
    async update() {
        if (!this.isOpen || !this.gridContainer) return;

        const containerData = await this._getContainerContents();
        await this.gridContainer.updateItems(containerData.items || {});
    }
}

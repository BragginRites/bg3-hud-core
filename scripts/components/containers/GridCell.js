import { BG3Component } from '../BG3Component.js';
import { ControlsManager } from '../../managers/ControlsManager.js';

/**
 * Grid Cell Component
 * Represents a single slot in a grid that can contain content
 * System adapters will populate cells with their own content
 */
export class GridCell extends BG3Component {
    /**
     * Create a new grid cell
     * @param {Object} options - Cell configuration
     * @param {number} options.index - Cell index in grid
     * @param {number} options.row - Row position
     * @param {number} options.col - Column position
     * @param {string} options.containerType - Container type ('hotbar', 'weaponSet', 'quickAccess')
     * @param {number} options.containerIndex - Container index (for hotbar grids or weapon sets)
     * @param {PersistenceManager} options.persistenceManager - Persistence manager reference
     * @param {Object} options.data - Cell data (generic structure: {uuid, name, img, uses, quantity})
     * @param {Function} options.onClick - Click handler
     * @param {Function} options.onRightClick - Right-click handler
     * @param {Function} options.onDragStart - Drag start handler
     * @param {Function} options.onDragEnd - Drag end handler
     * @param {Function} options.onDrop - Drop handler
     */
    constructor(options = {}) {
        super(options);
        this.index = options.index ?? 0;
        this.row = options.row ?? 0;
        this.col = options.col ?? 0;
        this.containerType = options.containerType || 'hotbar';
        this.containerIndex = options.containerIndex ?? 0;
        this.parentCell = options.parentCell || null; // For containerPopover cells
        this.persistenceManager = options.persistenceManager || null;
        this.data = options.data || null;
        this.isEmpty = !this.data;
        // Create a stable element once to avoid flicker on re-renders
        this.element = this.createElement('div', ['bg3-grid-cell']);
    }

    /**
     * Get the slot key for this cell
     * @returns {string} Slot key in "col-row" format
     */
    getSlotKey() {
        return `${this.col}-${this.row}`;
    }

    

    /**
     * Render the grid cell
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        // Ensure element exists only once
        if (!this.element) {
            this.element = this.createElement('div', ['bg3-grid-cell']);
        }
        this.element.dataset.index = this.index;

        // Add empty state
        if (this.isEmpty) {
            this.element.classList.add('empty');
            this._renderEmptyState();
        } else {
            this.element.classList.add('filled');
            await this._renderContent();
            
            // Allow adapter to decorate the cell element with system-specific attributes
            if (this.options?.decorateCellElement && typeof this.options.decorateCellElement === 'function') {
                try {
                    await this.options.decorateCellElement(this.element, this.data);
                } catch (e) {
                    console.warn('BG3 HUD | Cell decoration failed:', e);
                }
            }
        }

        // Add interaction handlers (only once per element)
        if (!this._handlersAdded) {
            this._addInteractionHandlers();
            this._handlersAdded = true;
        }

        return this.element;
    }

    /**
     * Render empty cell state
     * @private
     */
    _renderEmptyState() {
        const placeholder = this.createElement('div', ['bg3-cell-placeholder']);
        this.element.appendChild(placeholder);
    }

    /**
     * Render cell content
     * Generic implementation that displays: image, name, uses, quantity
     * System adapters can add more data attributes for styling
     * @private
     */
    async _renderContent() {
        if (!this.data) return;

        const slotKey = `${this.col}-${this.row}`;
        this.element.setAttribute('data-slot', slotKey);
        this.element.setAttribute('draggable', true);

        // Store UUID for later retrieval
        if (this.data.uuid) {
            this.element.dataset.uuid = this.data.uuid;
        }

        // Add item image
        if (this.data.img) {
            const img = this.createElement('img', ['hotbar-item']);
            img.src = this.data.img;
            img.alt = this.data.name || '';
            img.draggable = false;
            
            this.element.appendChild(img);
        }

        // Add item name (optional, usually hidden)
        if (this.data.name) {
            const nameDiv = this.createElement('div', ['hotbar-item-name']);
            nameDiv.textContent = this.data.name;
            this.element.appendChild(nameDiv);
        }

        // Add uses counter
        if (this.data.uses && this.data.uses.max > 0) {
            const usesDiv = this.createElement('div', ['hotbar-item-uses']);
            // Show only the current remaining value (not value/max)
            usesDiv.textContent = `${this.data.uses.value}`;
            
            // Optional: add depleted class for styling (but don't desaturate image)
            if (this.data.uses.value === 0) {
                usesDiv.classList.add('depleted');
            }
            
            this.element.appendChild(usesDiv);
        }

        // Add quantity counter
        if (this.data.quantity && this.data.quantity > 1) {
            const quantityDiv = this.createElement('div', ['hotbar-item-quantity']);
            quantityDiv.textContent = this.data.quantity;
            this.element.appendChild(quantityDiv);
        }
    }

    

    /**
     * Add interaction handlers
     * @private
     */
    _addInteractionHandlers() {
        // Click handler
        if (this.options.onClick) {
            this.addEventListener(this.element, 'click', (event) => {
                this.options.onClick(this, event);
            });
        }

        // Right-click handler
        if (this.options.onRightClick) {
            this.addEventListener(this.element, 'contextmenu', (event) => {
                event.preventDefault();
                this.options.onRightClick(this, event);
            });
        }

        // Drag handlers - always add them, but check data and lock state at drag time
        if (this.options.onDragStart) {
            this.addEventListener(this.element, 'dragstart', (event) => {
                // Check if drag & drop is locked
                if (ControlsManager.isSettingLocked('dragDrop')) {
                    event.preventDefault();
                    return;
                }
                
                // Only allow drag if cell has data (check at drag time, not handler setup time)
                if (!this.data) {
                    event.preventDefault();
                    return;
                }
                
                this.element.classList.add('dragging');
                document.body.classList.add('dragging-active');
                
                // Set drag data (system-agnostic structure) - read this.data dynamically
                const dragData = {
                    uuid: this.data.uuid,
                    type: this.data.type || 'item',
                    sourceSlot: `${this.col}-${this.row}`,
                    sourceIndex: this.index
                };
                
                event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
                event.dataTransfer.effectAllowed = 'move';
                
                if (this.options.onDragStart) {
                    this.options.onDragStart(this, event);
                }
            });
        }

        if (this.options.onDragEnd) {
            this.addEventListener(this.element, 'dragend', (event) => {
                this.element.classList.remove('dragging');
                document.body.classList.remove('dragging-active');
                this.options.onDragEnd(this, event);
            });
        }

        // Drop handler (all cells can receive drops)
        if (this.options.onDrop) {
            this.addEventListener(this.element, 'dragover', (event) => {
                // Check if drag & drop is locked
                if (ControlsManager.isSettingLocked('dragDrop')) {
                    return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                this.element.classList.add('drag-over');
            });

            this.addEventListener(this.element, 'dragenter', (event) => {
                // Check if drag & drop is locked
                if (ControlsManager.isSettingLocked('dragDrop')) {
                    return;
                }
                event.preventDefault();
                this.element.classList.add('drag-over');
            });

            this.addEventListener(this.element, 'dragleave', (event) => {
                this.element.classList.remove('drag-over');
            });

            this.addEventListener(this.element, 'drop', (event) => {
                // Check if drag & drop is locked
                if (ControlsManager.isSettingLocked('dragDrop')) {
                    return;
                }
                
                event.preventDefault();
                this.element.classList.remove('drag-over');
                document.body.classList.remove('dragging-active');
                
                // Get drag data
                const dragDataStr = event.dataTransfer.getData('text/plain');
                let dragData = null;
                
                try {
                    dragData = JSON.parse(dragDataStr);
                } catch (e) {
                    // Might be external drag (from character sheet, etc.)
                    // Let the adapter handle it
                }
                
                this.options.onDrop(this, event, dragData);
            });
        }

        // Hover states
        this.addEventListener(this.element, 'mouseenter', () => {
            this.element.classList.add('hover');
        });

        this.addEventListener(this.element, 'mouseleave', () => {
            this.element.classList.remove('hover');
        });
    }

    /**
     * Update cell data and re-render
     * @param {Object} newData - New cell data
     */
    /**
     * Update cell data and visual state
     * @param {Object|null} newData - New cell data
     * @param {Object} options - Options
     * @param {boolean} options.skipSave - If true, only update visual state (don't persist)
     */
    async setData(newData, options = {}) {
        this.data = newData;
        this.isEmpty = !newData;
        
        if (this.element) {
            // Clear current content
            this.element.innerHTML = '';
            this.element.classList.toggle('empty', this.isEmpty);
            this.element.classList.toggle('filled', !this.isEmpty);
            
            // Update draggable attribute based on whether we have data
            this.element.draggable = !this.isEmpty;

            // Re-render
            if (this.isEmpty) {
                this._renderEmptyState();
            } else {
                await this._renderContent();
                // Allow adapter to decorate the cell element with system-specific attributes
                if (this.options?.decorateCellElement && typeof this.options.decorateCellElement === 'function') {
                    try {
                        await this.options.decorateCellElement(this.element, this.data);
                    } catch (e) {
                        console.warn('BG3 HUD | Cell decoration failed:', e);
                    }
                }
            }
        }
        
        // Note: GridCell never saves directly - orchestrators like InteractionCoordinator
        // handle persistence. The skipSave flag is here for clarity and future-proofing.
    }

    /**
     * Clear cell content
     */
    clear() {
        this.setData(null);
    }
}

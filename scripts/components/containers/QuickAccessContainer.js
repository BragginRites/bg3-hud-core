import { BG3Component } from '../BG3Component.js';
import { GridContainer } from './GridContainer.js';

/**
 * Quick Access Container - System-Agnostic Base
 * Small grid for quick access to commonly used items/actions
 * Can be used for combat actions, macros, skills, or anything else
 * 
 * System adapters can customize size and contents
 */
export class QuickAccessContainer extends BG3Component {
    /**
     * Create a new quick access container
     * @param {Object} options - Container options
     * @param {Actor} options.actor - The actor
     * @param {Token} options.token - The token
     * @param {Object} options.gridData - Grid data {rows, cols, items}
     * @param {Function} options.onCellClick - Cell click handler
     * @param {Function} options.onCellRightClick - Cell right-click handler
     * @param {Function} options.onCellDragStart - Cell drag start handler
     * @param {Function} options.onCellDragEnd - Cell drag end handler
     * @param {Function} options.onCellDrop - Cell drop handler
     */
    constructor(options = {}) {
        super(options);
        this.actor = options.actor;
        this.token = options.token;
        this.gridData = options.gridData || this._getDefaultGrid();
        this.onCellClick = options.onCellClick;
        this.onCellRightClick = options.onCellRightClick;
        this.onCellDragStart = options.onCellDragStart;
        this.onCellDragEnd = options.onCellDragEnd;
        this.onCellDrop = options.onCellDrop;
        
        this.gridContainer = null;
    }

    /**
     * Get default grid if none provided
     * @returns {Object}
     * @private
     */
    _getDefaultGrid() {
        return { rows: 2, cols: 3, items: [] };
    }

    /**
     * Render the quick access container
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        // Create container element
        if (!this.element) {
            this.element = this.createElement('div', ['bg3-quick-access-container']);
        }

        // Clear existing
        this.element.innerHTML = '';

        // Create grid container
        // Convert stored array form to the GridContainer's expected map form
        const itemsMap = Array.isArray(this.gridData.items)
            ? this._arrayToItemsMap(this.gridData.items, this.gridData.cols)
            : (this.gridData.items || {});

        this.gridContainer = new GridContainer({
            rows: this.gridData.rows,
            cols: this.gridData.cols,
            items: itemsMap,
            id: 'quick-access',
            index: 0,
            actor: this.actor,
            token: this.token,
            onCellClick: this.onCellClick,
            onCellRightClick: this.onCellRightClick,
            onCellDragStart: this.onCellDragStart,
            onCellDragEnd: this.onCellDragEnd,
            onCellDrop: this.onCellDrop
        });
        
        // Render first to create the element
        await this.gridContainer.render();
        
        // Add CSS class
        this.gridContainer.element.classList.add('bg3-quick-access-grid');
        this.element.appendChild(this.gridContainer.element);

        return this.element;
    }

    /**
     * Update the grid data
     * @param {Object} newData - New grid data
     */
    async updateGrid(newData) {
        this.gridData = newData;
        if (this.gridContainer) {
            // Only update items to avoid structural rebuilds
            const itemsMap = Array.isArray(newData.items)
                ? this._arrayToItemsMap(newData.items, newData.cols)
                : (newData.items || {});
            this.gridContainer.items = itemsMap;
            await this.gridContainer.render();
        }
    }

    /**
     * Convert array of entries (row-major) to keyed map "col-row" → data
     * @param {Array} itemsArray
     * @param {number} cols
     * @returns {Object}
     * @private
     */
    _arrayToItemsMap(itemsArray, cols) {
        const map = {};
        for (let index = 0; index < itemsArray.length; index++) {
            const data = itemsArray[index];
            if (!data) continue;
            const row = Math.floor(index / cols);
            const col = index % cols;
            map[`${col}-${row}`] = data;
        }
        return map;
    }

    /**
     * Destroy the container
     */
    destroy() {
        if (this.gridContainer && typeof this.gridContainer.destroy === 'function') {
            this.gridContainer.destroy();
        }
        this.gridContainer = null;
        super.destroy();
    }
}


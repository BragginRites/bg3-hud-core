import { BG3Component } from '../BG3Component.js';
import { GridCell } from './GridCell.js';

/**
 * Grid Container Component
 * Manages a grid of cells in rows and columns
 * System-agnostic - adapters provide the cell data
 */
export class GridContainer extends BG3Component {
    /**
     * Create a new grid container
     * @param {Object} options - Grid configuration
     * @param {number} options.rows - Number of rows
     * @param {number} options.cols - Number of columns
     * @param {Object} options.items - Item data keyed by "col-row" (e.g., "0-0", "1-2")
     * @param {string} options.id - Container identifier
     * @param {number} options.index - Container index
     * @param {string[]} options.classes - Additional CSS classes
     */
    constructor(options = {}) {
        super(options);
        this.rows = options.rows || 1;
        this.cols = options.cols || 10;
        this.items = options.items || {};
        this.id = options.id || 'grid';
        this.index = options.index || 0;
        this.classes = options.classes || [];
        this.cells = [];
    }

    /**
     * Render the grid container
     * First render: create elements
     * Subsequent renders: update existing elements
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        // Create container element on first render only
        if (!this.element) {
            this.element = this.createElement('div', ['bg3-grid-container', ...this.classes]);
            this.element.dataset.id = this.id;
            this.element.dataset.index = this.index;
        }

        // Update CSS grid properties
        this.element.style.setProperty('--grid-cols', this.cols);
        this.element.style.setProperty('--grid-rows', this.rows);
        this.element.style.display = 'grid';
        this.element.style.gridTemplateColumns = `repeat(${this.cols}, var(--bg3-cell-size, 50px))`;
        this.element.style.gridTemplateRows = `repeat(${this.rows}, var(--bg3-cell-size, 50px))`;
        this.element.style.gap = '4px';

        // Check if we need to rebuild cells (grid size changed)
        const expectedCellCount = this.rows * this.cols;
        const needsRebuild = this.cells.length !== expectedCellCount;

        if (needsRebuild) {
            // Clear existing cells
            this.element.innerHTML = '';
            
            // Create new cells
            this.cells = [];
            for (let row = 0; row < this.rows; row++) {
                for (let col = 0; col < this.cols; col++) {
                    const cellKey = `${col}-${row}`;
                    const itemData = this.items[cellKey] || null;

                    const cell = new GridCell({
                        index: row * this.cols + col,
                        row: row,
                        col: col,
                        data: itemData,
                        gridIndex: this.index,
                        onClick: this.options.onCellClick,
                        onRightClick: this.options.onCellRightClick,
                        onDragStart: this.options.onCellDragStart,
                        onDragEnd: this.options.onCellDragEnd,
                        onDrop: this.options.onCellDrop
                    });

                    this.cells.push(cell);
                    await cell.render();
                    this.element.appendChild(cell.element);
                }
            }
        } else {
            // Update existing cells in place; only update changed cells, in parallel
            const updates = [];
            for (let row = 0; row < this.rows; row++) {
                for (let col = 0; col < this.cols; col++) {
                    const cellIndex = row * this.cols + col;
                    const cellKey = `${col}-${row}`;
                    const itemData = this.items[cellKey] || null;
                    const cell = this.cells[cellIndex];

                    if (!cell) continue;

                    if (!this._areCellDatasEqual(cell.data, itemData)) {
                        updates.push(cell.setData(itemData));
                    }
                }
            }
            if (updates.length) await Promise.all(updates);
        }

        return this.element;
    }

    /**
     * Shallow equality for cell data objects to avoid unnecessary re-renders
     * @param {Object|null} a
     * @param {Object|null} b
     * @returns {boolean}
     * @private
     */
    _areCellDatasEqual(a, b) {
        if (a === b) return true;
        if (!a || !b) return false;
        if (a.uuid !== b.uuid) return false;
        if (a.img !== b.img) return false;
        if (a.name !== b.name) return false;
        const aq = a.quantity || 0, bq = b.quantity || 0;
        if (aq !== bq) return false;
        const au = a.uses || {}, bu = b.uses || {};
        if ((au.value || 0) !== (bu.value || 0)) return false;
        if ((au.max || 0) !== (bu.max || 0)) return false;
        return true;
    }

    /**
     * Get cell by position
     * @param {number} col - Column index
     * @param {number} row - Row index
     * @returns {GridCell|null}
     */
    getCell(col, row) {
        const index = row * this.cols + col;
        return this.cells[index] || null;
    }

    /**
     * Get cell by index
     * @param {number} index - Cell index
     * @returns {GridCell|null}
     */
    getCellByIndex(index) {
        return this.cells[index] || null;
    }

    /**
     * Update grid data and re-render
     * @param {Object} newItems - New items data
     */
    async updateItems(newItems) {
        this.items = newItems;
        
        // Update each cell
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const cellKey = `${col}-${row}`;
                const cell = this.getCell(col, row);
                if (cell) {
                    await cell.setData(this.items[cellKey] || null);
                }
            }
        }
    }

    /**
     * Clear all items from the grid
     */
    async clear() {
        await this.updateItems({});
    }

    /**
     * Destroy the grid and all cells
     */
    destroy() {
        // Destroy all cells
        for (const cell of this.cells) {
            cell.destroy();
        }
        this.cells = [];
        
        // Destroy container
        super.destroy();
    }
}

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
     * @param {Array} options.grids - Array of grid data objects [{rows, cols, items}]
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
        // Store grid data as array for consistency with other containers
        this.grids = Array.isArray(options.grids) ? options.grids : [options.gridData || this._getDefaultGrid()];
        this.persistenceManager = options.persistenceManager;
        this.onCellClick = options.onCellClick;
        this.onCellRightClick = options.onCellRightClick;
        this.onCellDragStart = options.onCellDragStart;
        this.onCellDragEnd = options.onCellDragEnd;
        this.onCellDrop = options.onCellDrop;
        
        // Use array for consistency with HotbarContainer and WeaponSetContainer
        this.gridContainers = [];
    }

    /**
     * Get default grid if none provided
     * @returns {Object}
     * @private
     */
    _getDefaultGrid() {
        // Unified format uses object map keyed by "col-row"
        return { rows: 2, cols: 3, items: {} };
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
        this.gridContainers = [];

        // Create single grid container (QuickAccess only has one grid)
        const gridData = this.grids[0];
        const itemsMap = gridData.items || {};

        const gridContainer = new GridContainer({
            rows: gridData.rows,
            cols: gridData.cols,
            items: itemsMap,
            id: 'quick-access',
            index: 0,
            containerType: 'quickAccess',
            containerIndex: 0,
            persistenceManager: this.persistenceManager,
            actor: this.actor,
            token: this.token,
            onCellClick: this.onCellClick,
            onCellRightClick: this.onCellRightClick,
            onCellDragStart: this.onCellDragStart,
            onCellDragEnd: this.onCellDragEnd,
            onCellDrop: this.onCellDrop,
            decorateCellElement: this.options?.decorateCellElement
        });
        
        // Store in array for consistency
        this.gridContainers[0] = gridContainer;
        
        // Render first to create the element
        await gridContainer.render();
        
        // Add CSS class
        gridContainer.element.classList.add('bg3-quick-access-grid');
        this.element.appendChild(gridContainer.element);

        return this.element;
    }

    /**
     * Get the grid container (for interface consistency with HotbarContainer/WeaponSetContainer)
     * @param {number} index - Grid index
     * @returns {GridContainer|null}
     */
    getGrid(index) {
        return this.gridContainers[index] || null;
    }

    /**
     * Destroy the container
     */
    destroy() {
        // Destroy all grid containers
        for (const gridContainer of this.gridContainers) {
            if (gridContainer && typeof gridContainer.destroy === 'function') {
                gridContainer.destroy();
            }
        }
        this.gridContainers = [];
        super.destroy();
    }
}


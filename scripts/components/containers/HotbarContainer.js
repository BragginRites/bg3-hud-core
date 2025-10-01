import { BG3Component } from '../BG3Component.js';
import { GridContainer } from './GridContainer.js';
import { DragBar } from '../ui/DragBar.js';
import { ActiveEffectsContainer } from './ActiveEffectsContainer.js';
import { PassivesContainer } from './PassivesContainer.js';
import { BG3HUD_REGISTRY } from '../../utils/registry.js';

/**
 * Hotbar Container
 * Main container that holds multiple GridContainers separated by DragBars
 * System-agnostic - adapters provide what goes in the cells
 */
export class HotbarContainer extends BG3Component {
    /**
     * Create a new hotbar container
     * @param {Object} options - Container configuration
     * @param {Array} options.grids - Array of grid configurations [{rows, cols, items}, ...]
     * @param {Actor} options.actor - The actor
     * @param {Token} options.token - The token
     */
    constructor(options = {}) {
        super(options);
        
        // Use provided grids or get from persistence manager's defaults
        this.grids = options.grids || this._getDefaultGrids(options);
        this.actor = options.actor;
        this.token = options.token;
        this.gridContainers = [];
        this.dragBars = [];
        this.activeEffectsContainer = null;
        this.passivesContainer = null;
    }
    
    /**
     * Get default grids configuration
     * @param {Object} options - Constructor options
     * @returns {Array} Default grids
     * @private
     */
    _getDefaultGrids(options) {
        // If hotbarApp has a persistence manager, use its defaults
        const config = options.hotbarApp?.persistenceManager?.DEFAULT_GRID_CONFIG || {
            rows: 1,
            cols: 5,
            gridCount: 3
        };
        
        const grids = [];
        for (let i = 0; i < config.gridCount; i++) {
            grids.push({
                rows: config.rows,
                cols: config.cols,
                items: {}
            });
        }
        return grids;
    }

    /**
     * Render the hotbar container
     * First render: create elements
     * Subsequent renders: update existing elements
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        // Create container element on first render only
        if (!this.element) {
            this.element = this.createElement('div', ['bg3-hotbar-container']);
        }

        // Check if we need to rebuild structure (grid count changed)
        const needsRebuild = this.gridContainers.length !== this.grids.length;

        if (needsRebuild) {
            // Clear and rebuild
            this.element.innerHTML = '';
            this.gridContainers = [];
            this.dragBars = [];

            // Create active effects container if actor exists
            if (this.actor) {
                this.activeEffectsContainer = new ActiveEffectsContainer({
                    actor: this.actor,
                    token: this.token
                });
                const activeEffectsElement = await this.activeEffectsContainer.render();
                this.element.appendChild(activeEffectsElement);
            }

            // Create passives container if actor exists and adapter registered one
            if (this.actor) {
                const PassivesClass = BG3HUD_REGISTRY.passivesContainer || PassivesContainer;
                this.passivesContainer = new PassivesClass({
                    actor: this.actor,
                    token: this.token
                });
                const passivesElement = await this.passivesContainer.render();
                this.element.appendChild(passivesElement);
            }

            // Create new grid containers and drag bars
            for (let i = 0; i < this.grids.length; i++) {
                const gridData = this.grids[i];
                
                // Create GridContainer
                const gridContainer = new GridContainer({
                    rows: gridData.rows,
                    cols: gridData.cols,
                    items: gridData.items || {},
                    id: 'hotbar',
                    index: i,
                    onCellClick: this.options.onCellClick,
                    onCellRightClick: this.options.onCellRightClick,
                    onCellDragStart: this.options.onCellDragStart,
                    onCellDragEnd: this.options.onCellDragEnd,
                    onCellDrop: this.options.onCellDrop
                });

                this.gridContainers.push(gridContainer);
                const gridElement = await gridContainer.render();
                
                // Hide container if cols is 0
                if (gridData.cols === 0) {
                    gridElement.style.display = 'none';
                }
                
                this.element.appendChild(gridElement);

                // Add DragBar between grids (except after last grid)
                if (i < this.grids.length - 1) {
                    const dragBar = new DragBar({
                        index: i,
                        onDrag: (bar, deltaX) => this._onDragBarMove(bar, deltaX),
                        onDragEnd: (bar, deltaX) => this._onDragBarEnd(bar, deltaX)
                    });
                    this.dragBars.push(dragBar);
                    const dragBarElement = await dragBar.render();
                    this.element.appendChild(dragBarElement);
                }
            }
        } else {
            // Update active effects if exists
            if (this.activeEffectsContainer) {
                await this.activeEffectsContainer.render();
            }

            // Update passives if exists
            if (this.passivesContainer) {
                await this.passivesContainer.render();
            }

            // Update existing grid containers
            await Promise.all(this.grids.map(async (gridData, i) => {
                const gridContainer = this.gridContainers[i];
                if (!gridContainer) return;
                gridContainer.rows = gridData.rows;
                gridContainer.cols = gridData.cols;
                gridContainer.items = gridData.items || {};
                
                // Hide/show container based on column count
                if (gridData.cols === 0) {
                    gridContainer.element.style.display = 'none';
                } else {
                    gridContainer.element.style.display = '';
                }
                
                await gridContainer.render();
            }));
        }

        return this.element;
    }

    /**
     * Handle drag bar movement
     * @param {DragBar} bar - The drag bar
     * @param {number} deltaX - Pixel delta from start
     * @private
     */
    /**
     * Handle drag bar end - resize grids
     * @param {DragBar} bar - The drag bar
     * @param {number} deltaX - Final pixel delta
     * @private
     */
    async _onDragBarEnd(bar, deltaX) {
        const cellWidth = 54; // var(--bg3-cell-size) + gap
        const deltaColsRounded = Math.round(deltaX / cellWidth);

        if (Math.abs(deltaColsRounded) >= 1) {
            // Get the two grid containers and their data
            const leftGridContainer = this.gridContainers[bar.index];
            const rightGridContainer = this.gridContainers[bar.index + 1];
            const leftGrid = this.grids[bar.index];
            const rightGrid = this.grids[bar.index + 1];

            // Calculate the total columns between these two grids (conserved)
            const totalCols = leftGrid.cols + rightGrid.cols;

            // Calculate new column counts, clamped to [0, totalCols]
            let newLeftCols = leftGrid.cols + deltaColsRounded;
            let newRightCols = rightGrid.cols - deltaColsRounded;

            // Ensure we don't exceed the total or go below 0
            newLeftCols = Math.max(0, Math.min(totalCols, newLeftCols));
            newRightCols = totalCols - newLeftCols; // Ensure they always add up to totalCols

            // Update grid data
            leftGrid.cols = newLeftCols;
            rightGrid.cols = newRightCols;

            console.log(`Resized grids: ${bar.index} to ${newLeftCols} cols, ${bar.index + 1} to ${newRightCols} cols (total: ${totalCols})`);

            // Update the GridContainer instances' properties
            leftGridContainer.cols = newLeftCols;
            rightGridContainer.cols = newRightCols;

            // Hide/show containers based on column count
            if (newLeftCols === 0) {
                leftGridContainer.element.style.display = 'none';
            } else {
                leftGridContainer.element.style.display = '';
            }

            if (newRightCols === 0) {
                rightGridContainer.element.style.display = 'none';
            } else {
                rightGridContainer.element.style.display = '';
            }

            // Re-render the grids in place
            await leftGridContainer.render();
            await rightGridContainer.render();

            // Save to persistence
            if (this.options.hotbarApp?.persistenceManager) {
                await this.options.hotbarApp.persistenceManager.save(this.grids);
            }
        }
    }

    /**
     * Get a grid container by index
     * @param {number} index - Grid index
     * @returns {GridContainer|null}
     */
    getGrid(index) {
        return this.gridContainers[index] || null;
    }

    /**
     * Update grid data
     * @param {number} index - Grid index
     * @param {Object} items - New items data
     */
    async updateGrid(index, items) {
        const grid = this.getGrid(index);
        if (grid) {
            await grid.updateItems(items);
        }
    }

    /**
     * Destroy the container and all children
     */
    destroy() {
        // Destroy active effects container
        if (this.activeEffectsContainer) {
            this.activeEffectsContainer.destroy();
            this.activeEffectsContainer = null;
        }

        // Destroy passives container
        if (this.passivesContainer) {
            this.passivesContainer.destroy();
            this.passivesContainer = null;
        }

        // Destroy all grid containers
        for (const grid of this.gridContainers) {
            grid.destroy();
        }
        this.gridContainers = [];

        // Destroy all drag bars
        for (const bar of this.dragBars) {
            bar.destroy();
        }
        this.dragBars = [];

        // Destroy container
        super.destroy();
    }
}

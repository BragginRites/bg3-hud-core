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
        this._dragPreviewFrame = null;
        this._pendingDragPreview = null;
        this._dragRenderInFlight = false;
        this._dragRenderQueued = false;
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
                    containerType: 'hotbar',
                    containerIndex: i,
                    persistenceManager: this.options.hotbarApp?.persistenceManager,
                    onCellClick: this.options.onCellClick,
                    onCellRightClick: this.options.onCellRightClick,
                    onCellDragStart: this.options.onCellDragStart,
                    onCellDragEnd: this.options.onCellDragEnd,
                    onCellDrop: this.options.onCellDrop,
                    decorateCellElement: this.options.decorateCellElement
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
     * Handle drag bar move - update containers in real-time
     * @param {DragBar} bar - The drag bar
     * @param {number} deltaX - Current pixel delta
     * @private
     */
    async _onDragBarMove(bar, deltaX) {
        // Get the two grid containers
        const leftGridContainer = this.gridContainers[bar.index];
        const rightGridContainer = this.gridContainers[bar.index + 1];
        const leftGrid = this.grids[bar.index];
        const rightGrid = this.grids[bar.index + 1];

        if (!leftGridContainer || !rightGridContainer) return;

        // Store original column counts if not already stored
        if (leftGridContainer._originalCols === undefined) {
            leftGridContainer._originalCols = leftGrid.cols;
        }
        if (rightGridContainer._originalCols === undefined) {
            rightGridContainer._originalCols = rightGrid.cols;
        }

        // Calculate the total columns between these two grids (conserved)
        const totalCols = leftGridContainer._originalCols + rightGridContainer._originalCols;

        // Calculate cols-per-pixel from the actual rendered grid element.
        const cellWidth = this._getRenderedCellWidth(leftGridContainer);
        const deltaColsRounded = Math.round(deltaX / cellWidth);

        // Calculate new column counts, clamped to [0, totalCols]
        let newLeftCols = leftGridContainer._originalCols + deltaColsRounded;
        let newRightCols = rightGridContainer._originalCols - deltaColsRounded;

        // Ensure we don't exceed the total or go below 0
        newLeftCols = Math.max(0, Math.min(totalCols, newLeftCols));
        newRightCols = totalCols - newLeftCols;

        // Fast preview only during drag (do not rebuild cells on every pointer move).
        this._queueDragPreview({
            leftGridContainer,
            rightGridContainer,
            newLeftCols,
            newRightCols
        });
    }

    /**
     * Handle drag bar end - finalize resize and save
     * @param {DragBar} bar - The drag bar
     * @param {number} deltaX - Final pixel delta
     * @private
     */
    async _onDragBarEnd(bar, deltaX) {
        this._flushPendingDragPreview();

        // Get the two grid containers
        const leftGridContainer = this.gridContainers[bar.index];
        const rightGridContainer = this.gridContainers[bar.index + 1];
        const leftGrid = this.grids[bar.index];
        const rightGrid = this.grids[bar.index + 1];

        const startLeftCols = leftGridContainer?._originalCols ?? leftGridContainer?.cols ?? 0;
        const startRightCols = rightGridContainer?._originalCols ?? rightGridContainer?.cols ?? 0;

        // Derive final column values from the final drag delta to avoid relying on preview state.
        const totalCols = startLeftCols + startRightCols;
        const cellWidth = this._getRenderedCellWidth(leftGridContainer);
        const deltaColsRounded = Math.round(deltaX / cellWidth);
        const baseLeftCols = startLeftCols;
        let finalLeftCols = Math.max(0, Math.min(totalCols, baseLeftCols + deltaColsRounded));
        let finalRightCols = totalCols - finalLeftCols;

        // Apply final values and do one structural render.
        if (leftGridContainer && rightGridContainer) {
            leftGridContainer.cols = finalLeftCols;
            rightGridContainer.cols = finalRightCols;
            leftGridContainer.element.style.display = finalLeftCols === 0 ? 'none' : '';
            rightGridContainer.element.style.display = finalRightCols === 0 ? 'none' : '';
            await Promise.all([leftGridContainer.render(), rightGridContainer.render()]);
        }

        // Update grid data to match final state and save once.
        if (leftGrid && rightGrid) {
            leftGrid.cols = finalLeftCols;
            rightGrid.cols = finalRightCols;

            // Save to persistence - update each grid's config
            if (this.options.hotbarApp?.persistenceManager) {
                await this.options.hotbarApp.persistenceManager.updateGridConfig(bar.index, {
                    cols: finalLeftCols
                });
                await this.options.hotbarApp.persistenceManager.updateGridConfig(bar.index + 1, {
                    cols: finalRightCols
                });
            }
        }

        if (leftGridContainer) {
            delete leftGridContainer._previewCols;
        }
        if (rightGridContainer) {
            delete rightGridContainer._previewCols;
        }
        if (leftGridContainer) {
            delete leftGridContainer._originalCols;
        }
        if (rightGridContainer) {
            delete rightGridContainer._originalCols;
        }
    }

    _getRenderedCellWidth(gridContainer) {
        const cellElement = gridContainer?.element?.querySelector('.bg3-grid-cell');
        if (cellElement) {
            const rect = cellElement.getBoundingClientRect();
            const styles = getComputedStyle(gridContainer.element);
            const gap = parseFloat(styles.columnGap || styles.gap || '0') || 0;
            return Math.max(1, rect.width + gap);
        }

        const rootStyles = getComputedStyle(document.documentElement);
        const cellSize = parseFloat(rootStyles.getPropertyValue('--bg3-hotbar-cell-size')) || 50;
        const gridGap = parseFloat(rootStyles.getPropertyValue('--bg3-grid-gap')) || 2;
        return Math.max(1, cellSize + gridGap);
    }

    _queueDragPreview(previewState) {
        this._pendingDragPreview = previewState;
        if (this._dragPreviewFrame) return;
        this._dragPreviewFrame = requestAnimationFrame(() => {
            this._dragPreviewFrame = null;
            this._flushPendingDragPreview();
        });
    }

    _flushPendingDragPreview() {
        if (!this._pendingDragPreview) return;
        const { leftGridContainer, rightGridContainer, newLeftCols, newRightCols } = this._pendingDragPreview;
        this._pendingDragPreview = null;

        if (leftGridContainer._previewCols === newLeftCols && rightGridContainer._previewCols === newRightCols) {
            return;
        }

        leftGridContainer._previewCols = newLeftCols;
        rightGridContainer._previewCols = newRightCols;
        leftGridContainer.cols = newLeftCols;
        rightGridContainer.cols = newRightCols;
        leftGridContainer.element.style.display = newLeftCols === 0 ? 'none' : '';
        rightGridContainer.element.style.display = newRightCols === 0 ? 'none' : '';

        // Keep live slot shape accurate while dragging, but coalesce renders.
        if (this._dragRenderInFlight) {
            this._dragRenderQueued = true;
            return;
        }

        this._dragRenderInFlight = true;
        Promise.all([
            leftGridContainer.render(),
            rightGridContainer.render()
        ]).finally(() => {
            this._dragRenderInFlight = false;
            if (this._pendingDragPreview || this._dragRenderQueued) {
                this._dragRenderQueued = false;
                this._flushPendingDragPreview();
            }
        });
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
     * Update context for hotbar and all sub-containers
     * @param {Object} options - New configuration options
     */
    updateContext(options = {}) {
        super.updateContext(options);
        
        // Pass to sub-containers
        if (this.activeEffectsContainer) this.activeEffectsContainer.updateContext(options);
        if (this.passivesContainer) this.passivesContainer.updateContext(options);
        
        // Update grids
        if (options.grids) {
            this.grids = options.grids;
        }

        // Pass to grid containers
        this.gridContainers.forEach((grid, i) => {
            const gridData = this.grids[i];
            if (gridData) {
                grid.updateContext({
                    ...options,
                    rows: gridData.rows,
                    cols: gridData.cols,
                    items: gridData.items || {}
                });
            }
        });
    }

    /**
     * Destroy the container and all children
     */
    destroy() {
        if (this._dragPreviewFrame) {
            cancelAnimationFrame(this._dragPreviewFrame);
            this._dragPreviewFrame = null;
        }
        this._pendingDragPreview = null;
        this._dragRenderInFlight = false;
        this._dragRenderQueued = false;

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

import { BG3Component } from '../BG3Component.js';
import { GridContainer } from './GridContainer.js';

/**
 * Weapon Set Container - System-Agnostic Base
 * Displays multiple weapon sets that can be swapped between
 * Visual 3D carousel effect with active set in focus
 * 
 * System adapters should override:
 * - getActiveSet() - Where to store/retrieve active set index
 * - onSetSwitch() - What happens when switching sets (equipping items, etc.)
 */
export class WeaponSetContainer extends BG3Component {
    /**
     * Create a new weapon set container
     * @param {Object} options - Container options
     * @param {Actor} options.actor - The actor
     * @param {Token} options.token - The token
     * @param {Array} options.weaponSets - Array of weapon set grid data [{rows, cols, items}, ...]
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
        this.weaponSets = options.weaponSets || this._getDefaultWeaponSets();
        this.persistenceManager = options.persistenceManager;
        this.onCellClick = options.onCellClick;
        this.onCellRightClick = options.onCellRightClick;
        this.onCellDragStart = options.onCellDragStart;
        this.onCellDragEnd = options.onCellDragEnd;
        this.onCellDrop = options.onCellDrop;
        
        this.gridContainers = [];
    }

    /**
     * Get default weapon sets if none provided
     * @returns {Array}
     * @private
     */
    _getDefaultWeaponSets() {
        return [
            { rows: 1, cols: 2, items: {} },
            { rows: 1, cols: 2, items: {} },
            { rows: 1, cols: 2, items: {} }
        ];
    }

    /**
     * Get active weapon set index from unified state
     * @returns {number}
     */
    getActiveSet() {
        // Get from unified state if available
        const state = this.persistenceManager?.getState();
        return state?.weaponSets?.activeSet ?? 0;
    }

    /**
     * Set active weapon set index using unified persistence
     * @param {number} index - Set index (0, 1, 2)
     * @param {boolean} skipSave - If true, don't save to actor flags (for visual updates only)
     */
    async setActiveSet(index, skipSave = false) {
        // Update visual state immediately for smooth transition
        this.element.dataset.activeSet = index;
        
        // Update tooltips
        this._updateSetTooltips(index);
        
        // Save using unified persistence manager
        if (!skipSave && this.persistenceManager) {
            await this.persistenceManager.setActiveWeaponSet(index);
        }
    }

    /**
     * Update set tooltips based on active set
     * @param {number} activeIndex - Currently active set index
     * @private
     */
    _updateSetTooltips(activeIndex) {
        for (let i = 0; i < this.gridContainers.length; i++) {
            const container = this.gridContainers[i];
            if (i === activeIndex) {
                // Active set - no tooltip
                delete container.element.dataset.tooltip;
            } else {
                // Inactive set - show tooltip
                container.element.dataset.tooltip = `Click: Switch to weapon set ${i + 1}`;
                // Tooltip direction based on position relative to active set
                const isAbove = (i === activeIndex + 1) || (activeIndex === this.gridContainers.length - 1 && i === 0);
                container.element.dataset.tooltipDirection = isAbove ? 'UP' : 'DOWN';
            }
        }
    }

    /**
     * Handle weapon set switch
     * Override in subclass to implement equip/unequip logic
     * @param {number} setIndex - Index of set to switch to
     * @param {GridContainer} setContainer - The set container being switched to
     * @returns {Promise<void>}
     */
    async onSetSwitch(setIndex, setContainer) {
        // Base implementation: just update the active set
        // System adapters should override to handle equipping/unequipping
        console.log(`WeaponSetContainer | Switching to set ${setIndex}`);
    }

    /**
     * Render the weapon set container
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        // Create container element
        if (!this.element) {
            this.element = this.createElement('div', ['bg3-weapon-container']);
        }

        // Clear existing
        this.element.innerHTML = '';
        this.gridContainers = [];

        // Create weapon set grid containers
        for (let i = 0; i < this.weaponSets.length; i++) {
            const setData = this.weaponSets[i];
            const gridContainer = new GridContainer({
                rows: setData.rows,
                cols: setData.cols,
                items: setData.items || {},
                id: 'weapon',
                index: i,
                containerType: 'weaponSet',
                containerIndex: i,
                persistenceManager: this.persistenceManager,
                actor: this.actor,
                token: this.token,
                onCellClick: this.onCellClick,
                onCellRightClick: this.onCellRightClick,
                onCellDragStart: this.onCellDragStart,
                onCellDragEnd: this.onCellDragEnd,
                onCellDrop: this.onCellDrop,
                decorateCellElement: this.options?.hotbarApp?.adapter?.decorateCellElement || this.options?.decorateCellElement
            });
            
            // Render first to create the element
            await gridContainer.render();
            
            // Now we can modify the element
            gridContainer.element.classList.add('bg3-weapon-set');
            gridContainer.element.dataset.containerIndex = i;
            gridContainer.element.dataset.setId = i;
            
            // Add click handler to switch sets
            this.addEventListener(gridContainer.element, 'click', async (event) => {
                const activeIndex = this.getActiveSet();
                
                // If this is the active set, allow normal cell clicks
                if (i === activeIndex) return;
                
                // If this is an inactive set, clicking anywhere switches to it
                event.preventDefault();
                event.stopPropagation();
                await this._handleSetClick(i, gridContainer);
            });
            
            this.gridContainers.push(gridContainer);
            this.element.appendChild(gridContainer.element);
        }

        // Set initial active set
        const activeIndex = this.getActiveSet();
        this.element.dataset.activeSet = activeIndex;
        this._updateSetTooltips(activeIndex);

        return this.element;
    }

    /**
     * Handle weapon set click
     * @param {number} setIndex - Index of clicked set
     * @param {GridContainer} setContainer - The set container
     * @private
     */
    async _handleSetClick(setIndex, setContainer) {
        const currentActiveSet = this.getActiveSet();
        
        // Don't switch if already active
        if (setIndex === currentActiveSet) return;
        
        // Call system-specific switch logic
        await this.onSetSwitch(setIndex, setContainer);
        
        // Update active set
        await this.setActiveSet(setIndex);
        
        console.log(`WeaponSetContainer | Switched to weapon set ${setIndex + 1}`);
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
     * Update a specific weapon set's data
     * @param {number} setIndex - Index of set to update
     * @param {Object} newData - New grid data
     */
    async updateSet(setIndex, newData) {
        if (setIndex < 0 || setIndex >= this.gridContainers.length) {
            console.warn('WeaponSetContainer | Invalid set index:', setIndex);
            return;
        }
        
        this.weaponSets[setIndex] = newData;
        const gridContainer = this.gridContainers[setIndex];
        gridContainer.rows = newData.rows;
        gridContainer.cols = newData.cols;
        gridContainer.items = newData.items || {};
        await gridContainer.render();
    }

    /**
     * Destroy the container
     */
    destroy() {
        // Destroy grid containers
        for (const container of this.gridContainers) {
            if (container && typeof container.destroy === 'function') {
                container.destroy();
            }
        }
        
        this.gridContainers = [];
        
        super.destroy();
    }
}


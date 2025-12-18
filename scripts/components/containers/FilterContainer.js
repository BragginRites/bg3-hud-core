import { BG3Component } from '../BG3Component.js';
import { FilterButton } from '../buttons/FilterButton.js';

/**
 * Filter Container
 * System-agnostic base class for managing action/resource filters
 * Adapters extend this to provide system-specific filters
 */
export class FilterContainer extends BG3Component {
    /**
     * Create a new filter container
     * @param {Object} options - Container configuration
     * @param {Actor} options.actor - The actor
     * @param {Token} options.token - The token
     * @param {Function} options.getFilters - Function that returns filter definitions
     */
    constructor(options = {}) {
        super(options);
        this.actor = options.actor;
        this.token = options.token;
        this.getFilters = options.getFilters || (() => []);
        this.filterButtons = [];
        this._highlighted = null;
        this._used = [];
    }

    /**
     * Get currently highlighted filter
     * @returns {FilterButton|null}
     */
    get highlighted() {
        return this._highlighted;
    }

    /**
     * Set highlighted filter (toggle if same)
     * @param {FilterButton|null} value
     */
    set highlighted(value) {
        this._highlighted = this._highlighted === value ? null : value;
        this.updateCellFilterState();
    }

    /**
     * Get used filters array
     * @returns {Array<FilterButton>}
     */
    get used() {
        return this._used;
    }

    /**
     * Toggle a filter as used
     * @param {FilterButton} value
     */
    set used(value) {
        if (this._used.includes(value)) {
            this._used.splice(this._used.indexOf(value), 1);
        } else {
            this._used.push(value);
            // Clear highlight if marking as used
            if (this._highlighted === value) {
                this._highlighted = null;
            }
        }
        this.updateCellFilterState();
    }

    /**
     * Reset all used filters
     */
    resetUsedFilters() {
        this._used = [];
        this.updateCellFilterState();
    }

    /**
     * Check if a cell matches a filter
     * Override in adapter to provide system-specific matching logic
     * @param {FilterButton} filter - The filter button
     * @param {HTMLElement} cell - The cell element
     * @returns {boolean}
     */
    matchesFilter(filter, cell) {
        // Default: no matching (adapters should override)
        return false;
    }

    /**
     * Update visual state of filters and cells based on highlight/used state
     */
    updateCellFilterState() {
        // Update filter button states
        for (const filter of this.filterButtons) {
            const isUsed = this._used.includes(filter);
            const isHighlighted = this._highlighted === filter;

            // Update border color
            filter.element.style.borderColor = isHighlighted && !isUsed ?
                filter.data.color : 'transparent';

            // Update used class
            filter.element.classList.toggle('used', isUsed);
        }

        // Set the active filter color as a CSS variable for cell borders
        if (this._highlighted) {
            document.documentElement.style.setProperty('--active-filter-color', this._highlighted.data.color);
        } else {
            document.documentElement.style.removeProperty('--active-filter-color');
        }

        // Update cell states
        const cells = document.querySelectorAll('.bg3-grid-cell.filled');

        for (const cell of cells) {
            const isUsed = this._used.some(f => this.matchesFilter(f, cell));
            const isHighlighted = this._highlighted ?
                this.matchesFilter(this._highlighted, cell) : false;

            // Update used class
            cell.classList.toggle('used', isUsed);

            // Update highlight state
            if (!this._highlighted) {
                cell.dataset.highlight = 'false';
            } else {
                cell.dataset.highlight = isHighlighted && !isUsed ?
                    'highlight' : 'excluded';
            }
        }
    }

    /**
     * Check if any cells on the hotbar match a filter definition
     * @param {Object} filterDef - The filter definition from adapter
     * @returns {boolean}
     */
    hasMatchingCells(filterDef) {
        // Filters with alwaysShow bypass the cell matching check
        if (filterDef.alwaysShow) return true;

        const cells = document.querySelectorAll('.bg3-grid-cell.filled');
        if (cells.length === 0) return true; // If no cells yet, show all filters

        // Create a temporary filter button to use matchesFilter
        // We need to simulate what the filter would match
        const tempFilter = { data: { ...filterDef, ...filterDef.data } };

        for (const cell of cells) {
            if (this.matchesFilter(tempFilter, cell)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Render the filter container
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        if (!this.element) {
            this.element = this.createElement('div', ['bg3-filter-container']);
        }

        // Clear existing filters
        this.element.innerHTML = '';
        this.filterButtons = [];

        // Get filter definitions from adapter
        const filterDefs = this.getFilters();

        // Create filter buttons only for filters that have matching cells on hotbar
        for (const filterDef of filterDefs) {
            // Skip filters with no matching cells on hotbar
            if (!this.hasMatchingCells(filterDef)) {
                continue;
            }

            const button = new FilterButton({
                ...filterDef,
                container: this
            });

            await button.render();
            this.filterButtons.push(button);
            this.element.appendChild(button.element);
        }

        return this.element;
    }

    /**
     * Update filters (useful when actor data changes)
     * Only updates filter values (like spell slots) without rebuilding the entire container
     */
    async update() {
        // Get fresh filter definitions from adapter
        const filterDefs = this.getFilters();

        // Update existing filter buttons in-place
        for (let i = 0; i < filterDefs.length && i < this.filterButtons.length; i++) {
            const filterDef = filterDefs[i];
            const button = this.filterButtons[i];

            // Check if value or max has changed
            const valueChanged = filterDef.value !== undefined && button.data.value !== filterDef.value;
            const maxChanged = filterDef.max !== undefined && button.data.max !== filterDef.max;

            if (valueChanged || maxChanged) {
                button.data.value = filterDef.value;
                button.data.max = filterDef.max;

                // Update the visual representation without full re-render
                await button.updateSlots(filterDef.value, filterDef.max);
            }
        }

        // If filter count changed (rare), do a full rebuild
        if (filterDefs.length !== this.filterButtons.length) {
            await this.render();
        }
    }

    /**
     * Destroy the container
     */
    destroy() {
        for (const button of this.filterButtons) {
            if (button && typeof button.destroy === 'function') {
                button.destroy();
            }
        }
        this.filterButtons = [];
        super.destroy();
    }
}


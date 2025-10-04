import { BG3Component } from '../BG3Component.js';

/**
 * Filter Button
 * System-agnostic button for filtering cells by action type, resource, etc.
 */
export class FilterButton extends BG3Component {
    /**
     * Create a new filter button
     * @param {Object} options - Button configuration
     * @param {string} options.id - Filter identifier
     * @param {string} options.label - Button label
     * @param {string} options.symbol - FontAwesome icon class (e.g., 'fa-circle')
     * @param {string} options.color - Color for the filter
     * @param {Array<string>} options.classes - Additional CSS classes
     * @param {FilterContainer} options.container - Parent container
     * @param {Object} options.data - Additional data for matching
     */
    constructor(options = {}) {
        super(options);
        this.data = {
            id: options.id,
            label: options.label,
            short: options.short,
            symbol: options.symbol,
            color: options.color,
            classes: options.classes || [],
            ...options.data
        };
        this.container = options.container;
    }

    /**
     * Render the filter button
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        // Create button element
        this.element = this.createElement('button', [
            'bg3-filter-button',
            ...this.data.classes
        ]);

        // Set color
        if (this.data.color) {
            this.element.style.setProperty('--filter-color', this.data.color);
        }

        // Add symbol if provided
        if (this.data.symbol) {
            const icon = document.createElement('i');
            icon.classList.add('fas', this.data.symbol);
            this.element.appendChild(icon);
        }

        // Add top-center short label (e.g., Roman numeral for spell level)
        if (this.data.short) {
            const label = document.createElement('span');
            label.classList.add('filter-label');
            label.textContent = String(this.data.short);
            this.element.appendChild(label);
        }

        // Add slot boxes for resources with uses (spell slots, etc.)
        if (this.data.value !== undefined && this.data.max !== undefined) {
            const track = document.createElement('div');
            track.classList.add('slot-track');

            const maxSlots = Number(this.data.max) || 0;
            const filled = Number(this.data.value) || 0;

            for (let i = 0; i < maxSlots; i++) {
                const box = document.createElement('span');
                box.classList.add('slot-box');
                if (i < filled) box.classList.add('filled');
                track.appendChild(box);
            }

            this.element.appendChild(track);
        }

        // Add tooltip
        if (this.data.label) {
            this.element.dataset.tooltip = this.getTooltipContent();
            this.element.dataset.tooltipDirection = 'UP';
        }

        // Register events
        this.addEventListener(this.element, 'click', (e) => {
            e.preventDefault();
            if (this.data.isCustomResource) return; // Custom resources don't filter
            this.container.highlighted = this;
        });

        this.addEventListener(this.element, 'contextmenu', (e) => {
            e.preventDefault();
            if (this.data.isCustomResource) return; // Custom resources don't filter
            this.container.used = this;
        });

        return this.element;
    }

    /**
     * Update spell slot display without full re-render
     * @param {number} value - Current value
     * @param {number} max - Maximum value
     */
    async updateSlots(value, max) {
        if (!this.element) return;
        
        // Find existing slot track
        const track = this.element.querySelector('.slot-track');
        if (!track) return;
        
        const filled = Number(value) || 0;
        const boxes = track.querySelectorAll('.slot-box');
        
        // Update filled state of each box
        boxes.forEach((box, i) => {
            box.classList.toggle('filled', i < filled);
        });
    }

    /**
     * Get tooltip content
     * @returns {string}
     */
    getTooltipContent() {
        let content = `<strong>${this.data.label}</strong>`;
        
        if (!this.data.isCustomResource) {
            content += '<br><em>Left Click: Highlight matching items</em>';
            content += '<br><em>Right Click: Mark as used</em>';
        }
        
        return content;
    }
}


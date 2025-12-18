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
            centerLabel: options.centerLabel,
            symbol: options.symbol,
            color: options.color,
            classes: options.classes || [],
            value: options.value,
            max: options.max,
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

        // Mark as UI element to prevent system tooltips (dnd5e2, etc.) from showing
        this.element.dataset.bg3Ui = 'true';

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

        // Add slot boxes for resources with uses (spell slots, focus pool, etc.)
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
        // Add centered label for filters without pips (e.g., PF2e spell ranks)
        else if (this.data.centerLabel) {
            const centerSpan = document.createElement('span');
            centerSpan.classList.add('filter-center-label');
            centerSpan.textContent = String(this.data.centerLabel);
            this.element.appendChild(centerSpan);
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
     * Handles changes to both value (filled state) and max (number of slots)
     * @param {number} value - Current value (slots remaining)
     * @param {number} max - Maximum value (total slots)
     */
    async updateSlots(value, max) {
        if (!this.element) return;

        const filled = Number(value) || 0;
        const maxSlots = Number(max) || 0;

        // Find or create slot track
        let track = this.element.querySelector('.slot-track');
        if (!track && maxSlots > 0) {
            track = document.createElement('div');
            track.classList.add('slot-track');
            this.element.appendChild(track);
        } else if (!track) {
            return; // No track and no slots needed
        }

        const boxes = track.querySelectorAll('.slot-box');
        const currentCount = boxes.length;

        // Add slots if max increased
        if (maxSlots > currentCount) {
            for (let i = currentCount; i < maxSlots; i++) {
                const box = document.createElement('span');
                box.classList.add('slot-box');
                if (i < filled) box.classList.add('filled');
                track.appendChild(box);
            }
        }
        // Remove slots if max decreased
        else if (maxSlots < currentCount) {
            for (let i = currentCount - 1; i >= maxSlots; i--) {
                boxes[i].remove();
            }
        }

        // Update filled state on all remaining boxes
        track.querySelectorAll('.slot-box').forEach((box, i) => {
            box.classList.toggle('filled', i < filled);
        });

        // If max is 0, remove the track entirely
        if (maxSlots === 0 && track) {
            track.remove();
        }
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


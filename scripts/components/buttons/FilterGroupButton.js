import { BG3Component } from '../BG3Component.js';
import { FilterButton } from './FilterButton.js';

/**
 * Filter Group Button
 * A parent filter that expands to show child filters in a popout panel
 */
export class FilterGroupButton extends BG3Component {
    /**
     * Create a new filter group button
     * @param {Object} options - Button configuration
     * @param {string} options.id - Group identifier
     * @param {string} options.label - Button label
     * @param {string} options.symbol - FontAwesome icon class
     * @param {string} options.color - Color for the filter
     * @param {Array<Object>} options.children - Child filter definitions
     * @param {FilterContainer} options.container - Parent container
     */
    constructor(options = {}) {
        super(options);
        this.data = {
            id: options.id,
            label: options.label,
            symbol: options.symbol,
            color: options.color,
            classes: options.classes || [],
            children: options.children || []
        };
        this.container = options.container;
        this.childButtons = [];
        this.expanded = false;
        this.popoutElement = null;
    }

    /**
     * Check if any child filter is active (highlighted or used)
     * @returns {boolean}
     */
    get hasActiveChild() {
        return this.childButtons.some(child =>
            this.container._highlighted === child ||
            this.container._used.includes(child)
        );
    }

    /**
     * Render the filter group button
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        // Create button element
        this.element = this.createElement('button', [
            'bg3-filter-button',
            'bg3-filter-group',
            ...this.data.classes
        ]);

        // Mark as UI element
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

        // Add expand arrow
        const arrow = document.createElement('i');
        arrow.classList.add('fas', 'fa-caret-up', 'filter-group-arrow');
        this.element.appendChild(arrow);

        // Add tooltip (use label if available, otherwise id)
        const tooltipLabel = this.data.label || this.data.id || 'Expand';
        this.element.dataset.tooltip = `<strong>${tooltipLabel}</strong><br><em>Click to expand</em>`;
        this.element.dataset.tooltipDirection = 'UP';

        // Create popout panel (hidden by default)
        await this.createPopout();

        // Register events
        this.addEventListener(this.element, 'click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleExpanded();
        });

        // Close popout when clicking outside
        this.addEventListener(document, 'click', (e) => {
            if (this.expanded &&
                !this.element.contains(e.target) &&
                !this.popoutElement?.contains(e.target)) {
                this.collapse();
            }
        });

        return this.element;
    }

    /**
     * Create the popout panel with child filters
     */
    async createPopout() {
        this.popoutElement = this.createElement('div', ['bg3-filter-popout']);
        this.popoutElement.style.display = 'none';

        // Create child filter buttons
        this.childButtons = [];
        for (const childDef of this.data.children) {
            // Skip children with no matching cells
            if (!this.container.hasMatchingCells(childDef)) {
                continue;
            }

            const childButton = new FilterButton({
                ...childDef,
                container: this.container
            });

            await childButton.render();
            this.childButtons.push(childButton);
            this.popoutElement.appendChild(childButton.element);
        }
    }

    /**
     * Toggle the popout expanded/collapsed
     */
    toggleExpanded() {
        if (this.expanded) {
            this.collapse();
        } else {
            this.expand();
        }
    }

    /**
     * Expand the popout
     */
    expand() {
        if (!this.popoutElement || this.childButtons.length === 0) return;

        this.expanded = true;
        this.element.classList.add('expanded');
        this.popoutElement.style.display = 'flex';

        // Append popout to container if not already
        if (!this.popoutElement.parentElement && this.container.element) {
            this.container.element.appendChild(this.popoutElement);
        }

        // Position the popout ABOVE the button, centered
        const rect = this.element.getBoundingClientRect();
        const containerRect = this.container.element?.getBoundingClientRect();
        const popoutHeight = this.popoutElement.offsetHeight || 30;

        if (containerRect) {
            // Position above the button
            const buttonCenterX = rect.left + rect.width / 2 - containerRect.left;
            this.popoutElement.style.bottom = `${containerRect.bottom - rect.top + 4}px`;
            this.popoutElement.style.left = `${buttonCenterX}px`;
            this.popoutElement.style.transform = 'translateX(-50%)';
            this.popoutElement.style.top = 'auto';
        }

        // Collapse any other expanded groups
        for (const filter of this.container.filterButtons) {
            if (filter !== this && filter instanceof FilterGroupButton && filter.expanded) {
                filter.collapse();
            }
        }
    }

    /**
     * Collapse the popout
     */
    collapse() {
        this.expanded = false;
        this.element.classList.remove('expanded');
        if (this.popoutElement) {
            this.popoutElement.style.display = 'none';
        }
    }

    /**
     * Update active state indicator
     */
    updateActiveState() {
        this.element.classList.toggle('has-active-child', this.hasActiveChild);
    }

    /**
     * Get tooltip content
     * @returns {string}
     */
    getTooltipContent() {
        return `<strong>${this.data.label}</strong><br><em>Click to expand</em>`;
    }

    /**
     * Destroy the component
     */
    destroy() {
        // Destroy child buttons
        for (const child of this.childButtons) {
            if (child && typeof child.destroy === 'function') {
                child.destroy();
            }
        }
        this.childButtons = [];

        // Remove popout
        if (this.popoutElement) {
            this.popoutElement.remove();
            this.popoutElement = null;
        }

        super.destroy();
    }
}

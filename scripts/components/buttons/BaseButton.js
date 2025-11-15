import { BG3Component } from '../BG3Component.js';

/**
 * Base Button Component
 * Generic clickable button that can be extended for specific use cases
 */
export class BaseButton extends BG3Component {
    /**
     * Create a new button
     * @param {Object} options - Button configuration
     * @param {string} options.label - Button label text
     * @param {string} options.icon - Icon path or class
     * @param {Function} options.onClick - Click handler
     * @param {string[]} options.classes - Additional CSS classes
     */
    constructor(options = {}) {
        super(options);
        this.key = options.key || '';
        this.label = options.label || '';
        this.icon = options.icon || null;
        this.onClick = options.onClick || null;
        this.onRightClick = options.onRightClick || null;
        this.classes = options.classes || [];
        this.tooltip = options.tooltip || '';
    }

    /**
     * Render the button
     * @returns {Promise<void>}
     */
    async render() {
        // Create button element
        this.element = this.createElement('button', ['bg3-button', ...this.classes]);

        // Mark as UI element to prevent system tooltips (dnd5e2, etc.) from showing
        this.element.dataset.bg3Ui = 'true';

        // Add data-key attribute if provided
        if (this.key) {
            this.element.dataset.key = this.key;
        }

        // Add tooltip if provided (using custom BG3 tooltip system)
        if (this.tooltip) {
            this.element.dataset.tooltip = this.tooltip;
            this.element.dataset.tooltipDirection = this.tooltipDirection || 'UP';
        }

        // Add icon if provided
        if (this.icon) {
            const iconElement = document.createElement('i');
            iconElement.classList.add('bg3-button-icon');
            if (this.icon.startsWith('fa-')) {
                iconElement.classList.add('fas', this.icon);
            } else {
                iconElement.style.backgroundImage = `url(${this.icon})`;
            }
            this.element.appendChild(iconElement);
        }

        // Add label if provided
        if (this.label) {
            const labelElement = this.createElement('span', ['bg3-button-label']);
            labelElement.textContent = this.label;
            this.element.appendChild(labelElement);
        }

        // Add click handler
        if (this.onClick) {
            this.addEventListener(this.element, 'click', (event) => {
                this.onClick(event);
            });
        }

        // Add right-click handler
        if (this.onRightClick) {
            this.addEventListener(this.element, 'contextmenu', (event) => {
                event.preventDefault();
                this.onRightClick(event);
            });
        }

        // Add hover states
        this.addEventListener(this.element, 'mouseenter', () => {
            this.element.classList.add('hover');
        });
        this.addEventListener(this.element, 'mouseleave', () => {
            this.element.classList.remove('hover');
        });

        return this.element;
    }

    /**
     * Set button enabled/disabled state
     * @param {boolean} enabled - Whether button should be enabled
     */
    setEnabled(enabled) {
        if (this.element) {
            this.element.disabled = !enabled;
            this.element.classList.toggle('disabled', !enabled);
        }
    }

    /**
     * Update button label
     * @param {string} newLabel - New label text
     */
    setLabel(newLabel) {
        this.label = newLabel;
        if (this.element) {
            const labelElement = this.element.querySelector('.bg3-button-label');
            if (labelElement) {
                labelElement.textContent = newLabel;
            }
        }
    }
}

import { BG3Component } from '../BG3Component.js';

/**
 * Passive Button - Abstract Base Class
 * Displays a single passive ability/trait/feature icon
 * System-agnostic - adapters can override for system-specific behavior
 * 
 * @abstract
 */
export class PassiveButton extends BG3Component {
    /**
     * Create a new passive button
     * @param {Object} options - Button options
     * @param {Item} options.item - The passive item to display
     * @param {Actor} options.actor - The actor (for context)
     */
    constructor(options = {}) {
        super(options);
        this.item = options.item;
        this.actor = options.actor;
    }

    /**
     * Get the image URL for this passive
     * Override in subclass for custom image logic
     * @returns {string} Image URL
     */
    getImage() {
        return this.item?.img || 'icons/svg/item-bag.svg';
    }

    /**
     * Get the label for this passive
     * Override in subclass for custom label logic
     * @returns {string} Label text
     */
    getLabel() {
        return this.item?.name || 'Passive';
    }

    /**
     * Handle click event
     * Override in subclass for system-specific click behavior
     * Base implementation opens the item sheet
     * @param {Event} event - Click event
     */
    async onClick(event) {
        event.preventDefault();
        event.stopPropagation();
        
        // Default behavior: open item sheet
        if (this.item?.sheet) {
            this.item.sheet.render(true);
        }
    }

    /**
     * Handle right-click event
     * Base implementation opens the passives configuration dialog
     * @param {Event} event - Right-click event
     */
    async onRightClick(event) {
        event.preventDefault();
        event.stopPropagation();
        
        // Find parent PassivesContainer and trigger its configuration dialog
        // Walk up the component tree to find the container
        let currentElement = this.element.parentElement;
        while (currentElement) {
            if (currentElement.classList.contains('bg3-passives-container')) {
                // Trigger a contextmenu event on the container
                const containerEvent = new MouseEvent('contextmenu', {
                    bubbles: true,
                    cancelable: true,
                    clientX: event.clientX,
                    clientY: event.clientY
                });
                currentElement.dispatchEvent(containerEvent);
                break;
            }
            currentElement = currentElement.parentElement;
        }
    }

    /**
     * Render the passive button
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        // Create or reuse element
        if (!this.element) {
            this.element = this.createElement('div', ['passive-feature-icon']);
        }

        // Clear existing content
        this.element.innerHTML = '';

        // Set data attributes
        this.element.dataset.uuid = this.item?.uuid || '';
        this.element.dataset.itemId = this.item?.id || '';

        // Create image
        const img = this.createElement('img');
        img.src = this.getImage();
        img.alt = this.getLabel();

        this.element.appendChild(img);

        // Add custom tooltip
        this.element.dataset.tooltip = this.getLabel();
        this.element.dataset.tooltipDirection = 'UP';

        // Register events
        this._registerEvents();

        return this.element;
    }

    /**
     * Register click events
     * @private
     */
    _registerEvents() {
        // Left click
        this.addEventListener(this.element, 'click', this.onClick.bind(this));

        // Right click
        this.addEventListener(this.element, 'contextmenu', this.onRightClick.bind(this));
    }

    /**
     * Update the button (called when item changes)
     * Only updates changed properties
     * @returns {Promise<void>}
     */
    async update() {
        if (!this.element || !this.item) return;

        // Update image if changed
        const img = this.element.querySelector('img');
        if (img) {
            const newSrc = this.getImage();
            if (img.src !== newSrc) {
                img.src = newSrc;
            }
            
            const newLabel = this.getLabel();
            if (img.alt !== newLabel) {
                img.alt = newLabel;
            }
        }

        // Update tooltip
        const newTooltip = this.getLabel();
        if (this.element.dataset.tooltip !== newTooltip) {
            this.element.dataset.tooltip = newTooltip;
        }

        // Update data attributes
        if (this.element.dataset.uuid !== (this.item?.uuid || '')) {
            this.element.dataset.uuid = this.item?.uuid || '';
        }
        if (this.element.dataset.itemId !== (this.item?.id || '')) {
            this.element.dataset.itemId = this.item?.id || '';
        }
    }
}


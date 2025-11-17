import { BaseButton } from './BaseButton.js';

/**
 * View Button
 * Represents a saved hotbar view that can be switched to
 * Extends BaseButton with view-specific functionality
 */
export class ViewButton extends BaseButton {
    /**
     * Create a view button
     * @param {Object} options - Button options
     * @param {Object} options.view - View data {id, name, icon}
     * @param {boolean} options.isActive - Whether this view is currently active
     * @param {Function} options.onSwitch - Callback when view is switched
     * @param {Function} options.onContextMenu - Callback for right-click context menu
     */
    constructor(options = {}) {
        const view = options.view || {};
        
        // Build classes array - only add 'active' if isActive is true
        const classes = ['bg3-view-button'];
        if (options.isActive) {
            classes.push('active');
        }
        
        super({
            key: `view-${view.id}`,
            classes: classes,
            icon: view.icon || 'fa-bookmark',
            label: view.name || 'Unnamed View',
            tooltip: `Switch to "${view.name}" view<br>Right-click for options`,
            onClick: options.onSwitch,
            onRightClick: options.onContextMenu
        });

        this.view = view;
        this.isActive = options.isActive || false;
    }

    /**
     * Render the view button
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        await super.render();

        // Add view-specific data attributes
        if (this.element) {
            this.element.dataset.viewId = this.view.id;
            this.element.dataset.viewName = this.view.name;
        }

        return this.element;
    }

    /**
     * Set active state
     * @param {boolean} active - Whether this view is active
     */
    setActive(active) {
        this.isActive = active;
        if (this.element) {
            if (active) {
                this.element.classList.add('active');
            } else {
                this.element.classList.remove('active');
            }
        }
    }

    /**
     * Update view data
     * @param {Object} view - New view data
     */
    updateView(view) {
        this.view = view;
        
        if (this.element) {
            // Update icon
            const iconElement = this.element.querySelector('i');
            if (iconElement) {
                iconElement.className = `fas ${view.icon || 'fa-bookmark'}`;
            }

            // Update label
            const labelElement = this.element.querySelector('.bg3-button-label');
            if (labelElement) {
                labelElement.textContent = view.name;
            }

            // Update data attributes
            this.element.dataset.viewId = view.id;
            this.element.dataset.viewName = view.name;

            // Update tooltip
            this.element.dataset.tooltip = `Switch to "${view.name}" view<br>Right-click for options`;
        }
    }
}

/**
 * New View Button
 * Special button for creating new views
 */
export class NewViewButton extends BaseButton {
    /**
     * Create a new view button
     * @param {Object} options - Button options
     * @param {Function} options.onCreate - Callback when button is clicked
     */
    constructor(options = {}) {
        super({
            key: 'new-view',
            classes: ['bg3-view-button', 'bg3-view-button-new'],
            icon: 'fa-plus',
            tooltip: 'Create New View',
            onClick: options.onCreate
        });
    }

    /**
     * Render the new view button
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        await super.render();

        // Mark as new view button
        if (this.element) {
            this.element.dataset.buttonType = 'new-view';
        }

        return this.element;
    }
}


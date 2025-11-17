import { BG3Component } from '../BG3Component.js';

/**
 * Action Container - Abstract Base Class
 * Displays action grid with filterable items/abilities
 * 
 * System adapters should extend this class to provide:
 * - Action items (spells, abilities, items)
 * - Filter buttons (action types, spell levels, etc.)
 * - Weapon set buttons
 * - Action usage logic
 * 
 * @abstract
 */
export class ActionContainer extends BG3Component {
    /**
     * Create a new action panel
     * @param {Object} options - Panel configuration
     * @param {Actor} options.actor - The actor whose actions to display
     * @param {Token} options.token - The token
     */
    constructor(options = {}) {
        super(options);
        this.actor = options.actor;
        this.token = options.token;
    }

    /**
     * Render the action panel
     * Base implementation provides structure only
     * System adapters should override to add grids and filters
     * 
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        // Create action panel container
        this.element = this.createElement('div', ['bg3-action-panel']);

        // System adapters will populate this with:
        // - Filter buttons
        // - Action grid(s)
        // - Weapon sets

        return this.element;
    }

    /**
     * Get available actions for the actor
     * Override in subclass to provide system-specific actions
     * 
     * @abstract
     * @returns {Promise<Array>}
     */
    async getActions() {
        return [];
    }

    /**
     * Get filter definitions
     * Override in subclass to provide system-specific filters
     * 
     * @abstract
     * @returns {Array}
     */
    getFilters() {
        return [];
    }

    /**
     * Get weapons/equipment
     * Override in subclass to provide system-specific weapon data
     * 
     * @abstract
     * @returns {Array}
     */
    getWeapons() {
        return [];
    }

    /**
     * Handle action usage
     * Override in subclass to implement system-specific action logic
     * 
     * @abstract
     * @param {Object} action - The action to use
     */
    async useAction(action) {
        console.warn('ActionContainer.useAction() not implemented');
    }
}

import { BG3Component } from '../BG3Component.js';

/**
 * Passives Container - Abstract Base Class
 * Displays passive abilities/traits/features that are not directly activatable
 * but provide informational bonuses or situational modifiers
 * 
 * System adapters should extend this class to provide:
 * - getPassiveItems() - Which items are considered "passive"
 * - getSelectedPassives() - Which passives should be displayed (user configuration)
 * - showConfigurationDialog() - How to let users select which passives to display
 * 
 * @abstract
 */
export class PassivesContainer extends BG3Component {
    /**
     * Create a new passives container
     * @param {Object} options - Container options
     * @param {Actor} options.actor - The actor whose passives to display
     * @param {Token} options.token - The token (optional, for reference)
     */
    constructor(options = {}) {
        super(options);
        this.actor = options.actor;
        this.token = options.token;
        this.passiveButtons = new Map(); // Map of item.id -> PassiveButton
    }

    /**
     * Get all passive items from the actor
     * Override in subclass to define what counts as a "passive" for your system
     * 
     * @abstract
     * @returns {Array<Item>} Array of passive items
     */
    getPassiveItems() {
        // Base implementation returns empty array
        // Adapters should override this
        console.warn('PassivesContainer.getPassiveItems() should be overridden by system adapter');
        return [];
    }

    /**
     * Get the set of selected passive UUIDs
     * Override in subclass to implement user selection/configuration
     * 
     * @abstract
     * @returns {Set<string>} Set of item UUIDs that should be displayed
     */
    getSelectedPassives() {
        // Base implementation returns all passives
        // Adapters should override to implement user selection
        const allPassives = this.getPassiveItems();
        return new Set(allPassives.map(item => item.uuid));
    }

    /**
     * Get the list of passive items to display (filtered by selection)
     * @returns {Array<Item>} Array of passive items to display
     */
    getDisplayedPassives() {
        const allPassives = this.getPassiveItems();
        const selected = this.getSelectedPassives();
        
        if (!selected || selected.size === 0) return [];
        
        return allPassives.filter(item => selected.has(item.uuid));
    }

    /**
     * Show configuration dialog to select which passives to display
     * Override in subclass to implement system-specific selection UI
     * 
     * @abstract
     * @param {Event} event - The triggering event
     */
    async showConfigurationDialog(event) {
        // Base implementation does nothing
        // Adapters should override to show selection UI
        ui.notifications.info('Passive configuration not implemented for this system');
    }

    /**
     * Create a passive button for an item
     * Override in subclass if you need custom button behavior
     * 
     * @param {Item} item - The passive item
     * @returns {Promise<BG3Component>} The button component
     */
    async createPassiveButton(item) {
        // Import PassiveButton dynamically to avoid circular dependency
        // Adapters can override this to use their own button class
        const PassiveButton = await this._getPassiveButtonClass();
        return new PassiveButton({
            item: item,
            actor: this.actor
        });
    }

    /**
     * Get the PassiveButton class to use
     * Override in adapter to use system-specific button class
     * @returns {Promise<Class>} PassiveButton class
     * @private
     */
    async _getPassiveButtonClass() {
        // Lazy import to avoid issues
        if (!this._PassiveButtonClass) {
            const module = await import('../buttons/PassiveButton.js');
            this._PassiveButtonClass = module.PassiveButton;
        }
        return this._PassiveButtonClass;
    }

    /**
     * Render the passives container
     * Optimized: Only updates changed/added/removed passives
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        // Create element on first render
        if (!this.element) {
            this.element = this.createElement('div', ['bg3-passives-container']);
            
            // Register click and right-click on container to show configuration
            // This will capture clicks on the ::before pseudo-element (gear icon)
            this.addEventListener(this.element, 'click', async (event) => {
                // Check if click is on the container itself (gear icon area)
                // Not on a child passive button
                if (event.target === this.element) {
                    event.preventDefault();
                    event.stopPropagation();
                    await this.showConfigurationDialog(event);
                }
            });
            
            this.addEventListener(this.element, 'contextmenu', async (event) => {
                // Right-click anywhere on container shows configuration
                event.preventDefault();
                event.stopPropagation();
                await this.showConfigurationDialog(event);
            });
        }

        const currentPassives = this.getDisplayedPassives();
        const currentPassiveIds = new Set(currentPassives.map(p => p.id));
        const existingPassiveIds = new Set(this.passiveButtons.keys());

        // Toggle 'has-passives' class to control gear icon visibility
        if (currentPassives.length > 0) {
            this.element.classList.add('has-passives');
        } else {
            this.element.classList.remove('has-passives');
        }

        // Find passives to remove (no longer in current list)
        for (const passiveId of existingPassiveIds) {
            if (!currentPassiveIds.has(passiveId)) {
                const button = this.passiveButtons.get(passiveId);
                if (button) {
                    button.destroy();
                    this.passiveButtons.delete(passiveId);
                }
            }
        }

        // Find passives to add (new in current list) or update (existing)
        for (const passive of currentPassives) {
            const existingButton = this.passiveButtons.get(passive.id);
            
            if (!existingButton) {
                // New passive - create button (await the async creation)
                const newButton = await this.createPassiveButton(passive);
                const buttonElement = await newButton.render();
                this.element.appendChild(buttonElement);
                this.passiveButtons.set(passive.id, newButton);
            } else {
                // Existing passive - update if needed
                existingButton.item = passive;
                if (typeof existingButton.update === 'function') {
                    await existingButton.update();
                }
            }
        }

        // Ensure DOM order matches passive order
        const orderedIds = currentPassives.map(p => p.id);
        for (let i = 0; i < orderedIds.length; i++) {
            const button = this.passiveButtons.get(orderedIds[i]);
            if (button && button.element) {
                const currentIndex = Array.from(this.element.children).indexOf(button.element);
                if (currentIndex !== i) {
                    if (i >= this.element.children.length) {
                        this.element.appendChild(button.element);
                    } else {
                        this.element.insertBefore(button.element, this.element.children[i]);
                    }
                }
            }
        }

        return this.element;
    }

    /**
     * Destroy all passive buttons
     * @private
     */
    _destroyButtons() {
        for (const button of this.passiveButtons.values()) {
            if (button && typeof button.destroy === 'function') {
                button.destroy();
            }
        }
        this.passiveButtons.clear();
    }

    /**
     * Destroy the container and cleanup
     */
    destroy() {
        this._destroyButtons();
        super.destroy();
    }
}


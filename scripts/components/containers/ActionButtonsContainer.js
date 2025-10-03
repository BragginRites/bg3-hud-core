import { BG3Component } from '../BG3Component.js';
import { BaseButton } from '../buttons/BaseButton.js';

/**
 * Action Buttons Container
 * Displays context-aware action buttons (rest, end turn, etc.)
 * System-agnostic - adapters provide button definitions
 */
export class ActionButtonsContainer extends BG3Component {
    /**
     * Create action buttons container
     * @param {Object} options - Container options
     * @param {Actor} options.actor - The actor
     * @param {Token} options.token - The token
     * @param {Function} options.getButtons - Function that returns button definitions
     */
    constructor(options = {}) {
        super(options);
        this.actor = options.actor;
        this.token = options.token;
        this.getButtons = options.getButtons || (() => []);
        this.buttonComponents = [];
    }

    /**
     * Render the action buttons container
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        if (!this.element) {
            this.element = this.createElement('div', ['bg3-action-buttons-container']);
        }

        // Clear existing buttons
        this.element.innerHTML = '';
        this.buttonComponents = [];

        // Get button definitions from adapter
        const buttonDefs = this.getButtons();

        // Create button components
        for (const buttonDef of buttonDefs) {
            const button = new BaseButton({
                key: buttonDef.key || 'action-button',
                classes: ['bg3-action-button', ...(buttonDef.classes || [])],
                icon: buttonDef.icon,
                label: buttonDef.label,
                tooltip: buttonDef.tooltip || buttonDef.label,
                tooltipDirection: buttonDef.tooltipDirection,
                onClick: buttonDef.onClick,
                visible: buttonDef.visible
            });

            await button.render();
            
            // Handle visibility function
            if (typeof buttonDef.visible === 'function') {
                const isVisible = buttonDef.visible();
                if (!isVisible) {
                    button.element.style.display = 'none';
                }
            }

            this.buttonComponents.push(button);
            this.element.appendChild(button.element);
        }

        return this.element;
    }

    /**
     * Update button visibility based on context (combat state, etc.)
     * Call this when game state changes
     */
    updateVisibility() {
        const buttonDefs = this.getButtons();
        
        for (let i = 0; i < this.buttonComponents.length; i++) {
            const button = this.buttonComponents[i];
            const buttonDef = buttonDefs[i];
            
            if (buttonDef && typeof buttonDef.visible === 'function') {
                const isVisible = buttonDef.visible();
                button.element.style.display = isVisible ? '' : 'none';
            }
        }
    }

    /**
     * Destroy the container and all buttons
     */
    destroy() {
        for (const button of this.buttonComponents) {
            if (button && typeof button.destroy === 'function') {
                button.destroy();
            }
        }
        this.buttonComponents = [];
        super.destroy();
    }
}


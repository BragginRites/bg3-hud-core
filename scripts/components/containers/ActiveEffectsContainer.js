import { BG3Component } from '../BG3Component.js';
import { ActiveEffectButton } from '../buttons/ActiveEffectButton.js';

/**
 * Active Effects Container
 * Displays all active effects from an actor
 * System-agnostic - works with Foundry's base ActiveEffect system
 * 
 * Optimized: Only updates changed/added/removed effects, not full re-render
 */
export class ActiveEffectsContainer extends BG3Component {
    /**
     * Create a new active effects container
     * @param {Object} options - Container options
     * @param {Actor} options.actor - The actor whose effects to display
     * @param {Token} options.token - The token (optional, for reference)
     */
    constructor(options = {}) {
        super(options);
        this.actor = options.actor;
        this.token = options.token;
        this.effectButtons = new Map(); // Map of effect.id -> ActiveEffectButton
    }

    /**
     * Get the list of active effects from the actor
     * @returns {Array<ActiveEffect>} Array of active effects
     */
    getActiveEffects() {
        if (!this.actor) return [];
        return this.actor.effects?.contents || [];
    }

    /**
     * Render the active effects container
     * Optimized: Only updates what changed
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        // Create element on first render
        if (!this.element) {
            this.element = this.createElement('div', ['bg3-actives-container']);
        }

        const currentEffects = this.getActiveEffects();
        const currentEffectIds = new Set(currentEffects.map(e => e.id));
        const existingEffectIds = new Set(this.effectButtons.keys());

        // Hide container if no effects
        if (currentEffects.length === 0) {
            this.element.style.visibility = 'hidden';
        } else {
            this.element.style.removeProperty('visibility');
        }

        // Find effects to remove (no longer in current list)
        for (const effectId of existingEffectIds) {
            if (!currentEffectIds.has(effectId)) {
                const button = this.effectButtons.get(effectId);
                if (button) {
                    button.destroy();
                    this.effectButtons.delete(effectId);
                }
            }
        }

        // Find effects to add (new in current list) or update (existing)
        for (const effect of currentEffects) {
            const existingButton = this.effectButtons.get(effect.id);
            
            if (!existingButton) {
                // New effect - create button
                const newButton = new ActiveEffectButton({
                    effect: effect,
                    actor: this.actor
                });
                const buttonElement = await newButton.render();
                this.element.appendChild(buttonElement);
                this.effectButtons.set(effect.id, newButton);
            } else {
                // Existing effect - check if it needs update
                existingButton.effect = effect; // Update reference
                await existingButton.update();
            }
        }

        // Ensure DOM order matches effect order (for new additions)
        const orderedIds = currentEffects.map(e => e.id);
        for (let i = 0; i < orderedIds.length; i++) {
            const button = this.effectButtons.get(orderedIds[i]);
            if (button && button.element) {
                // Move to correct position if needed
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
     * Destroy all effect buttons
     * @private
     */
    _destroyButtons() {
        for (const button of this.effectButtons.values()) {
            if (button && typeof button.destroy === 'function') {
                button.destroy();
            }
        }
        this.effectButtons.clear();
    }

    /**
     * Destroy the container and cleanup
     */
    destroy() {
        this._destroyButtons();
        super.destroy();
    }
}


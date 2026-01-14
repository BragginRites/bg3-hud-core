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
        this.effectButtons = new Map(); // Map of compositeKey -> ActiveEffectButton
    }

    /**
     * Generate a composite key for an effect
     * Uses origin + name for transferred effects (auras), otherwise uses effect.id
     * This ensures aura effects don't duplicate when modules create new IDs on each entry
     * @param {ActiveEffect} effect - The effect
     * @returns {string} Composite key
     * @private
     */
    _getEffectKey(effect) {
        // For effects with an origin (transferred from items or auras), use origin + name
        // This handles aura modules that create new effect IDs on each aura entry
        if (effect.origin) {
            const name = effect.name || effect.label || 'unnamed';
            return `${effect.origin}|${name}`;
        }
        // For native effects (no origin), use the effect ID
        return effect.id;
    }

    /**
     * Get the list of active effects from the actor
     * Uses allApplicableEffects() to include item-transferred effects
     * Filters based on showPassiveActiveEffects setting
     * Deduplicates effects by composite key to prevent aura icon multiplication
     * @returns {Array<ActiveEffect>} Array of active effects
     */
    getActiveEffects() {
        if (!this.actor) return [];

        // Use allApplicableEffects() to get effects including those transferred from items
        // This is the correct API for Foundry v11+ with CONFIG.ActiveEffect.legacyTransferral = false
        let allEffects = [];
        if (typeof this.actor.allApplicableEffects === 'function') {
            // allApplicableEffects() returns a Generator, convert to array
            allEffects = Array.from(this.actor.allApplicableEffects());
        } else {
            // Fallback for older Foundry versions
            allEffects = this.actor.effects?.contents || [];
        }

        // Check if we should show passive (non-temporary) effects
        const showPassive = game.settings.get('bg3-hud-core', 'showPassiveActiveEffects');

        let filteredEffects = allEffects;
        if (!showPassive) {
            // Default: only show temporary effects (those with combat duration)
            // Foundry's ActiveEffect has isTemporary getter that checks if effect has duration
            filteredEffects = allEffects.filter(effect => effect.isTemporary);
        }

        // Deduplicate effects by composite key
        // This prevents multiple icons for the same aura when modules create new effect instances
        const seenKeys = new Set();
        const uniqueEffects = [];
        for (const effect of filteredEffects) {
            const key = this._getEffectKey(effect);
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                uniqueEffects.push(effect);
            }
        }

        return uniqueEffects;
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
        const currentEffectKeys = new Set(currentEffects.map(e => this._getEffectKey(e)));
        const existingEffectKeys = new Set(this.effectButtons.keys());

        // Hide container if no effects
        if (currentEffects.length === 0) {
            this.element.style.visibility = 'hidden';
        } else {
            this.element.style.removeProperty('visibility');
        }

        // Find effects to remove (no longer in current list)
        for (const effectKey of existingEffectKeys) {
            if (!currentEffectKeys.has(effectKey)) {
                const button = this.effectButtons.get(effectKey);
                if (button) {
                    button.destroy();
                    this.effectButtons.delete(effectKey);
                }
            }
        }

        // Find effects to add (new in current list) or update (existing)
        for (const effect of currentEffects) {
            const effectKey = this._getEffectKey(effect);
            const existingButton = this.effectButtons.get(effectKey);

            if (!existingButton) {
                // New effect - create button
                const newButton = new ActiveEffectButton({
                    effect: effect,
                    actor: this.actor
                });
                const buttonElement = await newButton.render();
                this.element.appendChild(buttonElement);
                this.effectButtons.set(effectKey, newButton);
            } else {
                // Existing effect - check if it needs update
                existingButton.effect = effect; // Update reference
                await existingButton.update();
            }
        }

        // DOM cleanup: Remove any orphaned children not tracked in the Map
        // This catches edge cases where DOM elements persist but aren't in our tracking
        const trackedElements = new Set();
        for (const button of this.effectButtons.values()) {
            if (button.element) {
                trackedElements.add(button.element);
            }
        }
        const children = Array.from(this.element.children);
        for (const child of children) {
            if (!trackedElements.has(child)) {
                this.element.removeChild(child);
            }
        }

        // Ensure DOM order matches effect order (for new additions)
        const orderedKeys = currentEffects.map(e => this._getEffectKey(e));
        for (let i = 0; i < orderedKeys.length; i++) {
            const button = this.effectButtons.get(orderedKeys[i]);
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


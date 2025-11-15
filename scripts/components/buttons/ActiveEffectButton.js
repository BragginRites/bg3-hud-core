import { BG3Component } from '../BG3Component.js';
import { ConfirmDialog } from '../ui/ConfirmDialog.js';

/**
 * Active Effect Button
 * Displays a single active effect icon with click/right-click functionality
 * System-agnostic - works with Foundry's base ActiveEffect
 */
export class ActiveEffectButton extends BG3Component {
    /**
     * Create a new active effect button
     * @param {Object} options - Button options
     * @param {ActiveEffect} options.effect - The active effect to display
     * @param {Actor} options.actor - The actor (for context)
     */
    constructor(options = {}) {
        super(options);
        this.effect = options.effect;
        this.actor = options.actor;
    }

    /**
     * Get the effect name/label
     * @returns {string}
     * @private
     */
    _getEffectName() {
        return this.effect.label || this.effect.name || 'Effect';
    }

    /**
     * Render the effect button
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        // Create or reuse element
        if (!this.element) {
            this.element = this.createElement('div', ['active-effect-icon']);
        }

        // Clear existing content
        this.element.innerHTML = '';

        // Set data attributes
        this.element.dataset.uuid = this.effect.uuid;
        this.element.dataset.effectId = this.effect.id;

        // Create image
        const img = this.createElement('img');
        img.src = this.effect.img || this.effect.icon || 'icons/svg/aura.svg'; // Fallback icon
        const effectName = this._getEffectName();
        img.alt = effectName;

        this.element.appendChild(img);

        // Update disabled state
        this._updateDisabledState();

        // Register events
        this._registerEvents();

        return this.element;
    }

    /**
     * Update the disabled visual state
     * @private
     */
    _updateDisabledState() {
        if (this.effect.disabled) {
            this.element.classList.add('disabled');
        } else {
            this.element.classList.remove('disabled');
        }
    }

    /**
     * Register click events
     * @private
     */
    _registerEvents() {
        // Left click: Toggle disabled state
        this.addEventListener(this.element, 'click', async (event) => {
            event.preventDefault();
            event.stopPropagation();

            // Toggle the effect's disabled status
            await this.effect.update({ disabled: !this.effect.disabled });

            // Update visual state
            this._updateDisabledState();
        });

        // Right click: Delete effect
        this.addEventListener(this.element, 'contextmenu', async (event) => {
            event.preventDefault();
            event.stopPropagation();

            // If shift is held, skip confirmation dialog
            if (event.shiftKey) {
                await this.effect.delete();
                return;
            }

            // Show custom confirmation dialog
            const effectName = this._getEffectName();
            const confirmed = await ConfirmDialog.confirm({
                title: "Delete Effect",
                message: `Are you sure you want to delete the effect <strong>"${effectName}"</strong>?`,
                confirmLabel: "Delete",
                confirmIcon: "fa-trash",
                cancelLabel: "Cancel",
                cancelIcon: "fa-times"
            });

            if (confirmed) {
                await this.effect.delete();
                // Parent container will handle rerender via hooks
            }
        });
    }

    /**
     * Update the button (called when effect changes)
     * Only updates changed properties
     * @returns {Promise<void>}
     */
    async update() {
        if (!this.element || !this.effect) return;

        // Update image if changed
        const img = this.element.querySelector('img');
        if (img) {
            const newSrc = this.effect.img || this.effect.icon || 'icons/svg/aura.svg';
            if (img.src !== newSrc) {
                img.src = newSrc;
            }
            
            const newAlt = this._getEffectName();
            if (img.alt !== newAlt) {
                img.alt = newAlt;
            }
        }

        // Update data attributes
        if (this.element.dataset.uuid !== this.effect.uuid) {
            this.element.dataset.uuid = this.effect.uuid;
        }
        if (this.element.dataset.effectId !== this.effect.id) {
            this.element.dataset.effectId = this.effect.id;
        }

        // Update disabled state
        this._updateDisabledState();
    }
}


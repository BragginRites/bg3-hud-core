import { BG3Component } from '../BG3Component.js';

/**
 * Info Container Component
 * Displays character information (abilities, skills, etc.)
 * System-agnostic framework - adapters provide the actual data
 * Slides up from a button on top of the portrait
 */
export class InfoContainer extends BG3Component {
    /**
     * Create a new info container
     * @param {Object} options - Container configuration
     * @param {Actor} options.actor - The actor whose info to display
     * @param {Token} options.token - The token
     */
    constructor(options = {}) {
        super(options);
        this.actor = options.actor;
        this.token = options.token;
        this.isOpen = false;
        this._clickOutsideHandler = null;
        this._escapeHandler = null;
    }

    /**
     * Render the info container (button + sliding panel)
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        // Create wrapper
        this.element = this.createElement('div', ['bg3-info-container-wrapper']);

        // Create toggle button (positioned above portrait)
        const button = this.createElement('button', ['bg3-info-button']);
        // Mark as UI element to prevent system tooltips (dnd5e2, etc.) from showing
        button.dataset.bg3Ui = 'true';
        button.innerHTML = '<i class="fas fa-user-circle"></i>';
        const infoTooltip = game.i18n.localize('bg3-hud-core.Tooltips.InfoButton');
        button.setAttribute('data-tooltip', infoTooltip);
        button.setAttribute('data-tooltip-direction', 'UP');
        
        this.addEventListener(button, 'click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggle();
        });

        // Right-click for initiative roll (system adapters can override)
        this.addEventListener(button, 'contextmenu', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await this.onButtonRightClick(e);
        });

        // Create sliding panel (hidden by default)
        const panel = this.createElement('div', ['bg3-info-panel']);
        if (!this.isOpen) {
            panel.classList.add('closed');
        }

        // Render panel content (to be overridden by adapters)
        const content = await this.renderContent();
        if (content) {
            panel.appendChild(content);
        }

        this.element.appendChild(button);
        this.element.appendChild(panel);

        this.button = button;
        this.panel = panel;

        return this.element;
    }

    /**
     * Render the panel content
     * Override this in system adapters to provide specific info
     * @returns {Promise<HTMLElement>}
     */
    async renderContent() {
        const content = this.createElement('div', ['bg3-info-content']);
        content.textContent = 'No info available. System adapter should override renderContent().';
        return content;
    }

    /**
     * Toggle the info panel open/closed
     */
    toggle() {
        this.isOpen = !this.isOpen;
        
        if (this.panel) {
            if (this.isOpen) {
                this.panel.classList.remove('closed');
                this.button?.classList.add('active');
                this._attachCloseListeners();
            } else {
                this.panel.classList.add('closed');
                this.button?.classList.remove('active');
                this._detachCloseListeners();
            }
        }
    }

    /**
     * Open the info panel
     */
    open() {
        if (!this.isOpen) {
            this.toggle();
        }
    }

    /**
     * Close the info panel
     */
    close() {
        if (this.isOpen) {
            this.toggle();
        }
    }

    /**
     * Update the info panel content
     */
    async update() {
        if (!this.panel) return;

        // Clear and re-render content
        this.panel.innerHTML = '';
        const content = await this.renderContent();
        if (content) {
            this.panel.appendChild(content);
        }
    }

    /**
     * Attach listeners for closing the panel (click outside, escape key)
     * @private
     */
    _attachCloseListeners() {
        // Close on escape key
        this._escapeHandler = (event) => {
            if (event.key === 'Escape') {
                this.close();
            }
        };
        document.addEventListener('keydown', this._escapeHandler);

        // Close when clicking outside the container
        this._clickOutsideHandler = (event) => {
            if (!this.element.contains(event.target)) {
                this.close();
            }
        };
        // Use capture phase and delay slightly to avoid immediate close
        setTimeout(() => {
            document.addEventListener('click', this._clickOutsideHandler, true);
        }, 100);
    }

    /**
     * Detach close listeners
     * @private
     */
    _detachCloseListeners() {
        if (this._escapeHandler) {
            document.removeEventListener('keydown', this._escapeHandler);
            this._escapeHandler = null;
        }
        
        if (this._clickOutsideHandler) {
            document.removeEventListener('click', this._clickOutsideHandler, true);
            this._clickOutsideHandler = null;
        }
    }

    /**
     * Handle right-click on info button
     * Override in system adapters to provide custom behavior (e.g., initiative roll)
     * @param {MouseEvent} event - The context menu event
     */
    async onButtonRightClick(event) {
        // Default: no action
        // System adapters should override this
    }

    /**
     * Cleanup when destroying component
     */
    destroy() {
        this._detachCloseListeners();
        super.destroy();
    }
}


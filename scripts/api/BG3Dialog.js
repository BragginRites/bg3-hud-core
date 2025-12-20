/**
 * BG3Dialog - Base dialog class with controlled scrolling and fixed footer
 *
 * Extends ApplicationV2 to provide:
 * - Reliable scrollable body content
 * - Fixed footer that stays at bottom
 * - Foundry-native styling (inherits Foundry's default appearance)
 *
 * Subclasses should override:
 * - _buildBody() - Return HTML string or element for body content
 * - _buildFooter() - Return HTML string or element for footer (optional)
 */
export class BG3Dialog extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = {
        classes: ['bg3-dialog'],
        window: {
            resizable: true,
            contentClasses: ['bg3-dialog-content']
        }
    };

    /**
     * Override in subclass to provide body content HTML
     * @returns {string|HTMLElement} Body content
     * @protected
     */
    _buildBody() {
        return '';
    }

    /**
     * Override in subclass to provide footer content HTML
     * Defaults to a Save button
     * @returns {string|HTMLElement} Footer content
     * @protected
     */
    _buildFooter() {
        return `
      <button type="submit">
        <i class="fas fa-save"></i> ${game.i18n.localize('Save')}
      </button>
    `;
    }

    /**
     * Render the dialog HTML with controlled body/footer structure
     * @returns {Promise<HTMLElement>}
     * @override
     */
    async _renderHTML() {
        const body = this._buildBody();
        const footer = this._buildFooter();

        const container = document.createElement('form');
        container.className = 'bg3-dialog-wrapper standard-form';
        container.autocomplete = 'off';

        // Body section (scrollable)
        const bodySection = document.createElement('div');
        bodySection.className = 'bg3-dialog-body';
        if (typeof body === 'string') {
            bodySection.innerHTML = body;
        } else if (body instanceof HTMLElement) {
            bodySection.appendChild(body);
        }
        container.appendChild(bodySection);

        // Footer section (fixed at bottom)
        const footerSection = document.createElement('footer');
        footerSection.className = 'bg3-dialog-footer form-footer';
        if (typeof footer === 'string') {
            footerSection.innerHTML = footer;
        } else if (footer instanceof HTMLElement) {
            footerSection.appendChild(footer);
        }
        container.appendChild(footerSection);

        return container;
    }

    /**
     * Replace window content with rendered HTML
     * @param {HTMLElement} result - Rendered HTML element
     * @param {HTMLElement} content - Content target
     * @returns {Promise<HTMLElement>}
     * @override
     */
    async _replaceHTML(result, content) {
        const target = content ?? this.element;
        if (!target) return result;
        target.replaceChildren(result);
        return target;
    }

    /**
     * Called after render - bind form submit handler
     * @param {object} context - Render context
     * @param {object} options - Render options
     * @override
     */
    _onRender(context, options) {
        const form = this.element?.querySelector('form');
        if (form) {
            form.addEventListener('submit', event => {
                event.preventDefault();
                void this._onSubmit(event);
            });
        }
        this._onRenderDialog(context, options);
    }

    /**
     * Hook for subclasses to add render behavior
     * @param {object} context - Render context
     * @param {object} options - Render options
     * @protected
     */
    _onRenderDialog(context, options) {
        // Override in subclass for additional render setup
    }

    /**
     * Handle form submission - override in subclass
     * @param {SubmitEvent} event - Form submit event
     * @returns {Promise<void>}
     * @protected
     */
    async _onSubmit(event) {
        // Override in subclass
        this.close();
    }
}

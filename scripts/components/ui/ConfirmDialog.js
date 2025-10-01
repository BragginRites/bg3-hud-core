import { BG3Component } from '../BG3Component.js';

/**
 * Confirmation Dialog Component
 * A custom dialog for confirming destructive actions
 * Uses BG3 HUD styling for consistent appearance
 */
export class ConfirmDialog extends BG3Component {
    /**
     * Create a new confirmation dialog
     * @param {Object} options - Dialog options
     * @param {string} options.title - Dialog title
     * @param {string} options.message - Confirmation message (can include HTML)
     * @param {string} options.confirmLabel - Label for confirm button (default: "Confirm")
     * @param {string} options.confirmIcon - Icon for confirm button (default: "fa-check")
     * @param {string} options.cancelLabel - Label for cancel button (default: "Cancel")
     * @param {string} options.cancelIcon - Icon for cancel button (default: "fa-times")
     * @param {Function} options.onConfirm - Callback when confirmed (optional)
     * @param {Function} options.onCancel - Callback when cancelled (optional)
     */
    constructor(options = {}) {
        super(options);
        this.title = options.title || 'Confirm Action';
        this.message = options.message || 'Are you sure?';
        this.confirmLabel = options.confirmLabel || 'Confirm';
        this.confirmIcon = options.confirmIcon || 'fa-check';
        this.cancelLabel = options.cancelLabel || 'Cancel';
        this.cancelIcon = options.cancelIcon || 'fa-times';
        this.onConfirm = options.onConfirm;
        this.onCancel = options.onCancel;
    }

    /**
     * Static method to show a confirmation dialog and return a promise
     * @param {Object} options - Dialog options (same as constructor)
     * @returns {Promise<boolean>} Resolves to true if confirmed, false if cancelled
     */
    static async confirm(options) {
        return new Promise((resolve) => {
            const dialog = new ConfirmDialog({
                ...options,
                onConfirm: async () => {
                    if (options.onConfirm) await options.onConfirm();
                    resolve(true);
                },
                onCancel: () => {
                    if (options.onCancel) options.onCancel();
                    resolve(false);
                }
            });
            dialog.render();
        });
    }

    /**
     * Render the dialog
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        // Create dialog container (no overlay to allow canvas interaction)
        this.element = this.createElement('div', ['bg3-confirm-dialog']);

        // Dialog header
        const header = this.createElement('div', ['dialog-header']);
        const titleEl = this.createElement('h2', ['dialog-title']);
        titleEl.textContent = this.title;
        header.appendChild(titleEl);
        this.element.appendChild(header);

        // Dialog content
        const content = this.createElement('div', ['dialog-content']);
        const message = this.createElement('div', ['dialog-message']);
        message.innerHTML = this.message; // Allow HTML in message
        content.appendChild(message);
        this.element.appendChild(content);

        // Dialog footer with buttons
        const footer = this.createElement('div', ['dialog-footer']);

        const cancelBtn = this.createElement('button', ['dialog-button', 'dialog-button-secondary']);
        cancelBtn.innerHTML = `<i class="fas ${this.cancelIcon}"></i> ${this.cancelLabel}`;
        this.addEventListener(cancelBtn, 'click', () => this._onCancelClick());

        const confirmBtn = this.createElement('button', ['dialog-button', 'dialog-button-danger']);
        confirmBtn.innerHTML = `<i class="fas ${this.confirmIcon}"></i> ${this.confirmLabel}`;
        this.addEventListener(confirmBtn, 'click', () => this._onConfirmClick());

        footer.appendChild(cancelBtn);
        footer.appendChild(confirmBtn);
        this.element.appendChild(footer);

        // Add dialog directly to body (no overlay)
        document.body.appendChild(this.element);

        // Close on Escape key
        this.addEventListener(document, 'keydown', (event) => {
            if (event.key === 'Escape') {
                this._onCancelClick();
            }
        });

        return this.element;
    }

    /**
     * Handle confirm button click
     * @private
     */
    async _onConfirmClick() {
        if (this.onConfirm) {
            await this.onConfirm();
        }
        this.close();
    }

    /**
     * Handle cancel button click
     * @private
     */
    _onCancelClick() {
        if (this.onCancel) {
            this.onCancel();
        }
        this.close();
    }

    /**
     * Close and cleanup the dialog
     */
    close() {
        // Remove dialog from DOM
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        // Then destroy components
        this.destroy();
    }

    /**
     * Destroy the dialog
     */
    destroy() {
        // Clean up event listeners
        super.destroy();
        // Clear references
        this.element = null;
    }
}


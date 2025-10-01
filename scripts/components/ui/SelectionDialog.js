import { BG3Component } from '../BG3Component.js';

/**
 * Selection Dialog Component
 * A custom dialog for selecting items from a list with checkboxes
 * Uses BG3 HUD styling for consistent appearance
 */
export class SelectionDialog extends BG3Component {
    /**
     * Create a new selection dialog
     * @param {Object} options - Dialog options
     * @param {string} options.title - Dialog title
     * @param {Array} options.items - Array of items to display
     * @param {string} options.items[].id - Unique identifier
     * @param {string} options.items[].label - Display label
     * @param {string} options.items[].img - Icon image URL
     * @param {boolean} options.items[].selected - Whether item is selected
     * @param {Function} options.onSave - Callback when saved (receives array of selected IDs)
     * @param {Function} options.onCancel - Callback when cancelled (optional)
     */
    constructor(options = {}) {
        super(options);
        this.title = options.title || 'Select Items';
        this.items = options.items || [];
        this.onSave = options.onSave;
        this.onCancel = options.onCancel;
        this.selectedIds = new Set(this.items.filter(i => i.selected).map(i => i.id));
    }

    /**
     * Render the dialog
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        // Create dialog container (no overlay to allow canvas interaction)
        this.element = this.createElement('div', ['bg3-selection-dialog']);

        // Dialog header
        const header = this.createElement('div', ['dialog-header']);
        const titleEl = this.createElement('h2', ['dialog-title']);
        titleEl.textContent = this.title;
        header.appendChild(titleEl);
        this.element.appendChild(header);

        // Dialog content
        const content = this.createElement('div', ['dialog-content']);
        
        // Sort items alphabetically by label
        const sortedItems = [...this.items].sort((a, b) => 
            a.label.localeCompare(b.label)
        );

        // Create list of items with checkboxes
        for (const item of sortedItems) {
            const row = this.createElement('div', ['dialog-item-row']);
            row.dataset.itemId = item.id;

            // Checkbox
            const checkbox = this.createElement('input', ['dialog-checkbox']);
            checkbox.type = 'checkbox';
            checkbox.checked = this.selectedIds.has(item.id);
            checkbox.dataset.itemId = item.id;

            // Icon
            const icon = this.createElement('img', ['dialog-item-icon']);
            icon.src = item.img || 'icons/svg/item-bag.svg';
            icon.alt = item.label;

            // Label
            const label = this.createElement('span', ['dialog-item-label']);
            label.textContent = item.label;

            // Handle row click (toggle checkbox)
            this.addEventListener(row, 'click', (event) => {
                // Don't toggle if clicking directly on checkbox
                if (event.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                    this._onCheckboxChange(checkbox);
                }
            });

            // Handle checkbox change
            this.addEventListener(checkbox, 'change', () => {
                this._onCheckboxChange(checkbox);
            });

            row.appendChild(checkbox);
            row.appendChild(icon);
            row.appendChild(label);
            content.appendChild(row);
        }

        this.element.appendChild(content);

        // Dialog footer with buttons
        const footer = this.createElement('div', ['dialog-footer']);

        const saveBtn = this.createElement('button', ['dialog-button', 'dialog-button-primary']);
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Save';
        this.addEventListener(saveBtn, 'click', () => this._onSaveClick());

        const cancelBtn = this.createElement('button', ['dialog-button', 'dialog-button-secondary']);
        cancelBtn.innerHTML = '<i class="fas fa-times"></i> Cancel';
        this.addEventListener(cancelBtn, 'click', () => this._onCancelClick());

        footer.appendChild(cancelBtn);
        footer.appendChild(saveBtn);
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
     * Handle checkbox change
     * @param {HTMLInputElement} checkbox
     * @private
     */
    _onCheckboxChange(checkbox) {
        const itemId = checkbox.dataset.itemId;
        if (checkbox.checked) {
            this.selectedIds.add(itemId);
        } else {
            this.selectedIds.delete(itemId);
        }
    }

    /**
     * Handle save button click
     * @private
     */
    async _onSaveClick() {
        if (this.onSave) {
            await this.onSave(Array.from(this.selectedIds));
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


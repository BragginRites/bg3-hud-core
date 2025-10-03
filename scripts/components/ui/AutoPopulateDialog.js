import { BG3Component } from '../BG3Component.js';

/**
 * Auto Populate Dialog
 * Shows a dialog with pill-style choices for selecting item types to populate
 */
export class AutoPopulateDialog extends BG3Component {
    /**
     * Create dialog
     * @param {Object} options - Dialog options
     * @param {string} options.title - Dialog title
     * @param {Array<{value: string, label: string}>} options.choices - Available choices
     */
    constructor(options = {}) {
        super(options);
        this.title = options.title || 'Select Items';
        this.choices = options.choices || [];
        this.selectedValues = new Set();
        this.resolve = null;
        this.reject = null;
    }

    /**
     * Render the dialog and return a promise that resolves with selected values
     * @returns {Promise<Array<string>>}
     */
    async render() {
        return new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
            this._renderDialog();
        });
    }

    /**
     * Render the dialog HTML
     * @private
     */
    async _renderDialog() {
        // Create dialog container
        this.element = this.createElement('div', ['bg3-dialog-overlay']);
        
        // Create dialog box
        const dialogBox = this.createElement('div', ['bg3-dialog']);
        
        // Title
        const title = this.createElement('h2', ['bg3-dialog-title']);
        title.textContent = this.title;
        dialogBox.appendChild(title);

        // Content area with grouped pills
        const content = this.createElement('div', ['bg3-dialog-content']);
        
        // Check if choices are grouped or flat
        const isGrouped = this.choices.length > 0 && this.choices[0].group;
        
        if (isGrouped) {
            // Render grouped choices
            for (const group of this.choices) {
                // Group header
                const groupHeader = this.createElement('div', ['bg3-pills-group-header']);
                groupHeader.textContent = group.group;
                content.appendChild(groupHeader);
                
                // Pills container for this group
                const pillsContainer = this.createElement('div', ['bg3-pills-container']);
                
                for (const choice of group.choices) {
                    const pill = this.createElement('button', ['bg3-pill']);
                    pill.textContent = choice.label;
                    pill.dataset.value = choice.value;
                    
                    pill.addEventListener('click', (e) => {
                        e.preventDefault();
                        this._togglePill(pill, choice.value);
                    });
                    
                    pillsContainer.appendChild(pill);
                }
                
                content.appendChild(pillsContainer);
            }
        } else {
            // Render flat choices (backward compatibility)
            const pillsContainer = this.createElement('div', ['bg3-pills-container']);
            
            for (const choice of this.choices) {
                const pill = this.createElement('button', ['bg3-pill']);
                pill.textContent = choice.label;
                pill.dataset.value = choice.value;
                
                pill.addEventListener('click', (e) => {
                    e.preventDefault();
                    this._togglePill(pill, choice.value);
                });
                
                pillsContainer.appendChild(pill);
            }
            
            content.appendChild(pillsContainer);
        }
        
        dialogBox.appendChild(content);

        // Buttons
        const buttons = this.createElement('div', ['bg3-dialog-buttons']);
        
        const confirmButton = this.createElement('button', ['bg3-button', 'bg3-button-primary']);
        confirmButton.innerHTML = '<i class="fas fa-check"></i> Populate';
        confirmButton.addEventListener('click', () => this._onConfirm());
        
        const cancelButton = this.createElement('button', ['bg3-button']);
        cancelButton.innerHTML = '<i class="fas fa-times"></i> Cancel';
        cancelButton.addEventListener('click', () => this._onCancel());
        
        buttons.appendChild(confirmButton);
        buttons.appendChild(cancelButton);
        dialogBox.appendChild(buttons);

        this.element.appendChild(dialogBox);
        
        // Add to DOM
        document.body.appendChild(this.element);

        // Close on overlay click
        this.element.addEventListener('click', (e) => {
            if (e.target === this.element) {
                this._onCancel();
            }
        });

        // Close on Escape key
        this._escapeHandler = (e) => {
            if (e.key === 'Escape') {
                this._onCancel();
            }
        };
        document.addEventListener('keydown', this._escapeHandler);
    }

    /**
     * Toggle pill selection
     * @param {HTMLElement} pill - The pill element
     * @param {string} value - The choice value
     * @private
     */
    _togglePill(pill, value) {
        if (this.selectedValues.has(value)) {
            this.selectedValues.delete(value);
            pill.classList.remove('active');
        } else {
            this.selectedValues.add(value);
            pill.classList.add('active');
        }
    }

    /**
     * Handle confirm button
     * @private
     */
    _onConfirm() {
        const selected = Array.from(this.selectedValues);
        this._close();
        if (this.resolve) {
            this.resolve(selected);
        }
    }

    /**
     * Handle cancel button
     * @private
     */
    _onCancel() {
        this._close();
        if (this.resolve) {
            this.resolve([]);
        }
    }

    /**
     * Close and cleanup dialog
     * @private
     */
    _close() {
        if (this._escapeHandler) {
            document.removeEventListener('keydown', this._escapeHandler);
        }
        this.destroy();
    }
}


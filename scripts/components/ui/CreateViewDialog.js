import { BG3Component } from '../BG3Component.js';

/**
 * Create View Dialog
 * Custom dialog for creating new hotbar views with icon selection
 */
export class CreateViewDialog extends BG3Component {
    /**
     * Preset fantasy-themed Font Awesome icons
     */
    static PRESET_ICONS = [
        'fa-bookmark',
        'fa-sword',
        'fa-shield',
        'fa-wand-magic',
        'fa-bow-arrow',
        'fa-staff',
        'fa-hammer',
        'fa-axe',
        'fa-dagger',
        'fa-scroll',
        'fa-book',
        'fa-flask',
        'fa-hat-wizard',
        'fa-dragon',
        'fa-skull',
        'fa-fire',
        'fa-bolt',
        'fa-heart',
        'fa-star',
        'fa-moon',
        'fa-sun',
        'fa-compass',
        'fa-map',
        'fa-dice',
        'fa-crown',
        'fa-gem',
        'fa-ring',
        'fa-key',
        'fa-lock',
        'fa-unlock',
        'fa-dungeon',
        'fa-mountain',
        'fa-tree',
        'fa-tent',
        'fa-home',
        'fa-fort'
    ];

    /**
     * Create a new Create View Dialog
     * @param {Object} options - Dialog options
     * @param {Function} options.onCreate - Callback when view is created (receives name and icon)
     * @param {Function} options.onCancel - Callback when cancelled
     */
    constructor(options = {}) {
        super(options);
        this.onCreate = options.onCreate;
        this.onCancel = options.onCancel;
        this.selectedIcon = 'fa-bookmark'; // Default icon
    }

    /**
     * Static method to show dialog and return a promise
     * @param {Object} options - Dialog options
     * @returns {Promise<Object|null>} Resolves to {name, icon} or null if cancelled
     */
    static async show(options = {}) {
        return new Promise((resolve) => {
            const dialog = new CreateViewDialog({
                ...options,
                onCreate: async (name, icon) => {
                    if (options.onCreate) await options.onCreate(name, icon);
                    resolve({ name, icon });
                },
                onCancel: () => {
                    if (options.onCancel) options.onCancel();
                    resolve(null);
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
        // Create dialog container (SelectionDialog style)
        this.element = this.createElement('div', ['bg3-selection-dialog', 'bg3-create-view-dialog']);

        // Dialog header
        const header = this.createElement('div', ['dialog-header']);
        const title = this.createElement('h2', ['dialog-title']);
        title.textContent = 'Create New View';
        header.appendChild(title);
        this.element.appendChild(header);

        // Dialog content
        const content = this.createElement('div', ['dialog-content']);

        // Name input section
        const nameSection = this.createElement('div', ['dialog-section']);
        const nameLabel = this.createElement('label', ['dialog-label']);
        nameLabel.textContent = 'View Name';
        const nameInput = this.createElement('input', ['dialog-input']);
        nameInput.type = 'text';
        nameInput.value = 'New View';
        nameInput.placeholder = 'Enter view name...';
        nameInput.autocomplete = 'off';
        nameInput.setAttribute('data-lpignore', 'true'); // LastPass ignore
        nameInput.setAttribute('data-form-type', 'other'); // Generic password manager hint
        nameSection.appendChild(nameLabel);
        nameSection.appendChild(nameInput);
        content.appendChild(nameSection);

        // Icon selection section
        const iconSection = this.createElement('div', ['dialog-section']);
        const iconLabel = this.createElement('label', ['dialog-label']);
        iconLabel.textContent = 'Select Icon';
        iconSection.appendChild(iconLabel);

        // Icon grid
        const iconGrid = this.createElement('div', ['icon-grid']);
        for (const iconClass of CreateViewDialog.PRESET_ICONS) {
            const iconButton = this.createElement('button', ['icon-button']);
            if (iconClass === this.selectedIcon) {
                iconButton.classList.add('selected');
            }
            
            const icon = document.createElement('i');
            icon.className = `fas ${iconClass}`;
            iconButton.appendChild(icon);
            
            this.addEventListener(iconButton, 'click', () => {
                // Remove selection from all buttons
                iconGrid.querySelectorAll('.icon-button').forEach(btn => btn.classList.remove('selected'));
                // Select this button
                iconButton.classList.add('selected');
                this.selectedIcon = iconClass;
                // Clear custom input
                customInput.value = '';
            });
            
            iconGrid.appendChild(iconButton);
        }
        iconSection.appendChild(iconGrid);

        // Custom icon input
        const customLabel = this.createElement('label', ['dialog-label', 'dialog-label-small']);
        customLabel.textContent = 'Or enter custom Font Awesome class:';
        customLabel.style.marginTop = '12px';
        const customInput = this.createElement('input', ['dialog-input', 'dialog-input-small']);
        customInput.type = 'text';
        customInput.placeholder = 'e.g., fa-sparkles';
        customInput.autocomplete = 'off';
        customInput.setAttribute('data-lpignore', 'true'); // LastPass ignore
        customInput.setAttribute('data-form-type', 'other'); // Generic password manager hint
        
        this.addEventListener(customInput, 'input', (e) => {
            if (e.target.value.trim()) {
                // Deselect all preset icons
                iconGrid.querySelectorAll('.icon-button').forEach(btn => btn.classList.remove('selected'));
                this.selectedIcon = e.target.value.trim();
            }
        });
        
        iconSection.appendChild(customLabel);
        iconSection.appendChild(customInput);
        content.appendChild(iconSection);

        this.element.appendChild(content);

        // Dialog footer
        const footer = this.createElement('div', ['dialog-footer']);

        const cancelBtn = this.createElement('button', ['dialog-button', 'dialog-button-secondary']);
        cancelBtn.innerHTML = '<i class="fas fa-times"></i> Cancel';
        this.addEventListener(cancelBtn, 'click', () => this._onCancel());

        const createBtn = this.createElement('button', ['dialog-button', 'dialog-button-primary']);
        createBtn.innerHTML = '<i class="fas fa-check"></i> Create';
        this.addEventListener(createBtn, 'click', () => this._onCreate(nameInput.value));

        footer.appendChild(cancelBtn);
        footer.appendChild(createBtn);
        this.element.appendChild(footer);

        // Add dialog directly to body (no overlay needed for selection-dialog style)
        document.body.appendChild(this.element);

        // Focus name input and select text
        nameInput.focus();
        nameInput.select();

        // Handle Enter key to create
        this.addEventListener(nameInput, 'keydown', (e) => {
            if (e.key === 'Enter') {
                this._onCreate(nameInput.value);
            } else if (e.key === 'Escape') {
                this._onCancel();
            }
        });

        // Handle Escape key globally
        this.addEventListener(document, 'keydown', (e) => {
            if (e.key === 'Escape') {
                this._onCancel();
            }
        });

        return this.element;
    }

    /**
     * Handle create button click
     * @param {string} name - View name
     * @private
     */
    async _onCreate(name) {
        const trimmedName = name?.trim();
        
        if (!trimmedName) {
            ui.notifications.warn('View name cannot be empty');
            return;
        }

        if (this.onCreate) {
            await this.onCreate(trimmedName, this.selectedIcon);
        }
        
        this.close();
    }

    /**
     * Handle cancel button click
     * @private
     */
    _onCancel() {
        if (this.onCancel) {
            this.onCancel();
        }
        this.close();
    }

    /**
     * Close and cleanup the dialog
     */
    close() {
        // Remove dialog element
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.destroy();
    }
}


import { BG3Component } from '../BG3Component.js';

/**
 * Auto Populate Configuration Dialog
 * Allows GMs to configure which item types to auto-populate on token creation
 * Items are assigned to specific hotbar grids (0, 1, 2)
 */
export class AutoPopulateConfigDialog extends BG3Component {
    /**
     * Create new auto-populate config dialog
     * @param {Object} options - Dialog options
     * @param {Array<{value: string, label: string}>} options.choices - Available item type choices
     * @param {Object} options.configuration - Current configuration {grid0: [], grid1: [], grid2: [], options: {}}
     * @param {Array<{key: string, label: string, hint: string}>} [options.toggleOptions] - Optional toggle options
     */
    constructor(options = {}) {
        super(options);
        this.title = options.title || 'Auto-Populate Configuration';
        this.choices = options.choices || [];
        // Toggle options (checkboxes at top of dialog)
        this.toggleOptions = options.toggleOptions || [];
        // Configuration maps grid index to array of item type values, plus options object
        this.configuration = options.configuration || {
            grid0: [],
            grid1: [],
            grid2: [],
            options: {}
        };
        // Ensure options object exists
        if (!this.configuration.options) {
            this.configuration.options = {};
        }
        this.resolve = null;
    }

    /**
     * Render the dialog and return a promise that resolves with configuration
     * @returns {Promise<Object|null>} Configuration object or null if cancelled
     */
    async render() {
        return new Promise((resolve) => {
            this.resolve = resolve;
            this._renderDialog();
        });
    }

    /**
     * Render the dialog HTML
     * @private
     */
    _renderDialog() {
        // Create dialog overlay
        this.element = this.createElement('div', ['bg3-dialog-overlay', 'auto-populate-config-overlay']);

        // Create dialog box
        const dialogBox = this.createElement('div', ['bg3-dialog', 'auto-populate-config-dialog']);

        // Title
        const title = this.createElement('h2', ['bg3-dialog-title']);
        title.textContent = this.title;
        dialogBox.appendChild(title);

        // Description
        const description = this.createElement('p', ['bg3-dialog-description']);
        description.innerHTML = 'Assign item types to hotbar grids for <strong>NPCs only</strong>. Each type can only be assigned to one grid.<br>' +
            '<small>Note: This auto-populates when NPC tokens are created. Player characters should use right-click → Auto-Populate Container instead.</small>';
        dialogBox.appendChild(description);

        // Content area with optional toggles and 3 grid containers
        const content = this.createElement('div', ['bg3-dialog-content', 'grids-layout']);

        // Render toggle options at top if any
        if (this.toggleOptions.length > 0) {
            const optionsSection = this._createOptionsSection();
            content.appendChild(optionsSection);
        }

        // Create 3 grid sections
        for (let i = 0; i < 3; i++) {
            const gridSection = this._createGridSection(i);
            content.appendChild(gridSection);
        }

        dialogBox.appendChild(content);

        // Buttons
        const buttons = this.createElement('div', ['bg3-dialog-buttons']);

        const confirmButton = this.createElement('button', ['bg3-button', 'bg3-button-primary']);
        confirmButton.innerHTML = '<i class="fas fa-save"></i> Save';
        confirmButton.addEventListener('click', () => this._onConfirm());

        const cancelButton = this.createElement('button', ['bg3-button']);
        cancelButton.innerHTML = '<i class="fas fa-times"></i> Cancel';
        cancelButton.addEventListener('click', () => this._onCancel());

        buttons.appendChild(cancelButton);
        buttons.appendChild(confirmButton);
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
     * Create options section with toggle checkboxes
     * @returns {HTMLElement}
     * @private
     */
    _createOptionsSection() {
        const section = this.createElement('div', ['options-section']);

        const header = this.createElement('div', ['options-section-header']);
        header.textContent = 'Options';
        section.appendChild(header);

        const optionsContainer = this.createElement('div', ['options-container']);

        for (const opt of this.toggleOptions) {
            const optionRow = this.createElement('label', ['option-row']);

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.optionKey = opt.key;
            checkbox.checked = !!this.configuration.options[opt.key];
            checkbox.addEventListener('change', () => {
                this.configuration.options[opt.key] = checkbox.checked;
            });

            const labelText = this.createElement('span', ['option-label']);
            labelText.textContent = opt.label;

            optionRow.appendChild(checkbox);
            optionRow.appendChild(labelText);

            if (opt.hint) {
                const hint = this.createElement('span', ['option-hint']);
                hint.textContent = opt.hint;
                optionRow.appendChild(hint);
            }

            optionsContainer.appendChild(optionRow);
        }

        section.appendChild(optionsContainer);
        return section;
    }

    /**
     * Create a grid section with grouped pills
     * @param {number} gridIndex - Grid index (0, 1, 2)
     * @returns {HTMLElement}
     * @private
     */
    _createGridSection(gridIndex) {
        const section = this.createElement('div', ['grid-section']);

        // Header
        const header = this.createElement('div', ['grid-section-header']);
        header.textContent = `Hotbar Grid ${gridIndex + 1}`;
        section.appendChild(header);

        const gridKey = `grid${gridIndex}`;
        const assignedTypes = this.configuration[gridKey] || [];

        // Check if choices are grouped or flat
        const isGrouped = this.choices.length > 0 && this.choices[0].group;

        if (isGrouped) {
            // Render grouped choices
            for (const group of this.choices) {
                // Group header
                const groupHeader = this.createElement('div', ['bg3-pills-group-header']);
                groupHeader.textContent = group.group;
                section.appendChild(groupHeader);

                // Pills container for this group
                const pillsContainer = this.createElement('div', ['bg3-pills-container']);

                for (const choice of group.choices) {
                    const pill = this._createPill(choice, gridIndex, assignedTypes);
                    pillsContainer.appendChild(pill);
                }

                section.appendChild(pillsContainer);
            }
        } else {
            // Render flat choices (fallback)
            const pillsContainer = this.createElement('div', ['bg3-pills-container']);

            for (const choice of this.choices) {
                const pill = this._createPill(choice, gridIndex, assignedTypes);
                pillsContainer.appendChild(pill);
            }

            section.appendChild(pillsContainer);
        }

        return section;
    }

    /**
     * Create a single pill button
     * @param {Object} choice - Choice object {value, label}
     * @param {number} gridIndex - Grid index
     * @param {Array<string>} assignedTypes - Types assigned to this grid
     * @returns {HTMLElement}
     * @private
     */
    _createPill(choice, gridIndex, assignedTypes) {
        const pill = this.createElement('button', ['bg3-pill']);
        pill.textContent = choice.label;
        pill.dataset.value = choice.value;
        pill.dataset.gridIndex = gridIndex;

        // Check if this type is assigned to this grid
        if (assignedTypes.includes(choice.value)) {
            pill.classList.add('active');
        }

        // Check if this type is assigned to a different grid
        const assignedElsewhere = this._isAssignedToOtherGrid(choice.value, gridIndex);
        if (assignedElsewhere) {
            pill.classList.add('disabled');
            pill.disabled = true;
        }

        pill.addEventListener('click', (e) => {
            e.preventDefault();
            if (!pill.disabled) {
                this._togglePill(pill, choice.value, gridIndex);
            }
        });

        return pill;
    }

    /**
     * Check if a type is assigned to a different grid
     * @param {string} value - Item type value
     * @param {number} currentGrid - Current grid index
     * @returns {boolean}
     * @private
     */
    _isAssignedToOtherGrid(value, currentGrid) {
        for (let i = 0; i < 3; i++) {
            if (i !== currentGrid) {
                const gridKey = `grid${i}`;
                if (this.configuration[gridKey].includes(value)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Toggle pill selection
     * @param {HTMLElement} pill - The pill element
     * @param {string} value - The choice value
     * @param {number} gridIndex - Grid index
     * @private
     */
    _togglePill(pill, value, gridIndex) {
        const gridKey = `grid${gridIndex}`;
        const isActive = pill.classList.contains('active');

        if (isActive) {
            // Remove from this grid
            this.configuration[gridKey] = this.configuration[gridKey].filter(v => v !== value);
            pill.classList.remove('active');

            // Enable in other grids
            this._updateAllPills(value, null);
        } else {
            // Add to this grid
            this.configuration[gridKey].push(value);
            pill.classList.add('active');

            // Disable in other grids
            this._updateAllPills(value, gridIndex);
        }
    }

    /**
     * Update all pills for a given value across all grids
     * @param {string} value - Item type value
     * @param {number|null} activeGrid - Grid index where it's active, or null if none
     * @private
     */
    _updateAllPills(value, activeGrid) {
        const allPills = this.element.querySelectorAll(`.bg3-pill[data-value="${value}"]`);

        for (const pill of allPills) {
            const pillGrid = parseInt(pill.dataset.gridIndex);

            if (activeGrid === null) {
                // Enable all
                pill.classList.remove('disabled');
                pill.disabled = false;
            } else if (pillGrid !== activeGrid) {
                // Disable in other grids
                pill.classList.add('disabled');
                pill.disabled = true;
            }
        }
    }

    /**
     * Handle confirm button
     * @private
     */
    _onConfirm() {
        this._close();
        if (this.resolve) {
            this.resolve(this.configuration);
        }
    }

    /**
     * Handle cancel button
     * @private
     */
    _onCancel() {
        this._close();
        if (this.resolve) {
            this.resolve(null);
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


/**
 * Dialog Utilities
 * Helper functions for showing standardized dialogs using Foundry's DialogV2
 */

/**
 * Show a selection dialog with checkboxes, icons, and labels
 * @param {Object} options - Dialog options
 * @param {string} options.title - Dialog title
 * @param {string} [options.description] - Description/hint text to show at top of dialog
 * @param {Array<Object>} options.items - Array of items to display
 * @param {string} options.items[].id - Unique identifier
 * @param {string} options.items[].label - Display label
 * @param {string} options.items[].img - Icon image URL (optional)
 * @param {boolean} options.items[].selected - Whether item is initially selected
 * @param {number} [options.maxSelections] - Maximum number of selections allowed (optional)
 * @returns {Promise<Array<string>|null>} Array of selected IDs, or null if cancelled
 */
export async function showSelectionDialog({ title, description, items, maxSelections }) {
    // Sort items alphabetically by label
    const sortedItems = [...items].sort((a, b) =>
        a.label.localeCompare(b.label)
    );

    // Build HTML content for the form
    const itemsHtml = sortedItems.map(item => {
        const checked = item.selected ? 'checked' : '';
        const imgSrc = item.img || 'icons/svg/item-bag.svg';
        // Escape id for use in name attribute
        const escapedId = item.id.replace(/"/g, '&quot;');

        return `
            <label class="passive-selection-row" data-item-id="${escapedId}">
                <input type="checkbox" name="selection-${escapedId}" ${checked}>
                <img src="${imgSrc}" alt="${item.label}" class="passive-selection-icon">
                <span class="passive-selection-label">${item.label}</span>
            </label>
        `;
    }).join('');

    // Build description HTML if provided
    const descriptionHtml = description ? `
        <p class="passive-selection-description">${description}</p>
    ` : '';

    // Build counter HTML if maxSelections is set
    const initialSelected = items.filter(i => i.selected).length;
    const counterHtml = maxSelections ? `
        <div class="passive-selection-counter">
            <span class="counter-current">${initialSelected}</span> / <span class="counter-max">${maxSelections}</span> selected
        </div>
    ` : '';

    const content = `
        ${descriptionHtml}
        ${counterHtml}
        <div class="passive-selection-container">
            ${itemsHtml}
        </div>
    `;

    try {
        const result = await foundry.applications.api.DialogV2.prompt({
            window: { title },
            content,
            ok: {
                label: game.i18n.localize('Save'),
                icon: 'fas fa-save',
                callback: (event, button, dialog) => {
                    // Extract checked values from the form
                    const selectedIds = [];
                    const form = button.form;

                    for (const item of sortedItems) {
                        const checkbox = form.elements[`selection-${item.id}`];
                        if (checkbox?.checked) {
                            selectedIds.push(item.id);
                        }
                    }

                    return selectedIds;
                }
            },
            render: (event, dialog) => {
                // If maxSelections is set, add interactive logic
                if (!maxSelections) return;

                const dialogEl = dialog.element;
                const checkboxes = dialogEl.querySelectorAll('input[type="checkbox"]');
                const counterEl = dialogEl.querySelector('.counter-current');

                const updateCheckboxStates = () => {
                    const checkedCount = dialogEl.querySelectorAll('input[type="checkbox"]:checked').length;

                    // Update counter
                    if (counterEl) {
                        counterEl.textContent = checkedCount;
                    }

                    // Disable unchecked checkboxes if at limit
                    checkboxes.forEach(cb => {
                        if (!cb.checked && checkedCount >= maxSelections) {
                            cb.disabled = true;
                        } else {
                            cb.disabled = false;
                        }
                    });
                };

                // Initial state
                updateCheckboxStates();

                // Add change listeners
                checkboxes.forEach(cb => {
                    cb.addEventListener('change', () => {
                        const checkedCount = dialogEl.querySelectorAll('input[type="checkbox"]:checked').length;

                        // If trying to exceed limit, revert and warn
                        if (cb.checked && checkedCount > maxSelections) {
                            cb.checked = false;
                            ui.notifications.warn(game.i18n.format('bg3-hud-core.MaxSelectionsReached', { max: maxSelections }));
                        }

                        updateCheckboxStates();
                    });
                });
            },
            rejectClose: false
            // No modal: true - allow canvas interaction
        });

        // result is null if dialog was dismissed, array if ok clicked
        return result;
    } catch {
        // Dialog was closed without action
        return null;
    }
}

/**
 * Show a pill-style selection dialog with toggleable buttons
 * @param {Object} options - Dialog options
 * @param {string} options.title - Dialog title
 * @param {string} [options.description] - Description text at top
 * @param {Array} options.choices - Choices (flat or grouped)
 *   Flat: [{value: string, label: string}, ...]
 *   Grouped: [{group: string, choices: [{value, label}, ...]}, ...]
 * @returns {Promise<Array<string>|null>} Array of selected values, or null if cancelled
 */
export async function showPillSelectionDialog({ title, description, choices }) {
    // Check if choices are grouped or flat
    const isGrouped = choices.length > 0 && choices[0].group;

    // Build pills HTML
    let pillsHtml = '';

    if (isGrouped) {
        for (const group of choices) {
            pillsHtml += `<div class="pill-group-header">${group.group}</div>`;
            pillsHtml += '<div class="pill-container">';
            for (const choice of group.choices) {
                pillsHtml += `<button type="button" class="pill-button" data-value="${choice.value}">${choice.label}</button>`;
            }
            pillsHtml += '</div>';
        }
    } else {
        pillsHtml = '<div class="pill-container">';
        for (const choice of choices) {
            pillsHtml += `<button type="button" class="pill-button" data-value="${choice.value}">${choice.label}</button>`;
        }
        pillsHtml += '</div>';
    }

    const descriptionHtml = description ? `<p class="pill-selection-description">${description}</p>` : '';

    const content = `
        ${descriptionHtml}
        <div class="pill-selection-container">
            ${pillsHtml}
        </div>
    `;

    // Track selected values
    const selectedValues = new Set();

    try {
        const result = await foundry.applications.api.DialogV2.prompt({
            window: { title },
            content,
            ok: {
                label: game.i18n.localize('Confirm'),
                icon: 'fas fa-check',
                callback: () => {
                    return Array.from(selectedValues);
                }
            },
            render: (event, dialog) => {
                const dialogEl = dialog.element;
                const pills = dialogEl.querySelectorAll('.pill-button');

                pills.forEach(pill => {
                    pill.addEventListener('click', (e) => {
                        e.preventDefault();
                        const value = pill.dataset.value;

                        if (selectedValues.has(value)) {
                            selectedValues.delete(value);
                            pill.classList.remove('active');
                        } else {
                            selectedValues.add(value);
                            pill.classList.add('active');
                        }
                    });
                });
            },
            rejectClose: false
        });

        return result;
    } catch {
        return null;
    }
}

/**
 * Show auto-populate configuration dialog with 3 grid sections
 * @param {Object} options - Dialog options
 * @param {string} [options.title] - Dialog title
 * @param {string} [options.description] - Description HTML
 * @param {Array} options.choices - Choices (flat or grouped)
 * @param {Object} options.configuration - Current config {grid0: [], grid1: [], grid2: [], options: {}}
 * @param {Array} [options.toggleOptions] - Optional toggles [{key, label, hint}]
 * @returns {Promise<Object|null>} Configuration object or null if cancelled
 */
export async function showAutoPopulateConfigDialog({
    title = 'Auto-Populate Configuration',
    description,
    choices,
    configuration,
    toggleOptions = []
}) {
    // Deep clone configuration to avoid mutation
    const config = JSON.parse(JSON.stringify(configuration || {
        grid0: [], grid1: [], grid2: [], options: {}
    }));
    if (!config.options) config.options = {};

    // Build toggle options HTML
    let togglesHtml = '';
    if (toggleOptions.length > 0) {
        togglesHtml = '<div class="config-options-section">';
        togglesHtml += '<div class="config-section-header">Options</div>';
        for (const opt of toggleOptions) {
            const checked = config.options[opt.key] ? 'checked' : '';
            togglesHtml += `
                <label class="config-option-row">
                    <input type="checkbox" data-option-key="${opt.key}" ${checked}>
                    <span class="config-option-label">${opt.label}</span>
                    ${opt.hint ? `<span class="config-option-hint">${opt.hint}</span>` : ''}
                </label>
            `;
        }
        togglesHtml += '</div>';
    }

    // Check if choices are grouped
    const isGrouped = choices.length > 0 && choices[0].group;

    // Build grid sections
    const buildGridSection = (gridIndex) => {
        const gridKey = `grid${gridIndex}`;
        const assigned = config[gridKey] || [];

        let pillsHtml = '';
        if (isGrouped) {
            for (const group of choices) {
                pillsHtml += `<div class="pill-group-header">${group.group}</div>`;
                pillsHtml += '<div class="pill-container">';
                for (const choice of group.choices) {
                    const isActive = assigned.includes(choice.value);
                    const isDisabledElsewhere = !isActive && isAssignedElsewhere(choice.value, gridIndex);
                    const activeClass = isActive ? 'active' : '';
                    const disabledClass = isDisabledElsewhere ? 'disabled' : '';
                    const disabledAttr = isDisabledElsewhere ? 'disabled' : '';
                    pillsHtml += `<button type="button" class="pill-button ${activeClass} ${disabledClass}" 
                        data-value="${choice.value}" data-grid="${gridIndex}" ${disabledAttr}>${choice.label}</button>`;
                }
                pillsHtml += '</div>';
            }
        } else {
            pillsHtml = '<div class="pill-container">';
            for (const choice of choices) {
                const isActive = assigned.includes(choice.value);
                const isDisabledElsewhere = !isActive && isAssignedElsewhere(choice.value, gridIndex);
                const activeClass = isActive ? 'active' : '';
                const disabledClass = isDisabledElsewhere ? 'disabled' : '';
                const disabledAttr = isDisabledElsewhere ? 'disabled' : '';
                pillsHtml += `<button type="button" class="pill-button ${activeClass} ${disabledClass}" 
                    data-value="${choice.value}" data-grid="${gridIndex}" ${disabledAttr}>${choice.label}</button>`;
            }
            pillsHtml += '</div>';
        }

        return `
            <div class="config-grid-section" data-grid-index="${gridIndex}">
                <div class="config-section-header">Hotbar Grid ${gridIndex + 1}</div>
                ${pillsHtml}
            </div>
        `;
    };

    // Helper to check if value is assigned to another grid
    const isAssignedElsewhere = (value, currentGrid) => {
        for (let i = 0; i < 3; i++) {
            if (i !== currentGrid && config[`grid${i}`]?.includes(value)) {
                return true;
            }
        }
        return false;
    };

    const descHtml = description ? `<p class="config-description">${description}</p>` : '';

    const content = `
        ${descHtml}
        ${togglesHtml}
        <div class="config-grids-container">
            ${buildGridSection(0)}
            ${buildGridSection(1)}
            ${buildGridSection(2)}
        </div>
    `;

    try {
        const result = await foundry.applications.api.DialogV2.prompt({
            window: { title },
            content,
            ok: {
                label: game.i18n.localize('Save'),
                icon: 'fas fa-save',
                callback: () => config
            },
            render: (event, dialog) => {
                const dialogEl = dialog.element;

                // Handle toggle option changes
                dialogEl.querySelectorAll('[data-option-key]').forEach(checkbox => {
                    checkbox.addEventListener('change', () => {
                        config.options[checkbox.dataset.optionKey] = checkbox.checked;
                    });
                });

                // Handle pill clicks
                dialogEl.querySelectorAll('.pill-button').forEach(pill => {
                    pill.addEventListener('click', (e) => {
                        e.preventDefault();
                        if (pill.disabled) return;

                        const value = pill.dataset.value;
                        const gridIndex = parseInt(pill.dataset.grid);
                        const gridKey = `grid${gridIndex}`;
                        const isActive = pill.classList.contains('active');

                        if (isActive) {
                            // Remove from grid
                            config[gridKey] = config[gridKey].filter(v => v !== value);
                            pill.classList.remove('active');
                            // Enable in other grids
                            updatePillStates(dialogEl, value, null);
                        } else {
                            // Add to grid
                            config[gridKey].push(value);
                            pill.classList.add('active');
                            // Disable in other grids
                            updatePillStates(dialogEl, value, gridIndex);
                        }
                    });
                });
            },
            rejectClose: false
        });

        return result;
    } catch {
        return null;
    }
}

/**
 * Update pill states across all grids for a value
 * @param {HTMLElement} dialogEl - Dialog element
 * @param {string} value - The value
 * @param {number|null} activeGrid - Grid where active, or null if none
 */
function updatePillStates(dialogEl, value, activeGrid) {
    dialogEl.querySelectorAll(`.pill-button[data-value="${value}"]`).forEach(pill => {
        const pillGrid = parseInt(pill.dataset.grid);
        if (activeGrid === null) {
            // Enable all
            pill.classList.remove('disabled');
            pill.disabled = false;
        } else if (pillGrid !== activeGrid) {
            // Disable in other grids
            pill.classList.add('disabled');
            pill.disabled = true;
        }
    });
}

/**
 * Preset icons for the create view dialog
 */
const PRESET_ICONS = [
    'fa-bookmark', 'fa-sword', 'fa-shield', 'fa-wand-magic', 'fa-bow-arrow',
    'fa-staff', 'fa-hammer', 'fa-axe', 'fa-dagger', 'fa-scroll',
    'fa-book', 'fa-flask', 'fa-hat-wizard', 'fa-dragon', 'fa-skull',
    'fa-fire', 'fa-bolt', 'fa-heart', 'fa-star', 'fa-moon',
    'fa-sun', 'fa-compass', 'fa-map', 'fa-dice', 'fa-crown',
    'fa-gem', 'fa-key', 'fa-lock', 'fa-unlock',
    'fa-dungeon', 'fa-mountain', 'fa-tree', 'fa-tent', 'fa-home',
    'fa-fort'
];

/**
 * Show a dialog to create or edit a hotbar view
 * @param {Object} options - Dialog options
 * @param {string} [options.title='Create New View'] - Dialog title
 * @param {string} [options.buttonLabel='Create'] - Submit button label
 * @param {string} [options.name='New View'] - Initial name value
 * @param {string} [options.icon='fa-bookmark'] - Initial icon value
 * @returns {Promise<{name: string, icon: string}|null>} Result object or null if cancelled
 */
export async function showViewDialog(options = {}) {
    const {
        title = 'Create New View',
        buttonLabel = 'Create',
        name: initialName = 'New View',
        icon: initialIcon = 'fa-bookmark'
    } = options;

    // Check if initial icon is a preset or custom
    const isPresetIcon = PRESET_ICONS.includes(initialIcon);

    // Build HTML content string (DialogV2 requires content elements to have no attributes)
    const contentHtml = `
        <div class="bg3-create-view-dialog">
            <div class="dialog-content">
                <div class="dialog-section">
                    <label class="dialog-label">View Name</label>
                    <input type="text" class="dialog-input" name="viewName" value="${initialName}" placeholder="Enter view name..." autocomplete="off">
                </div>
                
                <div class="dialog-section">
                    <label class="dialog-label">Select Icon</label>
                    <div class="icon-grid">
                        ${PRESET_ICONS.map(icon => `
                            <button type="button" class="icon-button ${icon === initialIcon ? 'selected' : ''}" data-icon="${icon}">
                                <i class="fas ${icon}"></i>
                            </button>
                        `).join('')}
                    </div>
                    
                    <label class="dialog-label dialog-label-small" style="margin-top: 12px;">Or enter custom Font Awesome class:</label>
                    <input type="text" class="dialog-input dialog-input-small" name="customIcon" value="${!isPresetIcon ? initialIcon : ''}" placeholder="e.g., fa-sparkles" autocomplete="off">
                </div>
            </div>
        </div>
    `;

    // Track selected icon in closure
    let selectedIcon = initialIcon;

    try {
        const result = await foundry.applications.api.DialogV2.prompt({
            window: { title },
            content: contentHtml,
            ok: {
                label: buttonLabel,
                icon: 'fas fa-check',
                callback: (event, button, dialog) => {
                    const dialogEl = dialog.element;
                    const nameInput = dialogEl.querySelector('input[name="viewName"]');
                    const customInput = dialogEl.querySelector('input[name="customIcon"]');
                    const selectedBtn = dialogEl.querySelector('.icon-button.selected');

                    // Determine icon: custom input takes precedence, then selected button
                    const customValue = customInput?.value?.trim();
                    if (customValue) {
                        selectedIcon = customValue;
                    } else if (selectedBtn) {
                        selectedIcon = selectedBtn.dataset.icon;
                    }

                    const name = nameInput?.value?.trim();
                    if (!name) {
                        ui.notifications.warn('View name cannot be empty');
                        throw new Error('Name required');
                    }
                    return { name, icon: selectedIcon };
                }
            },
            render: (event, dialog) => {
                const dialogEl = dialog.element;
                const nameInput = dialogEl.querySelector('input[name="viewName"]');
                const customInput = dialogEl.querySelector('input[name="customIcon"]');
                const iconButtons = dialogEl.querySelectorAll('.icon-button');

                // Handle icon clicking
                iconButtons.forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        iconButtons.forEach(b => b.classList.remove('selected'));
                        btn.classList.add('selected');
                        customInput.value = '';
                    });
                });

                // Handle custom input - deselect preset icons
                customInput?.addEventListener('input', () => {
                    if (customInput.value.trim()) {
                        iconButtons.forEach(b => b.classList.remove('selected'));
                    }
                });

                // Handle Enter key to submit
                nameInput?.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const submitBtn = dialogEl.querySelector('button[data-action="ok"]');
                        if (submitBtn) submitBtn.click();
                    }
                });

                // Focus and select name input
                nameInput?.focus();
                nameInput?.select();
            },
            rejectClose: false
        });

        return result;
    } catch (error) {
        if (error?.message !== 'Name required') {
            console.error('BG3 HUD Core | showViewDialog error:', error);
        }
        return null;
    }
}

/**
 * Show a dialog to create a new hotbar view
 * Convenience wrapper for showViewDialog with create defaults
 * @returns {Promise<{name: string, icon: string}|null>} Result object or null if cancelled
 */
export async function showCreateViewDialog() {
    return showViewDialog({
        title: 'Create New View',
        buttonLabel: 'Create',
        name: 'New View',
        icon: 'fa-bookmark'
    });
}

/**
 * Show a dialog to edit an existing hotbar view
 * Convenience wrapper for showViewDialog with edit defaults
 * @param {Object} view - Existing view data
 * @param {string} view.name - Current view name
 * @param {string} [view.icon] - Current view icon
 * @returns {Promise<{name: string, icon: string}|null>} Result object or null if cancelled
 */
export async function showEditViewDialog(view) {
    return showViewDialog({
        title: 'Edit View',
        buttonLabel: 'Save',
        name: view.name || 'View',
        icon: view.icon || 'fa-bookmark'
    });
}



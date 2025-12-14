/**
 * Portrait Data Configuration Dialog
 * ApplicationV2-based dialog for configuring portrait data badges
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PortraitDataConfigDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: 'bg3-portrait-data-config',
        classes: ['bg3-hud-dialog', 'portrait-data-config'],
        window: {
            title: 'bg3-hud-core.Settings.PortraitData.Title',
            icon: 'fas fa-id-card',
            resizable: true,
            minimizable: false
        },
        position: {
            width: 600,
            height: 'auto'
        }
    };

    static PARTS = {
        form: {
            template: 'modules/bg3-hud-core/templates/dialogs/portrait-data-config.hbs'
        }
    };

    /** @override */
    get title() {
        return game.i18n.localize('bg3-hud-core.Settings.PortraitData.Title');
    }

    /** @override */
    async _prepareContext() {
        const MODULE_ID = 'bg3-hud-core';
        const config = game.settings.get(MODULE_ID, 'portraitDataConfig') || [];
        const showPortraitData = game.settings.get(MODULE_ID, 'showPortraitData');

        // Get tracked attributes for dropdown
        const trackedAttrs = TokenDocument.implementation.getTrackedAttributes();
        trackedAttrs.bar.forEach(a => a.push('value'));
        const attrChoices = TokenDocument.implementation.getTrackedAttributeChoices(trackedAttrs);

        // Slot positions (6 slots like bg3-inspired-hotbar)
        const slots = [
            { key: '0', label: game.i18n.localize('bg3-hud-core.Settings.PortraitData.TopLeft') },
            { key: '1', label: game.i18n.localize('bg3-hud-core.Settings.PortraitData.TopRight') },
            { key: '2', label: game.i18n.localize('bg3-hud-core.Settings.PortraitData.MiddleLeft') },
            { key: '3', label: game.i18n.localize('bg3-hud-core.Settings.PortraitData.MiddleRight') },
            { key: '4', label: game.i18n.localize('bg3-hud-core.Settings.PortraitData.BottomLeft') },
            { key: '5', label: game.i18n.localize('bg3-hud-core.Settings.PortraitData.BottomRight') }
        ];

        // Merge saved config with slots
        const slotConfigs = slots.map((slot, index) => ({
            ...slot,
            path: config[index]?.path || '',
            icon: config[index]?.icon || '',
            color: config[index]?.color || '#ffffff'
        }));

        return {
            showPortraitData,
            slots: slotConfigs,
            attrChoices
        };
    }

    /** @override */
    _onRender(context, options) {
        super._onRender(context, options);

        // Handle form submission manually
        const form = this.element?.querySelector('form');
        if (form) {
            form.addEventListener('submit', event => {
                event.preventDefault();
                void this._saveSettings();
            });
        }

        // Attribute dropdown syncs to path input
        this.element.querySelectorAll('.attr-select').forEach(select => {
            select.addEventListener('change', (event) => {
                const input = event.target.closest('.slot-config').querySelector('.path-input');
                if (input && event.target.value) {
                    input.value = event.target.value;
                }
            });
        });

        // Color picker syncs to color input
        this.element.querySelectorAll('input[type="color"]').forEach(picker => {
            picker.addEventListener('input', (event) => {
                const input = event.target.closest('.form-fields').querySelector('.color-input');
                if (input) {
                    input.value = event.target.value;
                }
            });
        });

        // Icon picker buttons
        this.element.querySelectorAll('.icon-picker-btn').forEach(btn => {
            btn.addEventListener('click', (event) => {
                event.preventDefault();
                const input = event.target.closest('.form-fields').querySelector('.icon-input');
                this._openIconPicker(input);
            });
        });
    }

    /**
     * Save settings from the form
     * @private
     */
    async _saveSettings() {
        const MODULE_ID = 'bg3-hud-core';
        const form = this.element?.querySelector('form');
        if (!form) return;

        const formData = new foundry.applications.ux.FormDataExtended(form, {});
        const data = formData.object;
        const config = [];

        // Save show toggle
        await game.settings.set(MODULE_ID, 'showPortraitData', !!data.showPortraitData);

        // Parse form data into slot configs (6 slots)
        for (const key of ['0', '1', '2', '3', '4', '5']) {
            config.push({
                path: data[`path-${key}`] || '',
                icon: data[`icon-${key}`] || '',
                color: data[`color-${key}`] || '#ffffff'
            });
        }

        await game.settings.set(MODULE_ID, 'portraitDataConfig', config);
        ui.notifications.info(game.i18n.localize('bg3-hud-core.Settings.PortraitData.Saved'));
        this.close();
    }

    /**
     * Open icon picker dialog
     * @param {HTMLInputElement} targetInput
     * @private
     */
    _openIconPicker(targetInput) {
        const commonIcons = [
            'fa-shield-alt', 'fa-heart', 'fa-star', 'fa-bolt', 'fa-fire', 'fa-snowflake',
            'fa-running', 'fa-walking', 'fa-shoe-prints', 'fa-wind',
            'fa-fist-raised', 'fa-hand-sparkles', 'fa-magic', 'fa-hat-wizard',
            'fa-skull', 'fa-skull-crossbones', 'fa-cross', 'fa-ankh',
            'fa-flask', 'fa-vial', 'fa-mortar-pestle', 'fa-prescription-bottle',
            'fa-book', 'fa-book-open', 'fa-scroll', 'fa-feather-alt',
            'fa-coins', 'fa-gem', 'fa-crown', 'fa-ring',
            'fa-eye', 'fa-eye-slash', 'fa-brain', 'fa-lightbulb',
            'fa-dragon', 'fa-paw', 'fa-spider', 'fa-dove',
            'fa-moon', 'fa-sun', 'fa-cloud', 'fa-meteor',
            'fa-dice-d20', 'fa-chess-knight', 'fa-bullseye', 'fa-crosshairs'
        ];

        const content = document.createElement('div');
        content.innerHTML = `
            <p style="margin-bottom: 8px;">
                Click an icon or enter a class like <code>fas fa-bolt</code>
            </p>
            <div class="icon-grid" style="display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; max-height: 300px; overflow-y: auto;">
                ${commonIcons.map(ic => `
                    <button type="button" class="icon-btn" data-icon="fas ${ic}" 
                        style="display: flex; align-items: center; justify-content: center; height: 32px; border: 1px solid var(--color-border-light-primary); border-radius: 4px; background: var(--color-bg-option); cursor: pointer;">
                        <i class="fas ${ic}"></i>
                    </button>
                `).join('')}
            </div>
        `;

        const dialog = new foundry.applications.api.DialogV2({
            window: { title: 'Pick an Icon' },
            content: content.innerHTML,
            buttons: [
                {
                    action: 'clear',
                    label: 'Clear',
                    icon: 'fas fa-times',
                    callback: () => { targetInput.value = ''; }
                },
                {
                    action: 'close',
                    label: 'Close',
                    icon: 'fas fa-check'
                }
            ],
            default: 'close'
        });

        dialog.render(true);

        // Attach click handlers after render
        setTimeout(() => {
            dialog.element?.querySelectorAll('.icon-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    targetInput.value = btn.dataset.icon;
                    dialog.close();
                });
            });
        }, 100);
    }
}



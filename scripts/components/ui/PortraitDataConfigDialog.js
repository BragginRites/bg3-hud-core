/**
 * Portrait Data Configuration Dialog
 * BG3Dialog-based dialog with Handlebars template for body content
 */

import { BG3Dialog } from '../../api/BG3Dialog.js';

export class PortraitDataConfigDialog extends BG3Dialog {
    static DEFAULT_OPTIONS = {
        ...super.DEFAULT_OPTIONS,
        id: 'bg3-portrait-data-config',
        classes: [...(super.DEFAULT_OPTIONS.classes || []), 'portrait-data-config'],
        window: {
            ...super.DEFAULT_OPTIONS.window,
            title: 'bg3-hud-core.Settings.PortraitData.Title',
            icon: 'fas fa-id-card'
        }
    };

    /** @override */
    get title() {
        return game.i18n.localize('bg3-hud-core.Settings.PortraitData.Title');
    }

    /**
     * Prepare template context data
     * @returns {Promise<object>}
     */
    async _prepareContext() {
        const MODULE_ID = 'bg3-hud-core';

        // Check world and client override states
        const useWorldConfig = game.settings.get(MODULE_ID, 'useWorldPortraitData');
        const ignoreWorldConfig = game.settings.get(MODULE_ID, 'ignoreWorldPortraitData');
        const worldConfig = game.settings.get(MODULE_ID, 'portraitDataWorldConfig') || [];
        const clientConfig = game.settings.get(MODULE_ID, 'portraitDataConfig') || [];

        // Determine effective mode: world config only if active AND player hasn't opted out
        const effectivelyUsingWorld = useWorldConfig && !ignoreWorldConfig;

        // Use the effective config for display
        const config = effectivelyUsingWorld ? worldConfig : clientConfig;
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
            iconColor: config[index]?.iconColor || config[index]?.color || '#ffffff',
            textColor: config[index]?.textColor || config[index]?.color || '#ffffff'
        }));

        return {
            showPortraitData,
            slots: slotConfigs,
            attrChoices,
            isGM: game.user.isGM,
            useWorldConfig,
            ignoreWorldConfig,
            effectivelyUsingWorld
        };
    }

    /**
     * Build body content using Handlebars template
     * @returns {Promise<string>} HTML string
     * @override
     */
    async _buildBody() {
        const context = await this._prepareContext();
        const templatePath = 'modules/bg3-hud-core/templates/dialogs/portrait-data-config.hbs';
        return await renderTemplate(templatePath, context);
    }

    /**
     * Build footer with Save button and GM/player controls
     * @returns {Promise<string>} HTML string
     * @override
     */
    async _buildFooter() {
        const MODULE_ID = 'bg3-hud-core';
        const useWorldConfig = game.settings.get(MODULE_ID, 'useWorldPortraitData');
        const ignoreWorldConfig = game.settings.get(MODULE_ID, 'ignoreWorldPortraitData');

        let controls = '';

        if (game.user.isGM) {
            // GM controls: sync to world and enable world override
            controls = `
                <div class="gm-controls" style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <label class="checkbox" style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                        <input type="checkbox" name="useWorldConfig" ${useWorldConfig ? 'checked' : ''}>
                        <span>${game.i18n.localize('bg3-hud-core.Settings.PortraitData.WorldOverride')}</span>
                    </label>
                    <button type="button" class="sync-to-world-btn">
                        <i class="fas fa-globe"></i> ${game.i18n.localize('bg3-hud-core.Settings.PortraitData.SyncToWorld')}
                    </button>
                </div>
            `;
        } else if (useWorldConfig) {
            // Non-GM when world config is active: show opt-out toggle
            controls = `
                <div class="player-controls" style="display: flex; gap: 8px; align-items: center;">
                    <span class="hint" style="font-size: 0.9em; color: var(--color-text-dark-inactive);">
                        <i class="fas fa-info-circle"></i> ${game.i18n.localize('bg3-hud-core.Settings.PortraitData.WorldConfigActive')}
                    </span>
                    <label class="checkbox" style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                        <input type="checkbox" name="ignoreWorldConfig" ${ignoreWorldConfig ? 'checked' : ''}>
                        <span>${game.i18n.localize('bg3-hud-core.Settings.PortraitData.UseMyOwnConfig')}</span>
                    </label>
                </div>
            `;
        }

        return `
            ${controls}
            <button type="submit">
                <i class="fas fa-save"></i> ${game.i18n.localize('Save')}
            </button>
        `;
    }

    /**
     * Override _renderHTML to handle async _buildBody
     * @returns {Promise<HTMLElement>}
     * @override
     */
    async _renderHTML() {
        const body = await this._buildBody();
        const footer = await this._buildFooter();

        const container = document.createElement('form');
        container.className = 'bg3-dialog-wrapper standard-form';
        container.autocomplete = 'off';

        // Body section (scrollable)
        const bodySection = document.createElement('div');
        bodySection.className = 'bg3-dialog-body';
        bodySection.innerHTML = body;
        container.appendChild(bodySection);

        // Footer section (fixed at bottom)
        const footerSection = document.createElement('footer');
        footerSection.className = 'bg3-dialog-footer form-footer';
        footerSection.innerHTML = footer;
        container.appendChild(footerSection);

        return container;
    }

    /**
     * Hook for subclass render setup - bind event handlers
     * @param {object} context - Render context
     * @param {object} options - Render options
     * @override
     */
    _onRenderDialog(context, options) {
        // Attribute dropdown syncs to path input
        this.element.querySelectorAll('.attr-select').forEach(select => {
            select.addEventListener('change', (event) => {
                const input = event.target.closest('fieldset').querySelector('.path-input');
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

        // GM Sync to World button
        const syncBtn = this.element.querySelector('.sync-to-world-btn');
        if (syncBtn) {
            syncBtn.addEventListener('click', async (event) => {
                event.preventDefault();
                await this._syncToWorld();
            });
        }
    }

    /**
     * Handle form submission - save settings
     * @param {SubmitEvent} event - Form submit event
     * @returns {Promise<void>}
     * @override
     */
    async _onSubmit(event) {
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
                iconColor: data[`iconColor-${key}`] || '#ffffff',
                textColor: data[`textColor-${key}`] || '#ffffff'
            });
        }

        // GM: Save world override toggle if present
        if (game.user.isGM && data.useWorldConfig !== undefined) {
            await game.settings.set(MODULE_ID, 'useWorldPortraitData', !!data.useWorldConfig);

            // If world override is enabled, also save to world config
            if (data.useWorldConfig) {
                await game.settings.set(MODULE_ID, 'portraitDataWorldConfig', config);
            }
        }

        // Player: Save opt-out toggle if present
        if (data.ignoreWorldConfig !== undefined) {
            await game.settings.set(MODULE_ID, 'ignoreWorldPortraitData', !!data.ignoreWorldConfig);
        }

        // Save to client config (always, so user has their own backup)
        await game.settings.set(MODULE_ID, 'portraitDataConfig', config);
        ui.notifications.info(game.i18n.localize('bg3-hud-core.Settings.PortraitData.Saved'));
        this.close();
    }

    /**
     * Sync current form config to world settings (GM only)
     * @private
     */
    async _syncToWorld() {
        if (!game.user.isGM) return;

        const MODULE_ID = 'bg3-hud-core';
        const form = this.element?.querySelector('form');
        if (!form) return;

        const formData = new foundry.applications.ux.FormDataExtended(form, {});
        const data = formData.object;
        const config = [];

        // Parse form data into slot configs
        for (const key of ['0', '1', '2', '3', '4', '5']) {
            config.push({
                path: data[`path-${key}`] || '',
                icon: data[`icon-${key}`] || '',
                iconColor: data[`iconColor-${key}`] || '#ffffff',
                textColor: data[`textColor-${key}`] || '#ffffff'
            });
        }

        // Save to world config
        await game.settings.set(MODULE_ID, 'portraitDataWorldConfig', config);

        // Enable world override
        await game.settings.set(MODULE_ID, 'useWorldPortraitData', true);

        // Update the checkbox in the form
        const checkbox = this.element.querySelector('input[name="useWorldConfig"]');
        if (checkbox) checkbox.checked = true;

        ui.notifications.info(game.i18n.localize('bg3-hud-core.Settings.PortraitData.SyncedToWorld'));
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
                    label: 'Close'
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

import { BG3Dialog } from './BG3Dialog.js';

const { BooleanField, NumberField, StringField } = foundry.data.fields;
const { FormDataExtended } = foundry.applications.ux;

/**
 * Factory to create a simple settings submenu application.
 * @param {object} options
 * @param {string} options.moduleId - Settings namespace.
 * @param {string} options.titleKey - i18n key for window title.
 * @param {Array<{ legend: string, keys: string[], disabled?: boolean, disabledHint?: string, buttons?: Array<{id: string, label: string, icon: string, hint?: string, onClick: Function}> }>} options.sections - Section legend + setting keys + optional action buttons. A disabled section is greyed out, its controls cannot be changed, and its stored values are left alone on save.
 * @returns {typeof BG3Dialog}
 */
export function createSettingsSubmenu({ moduleId, titleKey, sections }) {
    const legendTemplate = legend => `<legend>${game.i18n.localize(legend)}</legend>`;

    const renderField = ({ key, setting, value, disabled = false, disabledHint = '' }) => {
        const label = game.i18n.localize(setting.name);
        const hint = disabled && disabledHint
            ? disabledHint
            : (setting.hint ? game.i18n.localize(setting.hint) : '');
        const disabledAttr = disabled ? ' disabled' : '';
        const tooltip = disabled && disabledHint ? ` data-tooltip="${escapeAttr(disabledHint)}"` : '';

        const renderInput = () => {
            if (setting.type === Boolean || setting.type instanceof BooleanField) {
                return `<input type="checkbox" name="${key}" ${value ? 'checked' : ''}${disabledAttr}>`;
            }

            if (setting.choices) {
                const opts = Object.entries(setting.choices)
                    .map(([val, lbl]) => {
                        const selected = val == value ? 'selected' : '';
                        return `<option value="${val}" ${selected}>${game.i18n.localize(lbl)}</option>`;
                    })
                    .join('');
                return `<select name="${key}"${disabledAttr}>${opts}</select>`;
            }

            const isNumber = setting.type === Number || setting.type instanceof NumberField;
            const type = isNumber ? 'number' : 'text';
            const range = setting.range || {};
            const attrs = isNumber
                ? ` min="${range.min ?? ''}" max="${range.max ?? ''}" step="${range.step ?? ''}"`
                : '';
            return `<input type="${type}" name="${key}" value="${value}"${attrs}${disabledAttr}>`;
        };

        return `
      <div class="form-group${disabled ? ' is-unavailable' : ''}"${tooltip}>
        <label for="${key}">${label}</label>
        ${renderInput()}
        ${hint ? `<p class="hint">${hint}</p>` : ''}
      </div>
    `;
    };

    /**
     * Render an action button within a section
     * @param {Object} button - Button configuration
     * @param {string} button.id - Unique button identifier
     * @param {string} button.name - i18n key for field name/label (left side)
     * @param {string} button.label - i18n key for button text
     * @param {string} button.icon - FontAwesome icon class
     * @param {string} [button.hint] - Optional i18n key for hint text
     * @returns {string} HTML string
     */
    const renderButton = (button, disabled = false) => {
        const name = button.name ? game.i18n.localize(button.name) : '';
        const label = game.i18n.localize(button.label);
        const hint = button.hint ? game.i18n.localize(button.hint) : '';
        return `
      <div class="form-group">
        <label>${name}</label>
        <button type="button" class="submenu-action-btn" data-action="${button.id}"${disabled ? ' disabled' : ''}>
          <i class="${button.icon}"></i> ${label}
        </button>
        ${hint ? `<p class="hint">${hint}</p>` : ''}
      </div>
    `;
    };

    const escapeAttr = (value) => String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');

    const keyIsDisabled = (section, key) => Boolean(section.disabled)
        || (section.disabledKeys ?? []).includes(key);

    const buildSection = section => {
        const unavailable = Boolean(section.disabled)
            || (section.keys.length > 0 && section.keys.every(key => keyIsDisabled(section, key)));
        const unavailableHint = section.disabledHint ? game.i18n.localize(section.disabledHint) : '';
        const sectionHint = unavailable ? unavailableHint : '';
        const fields = section.keys.map(key => {
            const setting = game.settings.settings.get(`${moduleId}.${key}`);
            if (!setting) throw new Error(`[${moduleId}] Unknown setting ${key}`);
            // Hide settings the current user cannot modify (world/restricted settings for a
            // non-GM). This keeps a player-visible menu showing only the fields they can change.
            const needsGM = setting.scope === 'world' || setting.restricted;
            if (needsGM && !game.user.isGM) return '';
            const value = game.settings.get(moduleId, key);
            const disabled = keyIsDisabled(section, key);
            return renderField({
                key,
                setting,
                value,
                disabled,
                disabledHint: disabled ? unavailableHint : ''
            });
        }).join('');

        // Render action buttons if present
        const buttons = (section.buttons || []).map(button => renderButton(button, unavailable)).join('');
        const tooltip = sectionHint ? ` data-tooltip="${escapeAttr(sectionHint)}"` : '';
        const unavailableClass = unavailable ? ' class="is-unavailable"' : '';

        return `<fieldset${unavailableClass}${tooltip}>${legendTemplate(section.legend)}${sectionHint ? `<p class="hint unavailable-hint">${sectionHint}</p>` : ''}${fields}${buttons}</fieldset>`;
    };

    return class SettingsSubmenu extends BG3Dialog {
        static DEFAULT_OPTIONS = {
            ...super.DEFAULT_OPTIONS,
            id: `${moduleId}-settings-submenu`,
            classes: [...(super.DEFAULT_OPTIONS.classes || []), 'bg3-settings-submenu'],
            window: {
                ...super.DEFAULT_OPTIONS.window,
                title: game.i18n.localize(titleKey)
            }
        };

        /**
         * Build the body content (fieldsets) for the settings form
         * @returns {string} HTML string
         * @override
         */
        _buildBody() {
            return sections.map(buildSection).join('');
        }

        /**
         * Handle render lifecycle - wire up button click handlers
         * @override
         */
        _onRender(context, options) {
            super._onRender?.(context, options);

            // Build callback map from all sections' buttons
            const callbacks = new Map();
            for (const section of sections) {
                for (const btn of section.buttons || []) {
                    if (btn.onClick) callbacks.set(btn.id, btn.onClick);
                }
            }

            // Wire up action button clicks
            this.element?.querySelectorAll('.submenu-action-btn').forEach(btn => {
                btn.addEventListener('click', (event) => {
                    event.preventDefault();
                    if (btn.disabled) return;
                    const actionId = btn.dataset.action;
                    const callback = callbacks.get(actionId);
                    if (callback) callback();
                });
            });
        }

        /**
         * Build footer with Save button
         * @returns {string} HTML string
         * @override
         */
        _buildFooter() {
            return `
        <button type="submit">
          <i class="fas fa-save"></i> ${game.i18n.localize('Save')}
        </button>
      `;
        }

        /**
         * Handle form submission - save all settings
         * @param {SubmitEvent} event - Form submit event
         * @returns {Promise<void>}
         * @override
         */
        async _onSubmit(event) {
            const form = this.element?.querySelector('form');
            if (!form) return;

            const formData = new FormDataExtended(form, {});
            const updates = foundry.utils.expandObject(formData.object);

            // IMPORTANT: unchecked checkboxes do not appear in FormData, so boolean settings would
            // otherwise never be saved as false after being enabled once.
            const disabledKeys = new Set(sections.flatMap(section => {
                if (section.disabled) return section.keys;
                return section.disabledKeys ?? [];
            }));
            const allKeys = sections.flatMap(section => section.keys);
            for (const key of allKeys) {
                if (disabledKeys.has(key)) continue;
                const setting = game.settings.settings.get(`${moduleId}.${key}`);
                if (!setting) continue;

                // Skip settings the current user cannot write. A menu visible to players may
                // still include world-scoped (GM-only) settings; attempting to save those would
                // throw. World settings require GM; `restricted` settings likewise.
                const needsGM = setting.scope === 'world' || setting.restricted;
                if (needsGM && !game.user.isGM) continue;

                let value = updates[key];

                // For boolean settings, missing from form submission means false.
                if (setting.type === Boolean || setting.type instanceof BooleanField) {
                    value = Boolean(value);
                }

                await game.settings.set(moduleId, key, value);
            }

            this.close();
        }
    };
}

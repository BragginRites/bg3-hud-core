const { BooleanField, NumberField, StringField } = foundry.data.fields;
const { FormDataExtended } = foundry.applications.ux;

/**
 * Factory to create a simple settings submenu application.
 * @param {object} options
 * @param {string} options.moduleId - Settings namespace.
 * @param {string} options.titleKey - i18n key for window title.
 * @param {Array<{ legend: string, keys: string[] }>} options.sections - Section legend + setting keys.
 * @returns {typeof foundry.applications.api.ApplicationV2}
 */
export function createSettingsSubmenu({ moduleId, titleKey, sections }) {
  const legendTemplate = legend => `<legend>${game.i18n.localize(legend)}</legend>`;

  const renderField = ({ key, setting, value }) => {
    const label = game.i18n.localize(setting.name);
    const hint = setting.hint ? game.i18n.localize(setting.hint) : '';

    const renderInput = () => {
      if (setting.type === Boolean || setting.type instanceof BooleanField) {
        return `<input type="checkbox" name="${key}" ${value ? 'checked' : ''}>`;
      }

      if (setting.choices) {
        const opts = Object.entries(setting.choices)
          .map(([val, lbl]) => {
            const selected = val == value ? 'selected' : '';
            return `<option value="${val}" ${selected}>${game.i18n.localize(lbl)}</option>`;
          })
          .join('');
        return `<select name="${key}">${opts}</select>`;
      }

      const isNumber = setting.type === Number || setting.type instanceof NumberField;
      const type = isNumber ? 'number' : 'text';
      const range = setting.range || {};
      const attrs = isNumber
        ? ` min="${range.min ?? ''}" max="${range.max ?? ''}" step="${range.step ?? ''}"`
        : '';
      return `<input type="${type}" name="${key}" value="${value}"${attrs}>`;
    };

    return `
      <div class="form-group">
        <label for="${key}">${label}</label>
        ${renderInput()}
        ${hint ? `<p class="hint">${hint}</p>` : ''}
      </div>
    `;
  };

  const buildSection = section => {
    const fields = section.keys.map(key => {
      const setting = game.settings.settings.get(`${moduleId}.${key}`);
      if (!setting) throw new Error(`[${moduleId}] Unknown setting ${key}`);
      const value = game.settings.get(moduleId, key);
      return renderField({ key, setting, value });
    }).join('');
    return `<fieldset>${legendTemplate(section.legend)}${fields}</fieldset>`;
  };

  return class SettingsSubmenu extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = {
      ...super.DEFAULT_OPTIONS,
      id: `${moduleId}-settings-submenu`,
      classes: ['bg3-settings-submenu'],
      window: {
        ...super.DEFAULT_OPTIONS.window,
        title: game.i18n.localize(titleKey),
        resizable: true
      },
      position: {
        height: 'auto'
      }
    };

    async _renderHTML() {
      const content = sections.map(buildSection).join('');
      const template = document.createElement('template');
      template.innerHTML = `
        <form class="standard-form" autocomplete="off">
          ${content}
          <footer class="form-footer">
            <button type="submit">
              <i class="fas fa-save"></i> ${game.i18n.localize('Save')}
            </button>
          </footer>
        </form>
      `;
      return template.content.firstElementChild;
    }

    async _replaceHTML(result, content) {
      const target = content ?? this.element;
      if (!target) return result;
      target.replaceChildren(result);
      return target;
    }

    _onRender(context, options) {
      const form = this.element?.querySelector('form');
      if (form) {
        form.addEventListener('submit', event => {
          event.preventDefault();
          void this._saveSettings();
        });
      }
    }

    async _saveSettings() {
      const form = this.element?.querySelector('form');
      if (!form) return;

      const formData = new FormDataExtended(form, {});
      const updates = foundry.utils.expandObject(formData.object);

      // IMPORTANT: unchecked checkboxes do not appear in FormData, so boolean settings would
      // otherwise never be saved as false after being enabled once.
      const allKeys = sections.flatMap(section => section.keys);
      for (const key of allKeys) {
        const setting = game.settings.settings.get(`${moduleId}.${key}`);
        if (!setting) continue;

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


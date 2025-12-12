import { BASE_THEME, applyTheme } from '../../utils/settings.js';

const MODULE_ID = 'bg3-hud-core';

/**
 * Theme Setting Dialog
 * Uses dynamic HTML generation like other settings submenus
 */
export class ThemeSettingDialog extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'bg3-hud-core-theme-settings',
    position: { width: 550, height: 'auto' },
    window: {
      resizable: true,
      title: 'bg3-hud-core.Settings.Theme.Title'
    }
  };

  get sections() {
    return [
      {
        legend: 'bg3-hud-core.Settings.Theme.General',
        hint: 'bg3-hud-core.Settings.Theme.GeneralHint',
        fields: [
          { id: 'bg3-border-color', label: 'bg3-hud-core.Settings.Theme.BorderColor', type: 'color', hasHover: true },
          { id: 'bg3-background-color', label: 'bg3-hud-core.Settings.Theme.BackgroundColor', type: 'color', hasHover: true },
          { id: 'bg3-text-color', label: 'bg3-hud-core.Settings.Theme.TextColor', type: 'color', hasHover: true },
          { id: 'bg3-text-secondary-color', label: 'bg3-hud-core.Settings.Theme.TextSecondaryColor', type: 'color', hasHover: false },
          { id: 'bg3-border-size', label: 'bg3-hud-core.Settings.Theme.BorderSize', type: 'number', min: 0, max: 10, unit: 'px' },
          { id: 'bg3-border-radius', label: 'bg3-hud-core.Settings.Theme.BorderRadius', type: 'number', min: 0, max: 20, unit: 'px' }
        ]
      },
      {
        legend: 'bg3-hud-core.Settings.Theme.Portrait',
        fields: [
          { id: 'bg3-portrait-size', label: 'bg3-hud-core.Settings.Theme.Size', type: 'number', min: 100, max: 300, unit: 'px' }
        ]
      },
      {
        legend: 'bg3-hud-core.Settings.Theme.Hotbar',
        fields: [
          { id: 'bg3-hotbar-sub-background-color', label: 'bg3-hud-core.Settings.Theme.SubBackgroundColor', type: 'color', hasHover: false },
          { id: 'bg3-hotbar-drag-color', label: 'bg3-hud-core.Settings.Theme.DragbarColor', type: 'color', hasHover: true },
          { id: 'bg3-hotbar-border-color', label: 'bg3-hud-core.Settings.Theme.BorderColor', type: 'color', hasHover: true },
          { id: 'bg3-hotbar-background-color', label: 'bg3-hud-core.Settings.Theme.BackgroundColor', type: 'color', hasHover: true },
          { id: 'bg3-hotbar-text-color', label: 'bg3-hud-core.Settings.Theme.TextColor', type: 'color', hasHover: true },
          { id: 'bg3-hotbar-cell-size', label: 'bg3-hud-core.Settings.Theme.CellSize', type: 'number', min: 30, max: 100, unit: 'px' },
          { id: 'bg3-hotbar-border-size', label: 'bg3-hud-core.Settings.Theme.BorderSize', type: 'number', min: 0, max: 10, unit: 'px' }
        ]
      },
      {
        legend: 'bg3-hud-core.Settings.Theme.WeaponSets',
        fields: [
          { id: 'bg3-weapon-border-color', label: 'bg3-hud-core.Settings.Theme.BorderColor', type: 'color', hasHover: true },
          { id: 'bg3-weapon-background-color', label: 'bg3-hud-core.Settings.Theme.BackgroundColor', type: 'color', hasHover: true },
          { id: 'bg3-weapon-text-color', label: 'bg3-hud-core.Settings.Theme.TextColor', type: 'color', hasHover: true },
          { id: 'bg3-weapon-cell-size', label: 'bg3-hud-core.Settings.Theme.CellSize', type: 'number', min: 30, max: 150, unit: 'px' },
          { id: 'bg3-weapon-border-size', label: 'bg3-hud-core.Settings.Theme.BorderSize', type: 'number', min: 0, max: 10, unit: 'px' }
        ]
      },
      {
        legend: 'bg3-hud-core.Settings.Theme.Filters',
        fields: [
          { id: 'bg3-filter-border-color', label: 'bg3-hud-core.Settings.Theme.BorderColor', type: 'color', hasHover: true },
          { id: 'bg3-filter-background-color', label: 'bg3-hud-core.Settings.Theme.BackgroundColor', type: 'color', hasHover: true },
          { id: 'bg3-filter-text-color', label: 'bg3-hud-core.Settings.Theme.TextColor', type: 'color', hasHover: true },
          { id: 'bg3-filter-cell-size', label: 'bg3-hud-core.Settings.Theme.CellSize', type: 'number', min: 20, max: 60, unit: 'px' },
          { id: 'bg3-filter-border-size', label: 'bg3-hud-core.Settings.Theme.BorderSize', type: 'number', min: 0, max: 10, unit: 'px' }
        ]
      },
      {
        legend: 'bg3-hud-core.Settings.Theme.Passives',
        fields: [
          { id: 'bg3-passive-border-color', label: 'bg3-hud-core.Settings.Theme.BorderColor', type: 'color', hasHover: true },
          { id: 'bg3-passive-background-color', label: 'bg3-hud-core.Settings.Theme.BackgroundColor', type: 'color', hasHover: true },
          { id: 'bg3-passive-text-color', label: 'bg3-hud-core.Settings.Theme.TextColor', type: 'color', hasHover: true },
          { id: 'bg3-passive-cell-size', label: 'bg3-hud-core.Settings.Theme.CellSize', type: 'number', min: 20, max: 60, unit: 'px' },
          { id: 'bg3-passive-border-size', label: 'bg3-hud-core.Settings.Theme.BorderSize', type: 'number', min: 0, max: 10, unit: 'px' }
        ]
      },
      {
        legend: 'bg3-hud-core.Settings.Theme.ActiveEffects',
        fields: [
          { id: 'bg3-active-border-color', label: 'bg3-hud-core.Settings.Theme.BorderColor', type: 'color', hasHover: true },
          { id: 'bg3-active-background-color', label: 'bg3-hud-core.Settings.Theme.BackgroundColor', type: 'color', hasHover: true },
          { id: 'bg3-active-text-color', label: 'bg3-hud-core.Settings.Theme.TextColor', type: 'color', hasHover: true },
          { id: 'bg3-active-cell-size', label: 'bg3-hud-core.Settings.Theme.CellSize', type: 'number', min: 20, max: 60, unit: 'px' },
          { id: 'bg3-active-border-size', label: 'bg3-hud-core.Settings.Theme.BorderSize', type: 'number', min: 0, max: 10, unit: 'px' }
        ]
      }
    ];
  }

  _renderField(field, themeData) {
    const label = game.i18n.localize(field.label);
    const cssVar = `--${field.id}`;
    const value = this._getFieldValue(cssVar, themeData, field.unit);
    const hoverVar = `--${field.id}-hover`;
    const hoverValue = field.hasHover ? this._getFieldValue(hoverVar, themeData, field.unit) : '';

    if (field.type === 'color') {
      const hoverInput = field.hasHover
        ? `<input type="color" class="css-var" name="${field.id}-hover" value="${hoverValue}">`
        : '';
      return `
        <div class="form-group">
          <label>${label}</label>
          <div class="form-fields">
            <input type="color" class="css-var" name="${field.id}" value="${value}">
            ${hoverInput}
          </div>
        </div>
      `;
    } else if (field.type === 'number') {
      const min = field.min !== undefined ? `min="${field.min}"` : '';
      const max = field.max !== undefined ? `max="${field.max}"` : '';
      const unit = field.unit || '';
      return `
        <div class="form-group">
          <label>${label}</label>
          <div class="form-fields">
            <input type="number" class="css-var" name="${field.id}" value="${value}" ${min} ${max} data-unit="${unit}">
            ${unit ? `<span class="units">${unit}</span>` : ''}
          </div>
        </div>
      `;
    }
    return '';
  }

  _getFieldValue(cssVar, themeData, unit = '') {
    const rawValue = themeData[cssVar] || '';
    if (!rawValue) return '';
    if (rawValue.includes('var(')) {
      const referencedVar = rawValue.replace('var(', '').replace(')', '');
      const referencedValue = themeData[referencedVar] || '';
      return unit ? referencedValue.replace(unit, '') : referencedValue;
    }
    return unit ? rawValue.replace(unit, '') : rawValue;
  }

  _renderSection(section, themeData) {
    const legend = game.i18n.localize(section.legend);
    const hint = section.hint ? `<p class="hint">${game.i18n.localize(section.hint)}</p>` : '';
    const fields = section.fields.map(f => this._renderField(f, themeData)).join('');
    return `<fieldset><legend>${legend}</legend>${hint}${fields}</fieldset>`;
  }

  async _renderHTML() {
    const themeCustom = game.settings.get(MODULE_ID, 'themeCustom') || {};
    const themeData = { ...BASE_THEME, ...themeCustom };
    const sections = this.sections.map(s => this._renderSection(s, themeData)).join('');

    const template = document.createElement('template');
    template.innerHTML = `
      <form class="standard-form" autocomplete="off">
        ${sections}
        <footer class="form-footer">
          <button type="button" class="reset-btn">
            <i class="fas fa-undo"></i> ${game.i18n.localize('bg3-hud-core.Settings.Theme.Reset')}
          </button>
          <button type="submit">
            <i class="fas fa-save"></i> ${game.i18n.localize('bg3-hud-core.Settings.Theme.Save')}
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
    this._bindLivePreview();
  }

  generateThemeData() {
    const form = this.element?.querySelectorAll('.css-var') ?? [];
    const cssVars = {};
    for (const field of form) {
      let value = field.type === 'checkbox' ? field.checked : field.value;
      if (value && value !== '') {
        const unit = field.dataset.unit || '';
        cssVars[`--${field.name}`] = value + unit;
      }
    }
    return cssVars;
  }

  _applyLivePreview() {
    const themeData = { ...BASE_THEME, ...this.generateThemeData() };
    const styleContent = `:root{${Object.entries(themeData).map(([k, v]) => `${k}:${v};`).join('\n')}}`;
    let previewStyle = document.head.querySelector('[data-bg3-theme-preview]');
    if (!previewStyle) {
      previewStyle = document.createElement('style');
      previewStyle.setAttribute('type', 'text/css');
      previewStyle.setAttribute('data-bg3-theme-preview', 'true');
      document.head.appendChild(previewStyle);
    }
    previewStyle.textContent = styleContent;
  }

  async close(options = {}) {
    const previewStyle = document.head.querySelector('[data-bg3-theme-preview]');
    if (previewStyle) previewStyle.remove();
    return super.close(options);
  }

  async _onSave() {
    const previewStyle = document.head.querySelector('[data-bg3-theme-preview]');
    if (previewStyle) previewStyle.remove();
    const themeData = this.generateThemeData();
    await game.settings.set(MODULE_ID, 'themeCustom', themeData);
    await applyTheme();
    this.close();
  }

  async _onReset() {
    await game.settings.set(MODULE_ID, 'themeCustom', {});
    await applyTheme();
    this.render(true);
    ui.notifications.info(game.i18n.localize('bg3-hud-core.Settings.Theme.ResetSuccess'));
  }

  _bindLivePreview() {
    const cssVarInputs = this.element?.querySelectorAll('.css-var') ?? [];
    cssVarInputs.forEach(input => {
      input.addEventListener('change', () => this._applyLivePreview());
      input.addEventListener('input', () => this._applyLivePreview());
    });
    const form = this.element?.querySelector('form');
    if (form) {
      form.addEventListener('submit', event => {
        event.preventDefault();
        void this._onSave();
      });
    }
    const resetBtn = this.element?.querySelector('.reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', event => {
        event.preventDefault();
        void this._onReset();
      });
    }
  }
}

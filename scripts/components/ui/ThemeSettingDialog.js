import { BASE_THEME, applyTheme } from '../../utils/settings.js';

const MODULE_ID = 'bg3-hud-core';

/**
 * Theme Setting Dialog
 * Simplified - only General section with Container/Tertiary backgrounds
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
        key: 'general',
        legend: 'bg3-hud-core.Settings.Theme.General',
        hint: 'bg3-hud-core.Settings.Theme.GeneralHint',
        fields: [
          { id: 'bg3-border-color', label: 'bg3-hud-core.Settings.Theme.BorderColor', type: 'color', hasHover: true },
          { id: 'bg3-background-color', label: 'bg3-hud-core.Settings.Theme.ContainerBackgroundColor', type: 'color', hasHover: true },
          { id: 'bg3-tertiary-color', label: 'bg3-hud-core.Settings.Theme.TertiaryBackgroundColor', type: 'color', hasHover: true },
          { id: 'bg3-text-color', label: 'bg3-hud-core.Settings.Theme.TextColor', type: 'color', hasHover: true },
          { id: 'bg3-text-secondary-color', label: 'bg3-hud-core.Settings.Theme.TextSecondaryColor', type: 'color', hasHover: false },
          { id: 'bg3-tooltip-component-color', label: 'bg3-hud-core.Settings.Theme.ComponentColor', type: 'color', hasHover: false },
          { id: 'bg3-container-border-size', label: 'bg3-hud-core.Settings.Theme.ContainerBorderSize', type: 'number', min: 0, max: 10, unit: 'px' },
          { id: 'bg3-container-border-radius', label: 'bg3-hud-core.Settings.Theme.ContainerBorderRadius', type: 'number', min: 0, max: 20, unit: 'px' },
          { id: 'bg3-border-size', label: 'bg3-hud-core.Settings.Theme.TertiaryBorderSize', type: 'number', min: 0, max: 10, unit: 'px' },
          { id: 'bg3-border-radius', label: 'bg3-hud-core.Settings.Theme.TertiaryBorderRadius', type: 'number', min: 0, max: 20, unit: 'px' },
          { id: 'bg3-portrait-size', label: 'bg3-hud-core.Settings.Theme.PortraitSize', type: 'number', min: 100, max: 300, unit: 'px' },
          { id: 'bg3-cell-border-width', label: 'bg3-hud-core.Settings.Theme.CellBorderWidth', type: 'number', min: 0, max: 10, unit: 'px' },
          { id: 'bg3-cell-border-radius', label: 'bg3-hud-core.Settings.Theme.CellBorderRadius', type: 'number', min: 0, max: 30, unit: 'px' },
          { id: 'bg3-grid-gap', label: 'bg3-hud-core.Settings.Theme.GridGap', type: 'number', min: 0, max: 20, unit: 'px' }
        ]
      }
    ];
  }

  _renderField(sectionKey, field, themeData) {
    const label = game.i18n.localize(field.label);
    const cssVar = `--${field.id}`;
    const value = this._getFieldValue(cssVar, themeData, field.unit);
    const hoverVar = `--${field.id}-hover`;
    const hoverValue = field.hasHover ? this._getFieldValue(hoverVar, themeData, field.unit) : '';

    if (field.type === 'color') {
      const hoverInput = field.hasHover
        ? `<input type="color" class="css-var color-picker" name="${field.id}-hover" data-section="${sectionKey}" value="${hoverValue}">`
        : '';
      return `
        <div class="form-group">
          <label>${label}</label>
          <div class="form-fields">
            <input type="color" class="css-var color-picker" name="${field.id}" data-section="${sectionKey}" value="${value}">
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
            <input type="number" class="css-var" name="${field.id}" data-section="${sectionKey}" value="${value}" ${min} ${max} data-unit="${unit}">
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

    // Check if section has color fields with hover states to add column headers
    const hasColorWithHover = section.fields.some(f => f.type === 'color' && f.hasHover);
    const columnHeaders = hasColorWithHover
      ? `<div class="color-column-headers">
          <span class="color-column-label">${game.i18n.localize('bg3-hud-core.Settings.Theme.Normal')}</span>
          <span class="color-column-label">${game.i18n.localize('bg3-hud-core.Settings.Theme.Hover')}</span>
         </div>`
      : '';
    const fields = section.fields.map(f => this._renderField(section.key, f, themeData)).join('');
    return `<fieldset data-section="${section.key}"><legend>${legend}</legend>${hint}${columnHeaders}${fields}</fieldset>`;
  }

  async _renderHTML() {
    const themeGeneral = game.settings.get(MODULE_ID, 'themeGeneral') || {};
    const baseTheme = { ...BASE_THEME, ...themeGeneral };

    const sections = this.sections.map(section => {
      return this._renderSection(section, baseTheme);
    }).join('');

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
    const inputs = this.element?.querySelectorAll('.css-var') ?? [];
    const general = {};

    for (const field of inputs) {
      const unit = field.dataset.unit || '';
      const value = field.value;
      if (!value) continue;
      const cssVar = `--${field.name}`;
      general[cssVar] = value + unit;
    }

    return { general };
  }

  _applyLivePreview() {
    const { general } = this.generateThemeData();
    const themeData = this._buildThemeConfig(general);
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
    const { general } = this.generateThemeData();
    await game.settings.set(MODULE_ID, 'themeGeneral', general);
    await applyTheme();
    this.close();
  }

  async _onReset() {
    await game.settings.set(MODULE_ID, 'themeGeneral', {});
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

  _buildThemeConfig(general) {
    const theme = { ...BASE_THEME, ...(general || {}) };

    // Keep aliases aligned with general
    theme['--bg3-background'] = theme['--bg3-background-color'];
    theme['--bg3-border'] = theme['--bg3-border-color'];
    theme['--bg3-border-width'] = theme['--bg3-border-size'];
    theme['--bg3-text'] = theme['--bg3-text-color'];
    theme['--bg3-text-muted'] = theme['--bg3-text-secondary-color'];
    theme['--bg3-background-highlight'] = theme['--bg3-background-color-hover'];

    return theme;
  }
}

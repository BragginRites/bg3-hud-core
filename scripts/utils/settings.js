import { ThemeSettingDialog } from '../components/ui/ThemeSettingDialog.js';
import { PortraitDataConfigDialog } from '../components/ui/PortraitDataConfigDialog.js';
import { createSettingsSubmenu } from '../api/SettingsSubmenu.js';

/**
 * Base theme CSS variables - defaults that can be overridden
 */
export const BASE_THEME = {
    "--bg3-border-color": "#444444",
    "--bg3-border-color-hover": "#666666",
    "--bg3-background-color": "#222222",
    "--bg3-background-color-hover": "#3a3a3a",
    "--bg3-text-color": "#dddddd",
    "--bg3-text-color-hover": "#dddddd",
    "--bg3-text-secondary-color": "#ffffff",
    "--bg3-tertiary-color": "#222222",
    "--bg3-tertiary-color-hover": "#3a3a3a",
    // Container borders (hotbar, grid, tooltip, action buttons)
    "--bg3-container-border-size": "2px",
    "--bg3-container-border-radius": "10px",
    // Tertiary borders (controls, views, filters, passives, actives)
    "--bg3-border-size": "2px",
    "--bg3-border-radius": "8px",
    "--bg3-portrait-size": "175px",

    // Grid Cell Settings
    "--bg3-cell-border-width": "2px",
    "--bg3-cell-border-radius": "var(--bg3-border-radius)",
    "--bg3-grid-gap": "2px",

    // Hotbar - Container Background
    "--bg3-hotbar-border-color": "var(--bg3-border-color)",
    "--bg3-hotbar-border-color-hover": "var(--bg3-border-color-hover)",
    "--bg3-hotbar-sub-background-color": "var(--bg3-background-color)",
    "--bg3-hotbar-background-color": "var(--bg3-background-color)",
    "--bg3-hotbar-background-color-hover": "var(--bg3-background-color-hover)",
    "--bg3-hotbar-text-color": "var(--bg3-text-color)",
    "--bg3-hotbar-text-color-hover": "var(--bg3-text-color-hover)",
    "--bg3-hotbar-cell-size": "50px",
    "--bg3-hotbar-border-size": "var(--bg3-border-size)",
    "--bg3-hotbar-drag-color": "var(--bg3-border-color)",
    "--bg3-hotbar-drag-color-hover": "var(--bg3-border-color-hover)",

    // Weapon Sets - unique, does not share variables
    "--bg3-weapon-border-color": "var(--bg3-border-color)",
    "--bg3-weapon-border-color-hover": "var(--bg3-border-color-hover)",
    "--bg3-weapon-background-color": "var(--bg3-tertiary-color)",
    "--bg3-weapon-background-color-hover": "var(--bg3-tertiary-color-hover)",
    "--bg3-weapon-text-color": "var(--bg3-text-color)",
    "--bg3-weapon-text-color-hover": "var(--bg3-text-color-hover)",
    "--bg3-weapon-cell-size": "75px",
    "--bg3-weapon-border-size": "var(--bg3-border-size)",

    // Small Containers - Tertiary Background (controls, views, filters, passives, actives)
    "--bg3-small-container-border-color": "var(--bg3-border-color)",
    "--bg3-small-container-border-color-hover": "var(--bg3-border-color-hover)",
    "--bg3-small-container-background-color": "var(--bg3-tertiary-color)",
    "--bg3-small-container-background-color-hover": "var(--bg3-tertiary-color-hover)",
    "--bg3-small-container-text-color": "var(--bg3-text-color)",
    "--bg3-small-container-text-color-hover": "var(--bg3-text-color-hover)",
    "--bg3-small-container-cell-size": "31px",
    "--bg3-small-container-border-size": "var(--bg3-border-size)",

    // Filter - references small container
    "--bg3-filter-border-color": "var(--bg3-small-container-border-color)",
    "--bg3-filter-border-color-hover": "var(--bg3-small-container-border-color-hover)",
    "--bg3-filter-background-color": "var(--bg3-small-container-background-color)",
    "--bg3-filter-background-color-hover": "var(--bg3-small-container-background-color-hover)",
    "--bg3-filter-text-color": "var(--bg3-small-container-text-color)",
    "--bg3-filter-text-color-hover": "var(--bg3-small-container-text-color-hover)",
    "--bg3-filter-cell-size": "var(--bg3-small-container-cell-size)",
    "--bg3-filter-border-size": "var(--bg3-small-container-border-size)",

    // Passive - references small container
    "--bg3-passive-border-color": "var(--bg3-small-container-border-color)",
    "--bg3-passive-border-color-hover": "var(--bg3-small-container-border-color-hover)",
    "--bg3-passive-background-color": "var(--bg3-small-container-background-color)",
    "--bg3-passive-background-color-hover": "var(--bg3-small-container-background-color-hover)",
    "--bg3-passive-text-color": "var(--bg3-small-container-text-color)",
    "--bg3-passive-text-color-hover": "var(--bg3-small-container-text-color-hover)",
    "--bg3-passive-cell-size": "var(--bg3-small-container-cell-size)",
    "--bg3-passive-border-size": "var(--bg3-small-container-border-size)",

    // Active Effects - references small container
    "--bg3-active-border-color": "var(--bg3-small-container-border-color)",
    "--bg3-active-border-color-hover": "var(--bg3-small-container-border-color-hover)",
    "--bg3-active-background-color": "var(--bg3-small-container-background-color)",
    "--bg3-active-background-color-hover": "var(--bg3-small-container-background-color-hover)",
    "--bg3-active-text-color": "var(--bg3-small-container-text-color)",
    "--bg3-active-text-color-hover": "var(--bg3-small-container-text-color-hover)",
    "--bg3-active-cell-size": "var(--bg3-small-container-cell-size)",
    "--bg3-active-border-size": "var(--bg3-small-container-border-size)",

    // Tooltip - Container Background
    "--bg3-tooltip-border-color": "var(--bg3-border-color)",
    "--bg3-tooltip-background-color": "var(--bg3-background-color)",
    "--bg3-tooltip-text-color": "var(--bg3-text-color)",
    "--bg3-tooltip-text-secondary-color": "var(--bg3-text-secondary-color)",
    "--bg3-tooltip-component-color": "#aaaaaa",
    "--bg3-tooltip-border-size": "var(--bg3-border-size)",
    "--bg3-tooltip-border-radius": "var(--bg3-border-radius)",

    // Legacy/internal aliases that many components still consume
    "--bg3-background": "var(--bg3-background-color)",
    "--bg3-border": "var(--bg3-border-color)",
    "--bg3-border-width": "var(--bg3-border-size)",
    "--bg3-text": "var(--bg3-text-color)",
    "--bg3-text-muted": "var(--bg3-text-secondary-color)",
    "--bg3-background-highlight": "var(--bg3-background-color-hover)"
};

/**
 * Register core module settings
 */
export function registerSettings() {
    const MODULE_ID = 'bg3-hud-core';

    // Combined Layout & Appearance submenu with logical sections
    const LayoutAppearanceSettingsMenu = createSettingsSubmenu({
        moduleId: MODULE_ID,
        titleKey: 'bg3-hud-core.Settings.LayoutAppearance.MenuTitle',
        sections: [
            {
                legend: 'bg3-hud-core.Settings.LayoutAppearance.OpacityLegend',
                keys: ['normalOpacity', 'fadedOpacity', 'fadeOutDelay']
            },
            {
                legend: 'bg3-hud-core.Settings.LayoutAppearance.ScalePositionLegend',
                keys: ['autoScale', 'uiScale', 'uiPosition', 'posPadding', 'posPaddingBottom']
            },
            {
                legend: 'bg3-hud-core.Settings.LayoutAppearance.ContainerDensityLegend',
                keys: ['passivesContainerIconsPerRow', 'activeEffectsContainerIconsPerRow']
            }
        ]
    });

    const FoundryUISettingsMenu = createSettingsSubmenu({
        moduleId: MODULE_ID,
        titleKey: 'bg3-hud-core.Settings.FoundryUI.MenuTitle',
        sections: [
            { legend: 'bg3-hud-core.Settings.FoundryUI.Legend', keys: ['collapseMacrobar', 'tooltipDelay'] }
        ]
    });

    const GMHotbarSettingsMenu = createSettingsSubmenu({
        moduleId: MODULE_ID,
        titleKey: 'bg3-hud-core.Settings.GMHotbar.MenuTitle',
        sections: [
            { legend: 'bg3-hud-core.Settings.GMHotbar.Legend', keys: ['enableGMHotbar'] }
        ]
    });

    const TargetSelectorSettingsMenu = createSettingsSubmenu({
        moduleId: MODULE_ID,
        titleKey: 'bg3-hud-core.Settings.TargetSelector.MenuTitle',
        sections: [
            {
                legend: 'bg3-hud-core.Settings.TargetSelector.Legend',
                keys: ['enableTargetSelector', 'skipSelectorWithValidTarget', 'enableRangeChecking', 'autoTargetSelf']
            }
        ]
    });

    // ========================================
    // Theme Settings
    // ========================================

    // Theme settings menu
    game.settings.registerMenu(MODULE_ID, 'menuTheme', {
        name: 'bg3-hud-core.Settings.Theme.Name',
        label: 'bg3-hud-core.Settings.Theme.Label',
        hint: 'bg3-hud-core.Settings.Theme.Hint',
        icon: 'fas fa-paintbrush',
        type: ThemeSettingDialog,
        restricted: false
    });

    // Theme custom CSS variables storage
    game.settings.register(MODULE_ID, 'themeCustom', {
        name: 'Theme Custom',
        hint: 'Custom theme CSS variables',
        scope: 'client',
        config: false,
        type: Object,
        default: {}
    });

    // Theme settings refactor: general overrides and per-section overrides
    game.settings.register(MODULE_ID, 'useGeneralEverywhere', {
        name: 'Use General Theme Everywhere',
        hint: 'When enabled, only the General section is used for all components.',
        scope: 'client',
        config: false,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE_ID, 'themeGeneral', {
        name: 'Theme General',
        hint: 'General theme CSS variables',
        scope: 'client',
        config: false,
        type: Object,
        default: {}
    });

    game.settings.register(MODULE_ID, 'themeSections', {
        name: 'Theme Sections',
        hint: 'Section-specific theme CSS variables',
        scope: 'client',
        config: false,
        type: Object,
        default: {}
    });

    // Layout & Appearance combined submenu
    game.settings.registerMenu(MODULE_ID, 'menuLayoutAppearance', {
        name: 'bg3-hud-core.Settings.LayoutAppearance.MenuName',
        label: 'bg3-hud-core.Settings.LayoutAppearance.MenuLabel',
        hint: 'bg3-hud-core.Settings.LayoutAppearance.MenuHint',
        icon: 'fas fa-sliders-h',
        type: LayoutAppearanceSettingsMenu,
        restricted: false
    });

    // Foundry UI submenu
    game.settings.registerMenu(MODULE_ID, 'menuFoundryUI', {
        name: 'bg3-hud-core.Settings.FoundryUI.MenuName',
        label: 'bg3-hud-core.Settings.FoundryUI.MenuLabel',
        hint: 'bg3-hud-core.Settings.FoundryUI.MenuHint',
        icon: 'fas fa-list',
        type: FoundryUISettingsMenu,
        restricted: false
    });

    // GM hotbar submenu
    game.settings.registerMenu(MODULE_ID, 'menuGMHotbar', {
        name: 'bg3-hud-core.Settings.GMHotbar.MenuName',
        label: 'bg3-hud-core.Settings.GMHotbar.MenuLabel',
        hint: 'bg3-hud-core.Settings.GMHotbar.MenuHint',
        icon: 'fas fa-list',
        type: GMHotbarSettingsMenu,
        restricted: false
    });

    // Target selector submenu
    game.settings.registerMenu(MODULE_ID, 'menuTargetSelector', {
        name: 'bg3-hud-core.Settings.TargetSelector.MenuName',
        label: 'bg3-hud-core.Settings.TargetSelector.MenuLabel',
        hint: 'bg3-hud-core.Settings.TargetSelector.MenuHint',
        icon: 'fas fa-crosshairs',
        type: TargetSelectorSettingsMenu,
        restricted: false
    });

    // ========================================
    // Opacity Settings (submenu-managed)
    // ========================================

    game.settings.register(MODULE_ID, 'normalOpacity', {
        name: 'bg3-hud-core.Settings.NormalOpacity.Name',
        hint: 'bg3-hud-core.Settings.NormalOpacity.Hint',
        scope: 'client',
        config: false,
        type: Number,
        range: {
            min: 0.1,
            max: 1.0,
            step: 0.1
        },
        default: 1.0,
        onChange: value => {
            if (ui.BG3HUD_APP?.element) {
                const container = ui.BG3HUD_APP.element.querySelector('#bg3-hotbar-container');
                if (container) container.style.setProperty('--bg3-normal-opacity', value);
            }
        }
    });

    game.settings.register(MODULE_ID, 'fadedOpacity', {
        name: 'bg3-hud-core.Settings.FadedOpacity.Name',
        hint: 'bg3-hud-core.Settings.FadedOpacity.Hint',
        scope: 'client',
        config: false,
        type: Number,
        range: {
            min: 0.0,
            max: 1.0,
            step: 0.1
        },
        default: 1.0,
        onChange: value => {
            if (ui.BG3HUD_APP?.element) {
                const container = ui.BG3HUD_APP.element.querySelector('#bg3-hotbar-container');
                if (container) {
                    if (value === 1) {
                        container.style.setProperty('--bg3-faded-delay', '0s');
                        container.style.removeProperty('--bg3-faded-opacity');
                    } else {
                        const fadeDelay = game.settings.get(MODULE_ID, 'fadeOutDelay');
                        container.style.setProperty('--bg3-faded-delay', `${fadeDelay}s`);
                        container.style.setProperty('--bg3-faded-opacity', value);
                    }
                }
            }
        }
    });

    game.settings.register(MODULE_ID, 'fadeOutDelay', {
        name: 'bg3-hud-core.Settings.FadeOutDelay.Name',
        hint: 'bg3-hud-core.Settings.FadeOutDelay.Hint',
        scope: 'client',
        config: false,
        type: Number,
        range: {
            min: 1,
            max: 30,
            step: 1
        },
        default: 5,
        onChange: value => {
            if (ui.BG3HUD_APP?.element) {
                const container = ui.BG3HUD_APP.element.querySelector('#bg3-hotbar-container');
                const fadedOpacity = game.settings.get(MODULE_ID, 'fadedOpacity');
                if (container && fadedOpacity !== 1) {
                    container.style.setProperty('--bg3-faded-delay', `${value}s`);
                }
            }
        }
    });

    // ========================================
    // Scale & Position Settings (submenu-managed)
    // ========================================

    game.settings.register(MODULE_ID, 'autoScale', {
        name: 'bg3-hud-core.Settings.AutoScale.Name',
        hint: 'bg3-hud-core.Settings.AutoScale.Hint',
        scope: 'client',
        config: false,
        type: Boolean,
        default: true,
        onChange: () => {
            if (ui.BG3HUD_APP?.element) {
                const container = ui.BG3HUD_APP.element.querySelector('#bg3-hotbar-container');
                if (container) container.style.setProperty('--bg3-scale-ui', updateUIScale());
            }
        }
    });

    game.settings.register(MODULE_ID, 'uiScale', {
        name: 'bg3-hud-core.Settings.UIScale.Name',
        hint: 'bg3-hud-core.Settings.UIScale.Hint',
        scope: 'client',
        config: false,
        type: Number,
        range: {
            min: 50,
            max: 300,
            step: 5
        },
        default: 100,
        onChange: () => {
            if (ui.BG3HUD_APP?.element) {
                const container = ui.BG3HUD_APP.element.querySelector('#bg3-hotbar-container');
                if (container) container.style.setProperty('--bg3-scale-ui', updateUIScale());
            }
        }
    });

    game.settings.register(MODULE_ID, 'uiPosition', {
        name: 'bg3-hud-core.Settings.UIPosition.Name',
        hint: 'bg3-hud-core.Settings.UIPosition.Hint',
        scope: 'client',
        config: false,
        type: String,
        choices: {
            'center': 'bg3-hud-core.Settings.UIPosition.Center',
            'left': 'bg3-hud-core.Settings.UIPosition.Left',
            'right': 'bg3-hud-core.Settings.UIPosition.Right'
        },
        default: 'center',
        onChange: value => {
            if (ui.BG3HUD_APP?.element) {
                const container = ui.BG3HUD_APP.element.querySelector('#bg3-hotbar-container');
                if (container) container.dataset.position = value;
            }
        }
    });

    game.settings.register(MODULE_ID, 'posPadding', {
        name: 'bg3-hud-core.Settings.PosPadding.Name',
        hint: 'bg3-hud-core.Settings.PosPadding.Hint',
        scope: 'client',
        config: false,
        type: Number,
        default: 0,
        onChange: value => {
            if (ui.BG3HUD_APP?.element) {
                const container = ui.BG3HUD_APP.element.querySelector('#bg3-hotbar-container');
                if (container) container.style.setProperty('--position-padding', `${value}px`);
            }
        }
    });

    game.settings.register(MODULE_ID, 'posPaddingBottom', {
        name: 'bg3-hud-core.Settings.PosPaddingBottom.Name',
        hint: 'bg3-hud-core.Settings.PosPaddingBottom.Hint',
        scope: 'client',
        config: false,
        type: Number,
        default: 10,
        onChange: value => {
            if (ui.BG3HUD_APP?.element) {
                const container = ui.BG3HUD_APP.element.querySelector('#bg3-hotbar-container');
                if (container) container.style.setProperty('--position-bottom', `${value}px`);
            }
        }
    });

    // ========================================
    // Foundry UI Settings (submenu-managed)
    // ========================================

    // Macrobar visibility setting
    game.settings.register(MODULE_ID, 'collapseMacrobar', {
        name: 'Hide Foundry Macro Bar',
        hint: 'Control when the default Foundry macro bar is hidden',
        scope: 'client',
        config: false,
        type: String,
        choices: {
            'always': 'Always Hide',
            'never': 'Never Hide',
            'full': 'Fully Hidden (display:none)'
        },
        default: 'always',
        onChange: () => {
            applyMacrobarCollapseSetting();
        }
    });

    // Tooltip delay setting
    game.settings.register(MODULE_ID, 'tooltipDelay', {
        name: 'Tooltip Delay (ms)',
        hint: 'Delay before tooltips appear on hover (in milliseconds)',
        scope: 'client',
        config: false,
        type: Number,
        range: {
            min: 0,
            max: 2000,
            step: 100
        },
        default: 500,
        onChange: (value) => {
            // Update tooltip manager delay if it exists
            const tooltipManager = ui.BG3HOTBAR?.tooltipManager;
            if (tooltipManager) {
                tooltipManager.delay = value;
            }
        }
    });

    // GM Hotbar settings (submenu-managed)
    game.settings.register(MODULE_ID, 'enableGMHotbar', {
        name: 'Enable GM Hotbar',
        hint: 'Show a special hotbar for GMs when no token or multiple tokens are selected',
        scope: 'world',
        config: false,
        type: Boolean,
        default: false,
        onChange: () => {
            // Refresh hotbar if it exists and no token is selected
            if (ui.BG3HUD_APP && !ui.BG3HUD_APP.currentToken) {
                ui.BG3HUD_APP.refresh();
            }
        }
    });

    game.settings.register(MODULE_ID, 'gmHotbarData', {
        name: 'GM Hotbar Data',
        hint: 'Stores GM hotbar layout and items (restricted to GM)',
        restricted: true,
        scope: 'world',
        config: false,
        type: Object,
        default: null
    });

    // ========================================
    // Portrait Data Settings
    // ========================================

    game.settings.registerMenu(MODULE_ID, 'menuPortraitData', {
        name: 'bg3-hud-core.Settings.PortraitData.MenuName',
        label: 'bg3-hud-core.Settings.PortraitData.MenuLabel',
        hint: 'bg3-hud-core.Settings.PortraitData.MenuHint',
        icon: 'fas fa-id-card',
        type: PortraitDataConfigDialog,
        restricted: false
    });

    game.settings.register(MODULE_ID, 'showPortraitData', {
        name: 'bg3-hud-core.Settings.PortraitData.ShowName',
        hint: 'bg3-hud-core.Settings.PortraitData.ShowHint',
        scope: 'client',
        config: false,
        type: Boolean,
        default: false,
        onChange: () => {
            // Refresh portrait if it exists
            ui.BG3HOTBAR?.components?.portrait?.render?.();
        }
    });

    game.settings.register(MODULE_ID, 'portraitDataConfig', {
        name: 'Portrait Data Configuration',
        hint: 'Configuration for portrait data badges',
        scope: 'client',
        config: false,
        type: Array,
        default: [],
        onChange: () => {
            // Refresh portrait if it exists
            ui.BG3HOTBAR?.components?.portrait?.render?.();
        }
    });

    // ========================================
    // Lock Settings
    // ========================================

    // Lock settings object (individual lock toggles)
    game.settings.register(MODULE_ID, 'lockSettings', {
        name: 'Lock Settings',
        hint: 'Individual lock toggles for different features',
        scope: 'client',
        config: false,
        type: Object,
        default: {
            deselect: false,
            opacity: false,
            dragDrop: false
        }
    });

    // Master lock enabled state
    game.settings.register(MODULE_ID, 'masterLockEnabled', {
        name: 'Master Lock State',
        hint: 'Whether the master lock is enabled',
        scope: 'client',
        config: false,
        type: Boolean,
        default: false
    });

    // ========================================
    // Target Selector Settings
    // ========================================

    game.settings.register(MODULE_ID, 'enableTargetSelector', {
        name: 'bg3-hud-core.Settings.TargetSelector.EnableName',
        hint: 'bg3-hud-core.Settings.TargetSelector.EnableHint',
        scope: 'client',
        config: false,
        type: Boolean,
        default: false
    });

    game.settings.register(MODULE_ID, 'skipSelectorWithValidTarget', {
        name: 'bg3-hud-core.Settings.TargetSelector.SkipName',
        hint: 'bg3-hud-core.Settings.TargetSelector.SkipHint',
        scope: 'client',
        config: false,
        type: Boolean,
        default: false
    });

    game.settings.register(MODULE_ID, 'enableRangeChecking', {
        name: 'bg3-hud-core.Settings.TargetSelector.RangeName',
        hint: 'bg3-hud-core.Settings.TargetSelector.RangeHint',
        scope: 'client',
        config: false,
        type: Boolean,
        default: false
    });

    game.settings.register(MODULE_ID, 'autoTargetSelf', {
        name: 'bg3-hud-core.Settings.TargetSelector.AutoSelfName',
        hint: 'bg3-hud-core.Settings.TargetSelector.AutoSelfHint',
        scope: 'client',
        config: false,
        type: Boolean,
        default: false
    });

    // Passives container icons per row setting
    game.settings.register(MODULE_ID, 'passivesContainerIconsPerRow', {
        name: 'bg3-hud-core.Settings.PassivesContainerIconsPerRow.Name',
        hint: 'bg3-hud-core.Settings.PassivesContainerIconsPerRow.Hint',
        scope: 'client',
        config: false,
        type: Number,
        range: {
            min: 1,
            max: 20,
            step: 1
        },
        default: 8,
        onChange: () => {
            applyContainerRowSettings();
        }
    });

    // Active effects container icons per row setting
    game.settings.register(MODULE_ID, 'activeEffectsContainerIconsPerRow', {
        name: 'bg3-hud-core.Settings.ActiveEffectsContainerIconsPerRow.Name',
        hint: 'bg3-hud-core.Settings.ActiveEffectsContainerIconsPerRow.Hint',
        scope: 'client',
        config: false,
        type: Number,
        range: {
            min: 1,
            max: 20,
            step: 1
        },
        default: 8,
        onChange: () => {
            applyContainerRowSettings();
        }
    });

    // Note: Display settings (showItemNames, showItemUses) are now registered
    // by system adapters, as they are system-specific in their implementation
}

/**
 * Apply macrobar collapse setting
 * Called by BG3Hotbar when ready and when setting changes
 */
export function applyMacrobarCollapseSetting() {
    // Wait for UI to be ready
    if (!ui.hotbar) {
        Hooks.once('renderHotbar', () => applyMacrobarCollapseSetting());
        return;
    }

    const collapseMacrobar = game.settings.get('bg3-hud-core', 'collapseMacrobar');
    const hotbarElement = ui.hotbar.element;
    const hotbarDiv = document.querySelector("#hotbar");

    // Reset display if not 'full'
    if (collapseMacrobar !== 'full' && hotbarDiv?.style.display !== 'flex') {
        hotbarDiv.style.display = 'flex';
    }

    // Apply setting
    if (collapseMacrobar === 'always') {
        // Foundry V13+ uses classes, older uses collapse/expand methods
        if (hotbarElement?.classList) {
            hotbarElement.classList.add('hidden');
        } else if (ui.hotbar.collapse) {
            ui.hotbar.collapse();
        }
    } else if (collapseMacrobar === 'never') {
        if (hotbarElement?.classList) {
            hotbarElement.classList.remove('hidden');
        } else if (ui.hotbar.expand) {
            ui.hotbar.expand();
        }
    } else if (collapseMacrobar === 'full') {
        if (hotbarDiv && hotbarDiv.style.display !== 'none') {
            hotbarDiv.style.display = 'none';
        }
    }
}

/**
 * Apply container row settings
 * Sets CSS custom properties for max-width of passives and active effects containers
 * based on user settings for icons per row
 */
export function applyContainerRowSettings() {
    const MODULE_ID = 'bg3-hud-core';

    // Get settings values (default to 8 if not set)
    const passivesIconsPerRow = game.settings.get(MODULE_ID, 'passivesContainerIconsPerRow') ?? 8;
    const activesIconsPerRow = game.settings.get(MODULE_ID, 'activeEffectsContainerIconsPerRow') ?? 8;

    // Get cell sizes from CSS variables (with fallbacks)
    const passivesCellSize = getComputedStyle(document.documentElement)
        .getPropertyValue('--bg3-passive-cell-size')
        .trim() || '40px';
    const activesCellSize = getComputedStyle(document.documentElement)
        .getPropertyValue('--bg3-active-cell-size')
        .trim() || '40px';

    // Extract numeric value from cell size (e.g., "40px" -> 40)
    const passivesCellSizeNum = parseFloat(passivesCellSize) || 40;
    const activesCellSizeNum = parseFloat(activesCellSize) || 40;

    // Calculate max-width: cell-size * icons-per-row
    // Gap is handled by flexbox gap property, so we don't need to add it here
    const passivesMaxWidth = `${passivesCellSizeNum * passivesIconsPerRow}px`;
    const activesMaxWidth = `${activesCellSizeNum * activesIconsPerRow}px`;

    // Set CSS custom properties on :root
    document.documentElement.style.setProperty('--bg3-passives-container-max-width', passivesMaxWidth);
    document.documentElement.style.setProperty('--bg3-actives-container-max-width', activesMaxWidth);
}

/**
 * Calculate UI scale based on settings
 * @returns {number} The scale factor to apply
 */
export function updateUIScale() {
    const MODULE_ID = 'bg3-hud-core';
    let scale = 1;
    if (game.settings.get(MODULE_ID, 'autoScale')) {
        scale = window.innerHeight / 1500;
    } else {
        scale = game.settings.get(MODULE_ID, 'uiScale') / 100;
    }
    return scale;
}

/**
 * Apply theme CSS variables to the document
 * Merges base theme with custom theme settings
 */
export async function applyTheme() {
    const MODULE_ID = 'bg3-hud-core';
    const currentTheme = document.head.querySelector('[data-bg3-theme]');
    const useGeneralEverywhere = game.settings.get(MODULE_ID, 'useGeneralEverywhere') ?? true;

    // Pull new structured settings
    let themeGeneral = game.settings.get(MODULE_ID, 'themeGeneral') || {};
    const themeSections = game.settings.get(MODULE_ID, 'themeSections') || {};

    // Migration: if legacy themeCustom exists and new general is empty, migrate it
    const legacyTheme = game.settings.get(MODULE_ID, 'themeCustom') || {};
    if (!Object.keys(themeGeneral).length && Object.keys(legacyTheme).length) {
        themeGeneral = { ...legacyTheme };
        await game.settings.set(MODULE_ID, 'themeGeneral', themeGeneral);
        await game.settings.set(MODULE_ID, 'themeCustom', {});
    }

    const themeConfig = { ...BASE_THEME, ...themeGeneral };

    if (!useGeneralEverywhere && themeSections && typeof themeSections === 'object') {
        for (const sectionVars of Object.values(themeSections)) {
            Object.assign(themeConfig, sectionVars || {});
        }
    }

    // Keep legacy aliases in sync with the general values
    themeConfig['--bg3-background'] = themeConfig['--bg3-background-color'];
    themeConfig['--bg3-border'] = themeConfig['--bg3-border-color'];
    themeConfig['--bg3-border-width'] = themeConfig['--bg3-border-size'];
    themeConfig['--bg3-text'] = themeConfig['--bg3-text-color'];
    themeConfig['--bg3-text-muted'] = themeConfig['--bg3-text-secondary-color'];
    themeConfig['--bg3-background-highlight'] = themeConfig['--bg3-background-color-hover'];

    const styleContent = `:root{${Object.entries(themeConfig).map(([k, v]) => `${k}:${v};`).join('\n')}}`;
    if (currentTheme) {
        currentTheme.innerHTML = styleContent;
    } else {
        const style = document.createElement('style');
        style.setAttribute('type', 'text/css');
        style.setAttribute('data-bg3-theme', 'custom');
        style.textContent = styleContent;
        document.head.appendChild(style);
    }
}

/**
 * Apply all appearance settings (opacity, scale, position)
 * Called after render to apply current settings to the UI
 */
export function applyAppearanceSettings() {
    const MODULE_ID = 'bg3-hud-core';

    if (!ui.BG3HUD_APP?.element) return;

    const container = ui.BG3HUD_APP.element.querySelector('#bg3-hotbar-container');
    if (!container) return;

    // Apply opacity settings
    const normalOpacity = game.settings.get(MODULE_ID, 'normalOpacity');
    const fadedOpacity = game.settings.get(MODULE_ID, 'fadedOpacity');
    const fadeOutDelay = game.settings.get(MODULE_ID, 'fadeOutDelay');

    container.style.setProperty('--bg3-normal-opacity', normalOpacity);
    if (fadedOpacity !== 1) {
        container.style.setProperty('--bg3-faded-opacity', fadedOpacity);
        container.style.setProperty('--bg3-faded-delay', `${fadeOutDelay}s`);
    }

    // Apply scale
    container.style.setProperty('--bg3-scale-ui', updateUIScale());

    // Apply position
    const position = game.settings.get(MODULE_ID, 'uiPosition');
    container.dataset.position = position;

    // Apply padding
    const posPadding = game.settings.get(MODULE_ID, 'posPadding');
    const posPaddingBottom = game.settings.get(MODULE_ID, 'posPaddingBottom');
    container.style.setProperty('--position-padding', `${posPadding}px`);
    container.style.setProperty('--position-bottom', `${posPaddingBottom}px`);
}

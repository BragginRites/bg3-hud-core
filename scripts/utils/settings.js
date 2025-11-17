/**
 * Register core module settings
 */
export function registerSettings() {
    const MODULE_ID = 'bg3-hud-core';

    // Macrobar visibility setting
    game.settings.register(MODULE_ID, 'collapseMacrobar', {
        name: 'Hide Foundry Macro Bar',
        hint: 'Control when the default Foundry macro bar is hidden',
        scope: 'client',
        config: true,
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
        config: true,
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

    // GM Hotbar settings
    game.settings.register(MODULE_ID, 'enableGMHotbar', {
        name: 'Enable GM Hotbar',
        hint: 'Show a special hotbar for GMs when no token or multiple tokens are selected',
        scope: 'world',
        config: true,
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

    // GM Hotbar lock setting (keep GM hotbar visible when token selected)
    game.settings.register(MODULE_ID, 'gmHotbarLock', {
        name: 'Keep GM Hotbar',
        hint: 'Keep GM hotbar visible even when a token is selected',
        scope: 'world',
        config: false,
        type: Boolean,
        default: false
    });

    // Passives container icons per row setting
    game.settings.register(MODULE_ID, 'passivesContainerIconsPerRow', {
        name: 'Passives Container Icons Per Row',
        hint: 'Number of icons per row in the passives container before wrapping to the next row',
        scope: 'client',
        config: true,
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
        name: 'Active Effects Container Icons Per Row',
        hint: 'Number of icons per row in the active effects container before wrapping to the next row',
        scope: 'client',
        config: true,
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

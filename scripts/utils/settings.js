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

    // Tooltip debug setting
    game.settings.register(MODULE_ID, 'debugTooltips', {
        name: 'Debug Tooltips',
        hint: 'Enable debug logging for tooltip system (check browser console)',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false
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

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
            if (ui.BG3HOTBAR) {
                ui.BG3HOTBAR.applyMacrobarCollapseSetting();
            }
        }
    });

    // Show item names setting
    game.settings.register(MODULE_ID, 'showItemNames', {
        name: 'Show Item Names',
        hint: 'Display item names below each hotbar item',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: () => {
            if (ui.BG3HOTBAR) {
                ui.BG3HOTBAR.updateDisplaySettings();
            }
        }
    });

    // Show item uses & quantity setting
    game.settings.register(MODULE_ID, 'showItemUses', {
        name: 'Show Item Uses & Quantity',
        hint: 'Display remaining uses in the top-right corner and quantity in the top-left corner',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true,
        onChange: () => {
            if (ui.BG3HOTBAR) {
                ui.BG3HOTBAR.updateDisplaySettings();
            }
        }
    });
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

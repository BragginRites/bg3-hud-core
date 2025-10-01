import { BG3Hotbar } from './BG3Hotbar.js';
import { BG3HUD_REGISTRY, BG3HUD_API } from './utils/registry.js';
import { registerSettings, applyMacrobarCollapseSetting } from './utils/settings.js';

/**
 * BG3 HUD Core Module
 * System-agnostic UI framework for BG3-style combat HUD
 * Requires a system adapter module to provide functionality
 */

const MODULE_ID = 'bg3-hud-core';

// ========================================
// Module Initialization
// ========================================

Hooks.once('init', () => {
    console.log('BG3 HUD Core | Registering settings');
    registerSettings();
});

Hooks.once('ready', async () => {
    console.log('BG3 HUD Core | Initializing');

    // Make registry and API globally accessible
    ui.BG3HOTBAR = ui.BG3HOTBAR || {};
    ui.BG3HOTBAR.registry = BG3HUD_REGISTRY;
    ui.BG3HOTBAR.api = BG3HUD_API;

    // Call hook to allow system adapters to register
    console.log('BG3 HUD Core | Calling bg3HudReady hook for system adapters');
    await new Promise(resolve => {
        // Listen for adapter completion signal
        Hooks.once('bg3HudRegistrationComplete', resolve);
        
        // Trigger the hook for adapters
        Hooks.callAll('bg3HudReady', BG3HUD_API);
        
        // Timeout fallback if no adapter responds
        setTimeout(resolve, 100);
    });

    // Create and render the HUD
    console.log('BG3 HUD Core | Creating HUD application');
    ui.BG3HUD_APP = new BG3Hotbar();
    ui.BG3HUD_APP.render(true);

    // Apply macrobar collapse setting
    applyMacrobarCollapseSetting();

    console.log('BG3 HUD Core | Initialization complete');
});

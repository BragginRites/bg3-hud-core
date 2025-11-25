import { BG3Hotbar } from './BG3Hotbar.js';
import { BG3HUD_REGISTRY, BG3HUD_API } from './utils/registry.js';
import { registerSettings, applyMacrobarCollapseSetting, applyContainerRowSettings } from './utils/settings.js';
import { TooltipManager } from './managers/TooltipManager.js';

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

    // Initialize TooltipManager
    const tooltipDelay = game.settings.get(MODULE_ID, 'tooltipDelay') || 500;
    const tooltipManager = new TooltipManager({ delay: tooltipDelay });
    BG3HUD_API.setTooltipManager(tooltipManager);

    // Make registry and API globally accessible
    ui.BG3HOTBAR = ui.BG3HOTBAR || {};
    ui.BG3HOTBAR.registry = BG3HUD_REGISTRY;
    ui.BG3HOTBAR.api = BG3HUD_API;
    ui.BG3HOTBAR.tooltipManager = tooltipManager;

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

    // Apply container row settings
    applyContainerRowSettings();

    console.log('BG3 HUD Core | Initialization complete');
});

// ========================================
// Token Creation Hook
// ========================================

Hooks.on('createToken', async (tokenDocument, options, userId) => {
    // Only run for GMs or if the user created the token
    if (!game.user.isGM && game.userId !== userId) return;

    // Get actor directly from tokenDocument (more reliable than tokenDocument.object.actor
    // since the canvas token object may not exist yet during async token creation)
    const actor = tokenDocument.actor;
    if (!actor) return;

    // Only auto-populate for NPCs (non-character actors)
    // Player characters should use right-click to auto-populate containers manually
    if (actor.type === 'character' || actor.hasPlayerOwner) {
        return;
    }

    // Check if adapter provides auto-populate on token creation
    const adapter = BG3HUD_REGISTRY.activeAdapter;
    if (!adapter || !adapter.autoPopulate) return;

    // Check if feature is enabled
    const enabled = game.settings.get(adapter.MODULE_ID, 'autoPopulateEnabled');
    if (!enabled) return;

    const configuration = game.settings.get(adapter.MODULE_ID, 'autoPopulateConfiguration');
    if (!configuration) return;

    // Check if any grid has types configured
    const hasTypes = configuration.grid0?.length > 0 ||
                     configuration.grid1?.length > 0 ||
                     configuration.grid2?.length > 0;
    
    if (!hasTypes) return;

    try {
        // Use a temporary persistence manager for the token
        const { PersistenceManager } = await import('./managers/PersistenceManager.js');
        const tempPersistence = new PersistenceManager();
        
        // Pass actor directly instead of token object (which may not exist yet)
        await adapter.autoPopulate.populateOnTokenCreation(actor, configuration, tempPersistence);

        // Also auto-populate passives if adapter supports it
        if (typeof adapter.autoPopulatePassives === 'function') {
            await adapter.autoPopulatePassives(actor, tokenDocument);
        }
    } catch (error) {
        console.error('BG3 HUD Core | Error in auto-populate on token creation:', error);
    }
});
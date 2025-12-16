import { BG3Hotbar } from './BG3Hotbar.js';
import { BG3HUD_REGISTRY, BG3HUD_API } from './utils/registry.js';
import { registerSettings, applyMacrobarCollapseSetting, applyContainerRowSettings, applyTheme } from './utils/settings.js';
import { TooltipManager } from './managers/TooltipManager.js';
import { TargetSelectorManager } from './managers/TargetSelectorManager.js';

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

    // Apply theme CSS variables early
    await applyTheme();

    // Initialize TooltipManager
    const tooltipDelay = game.settings.get(MODULE_ID, 'tooltipDelay') || 500;
    const tooltipManager = new TooltipManager({ delay: tooltipDelay });
    BG3HUD_API.setTooltipManager(tooltipManager);

    // Initialize TargetSelectorManager (will be connected to adapter later)
    const targetSelectorManager = new TargetSelectorManager();
    BG3HUD_API.setTargetSelectorManager(targetSelectorManager);

    // Make registry and API globally accessible
    ui.BG3HOTBAR = ui.BG3HOTBAR || {};
    ui.BG3HOTBAR.registry = BG3HUD_REGISTRY;
    ui.BG3HOTBAR.api = BG3HUD_API;
    ui.BG3HOTBAR.tooltipManager = tooltipManager;
    ui.BG3HOTBAR.targetSelectorManager = targetSelectorManager;

    // Check if a compatible adapter module is active
    const hasCompatibleAdapter = [...game.modules.values()].some(m =>
        m.active && m.id.startsWith('bg3-hud-') && m.id !== 'bg3-hud-core'
    );

    // Trigger hook for adapters to register
    console.log('BG3 HUD Core | Calling bg3HudReady hook for system adapters');
    Hooks.callAll('bg3HudReady', BG3HUD_API);

    // Only wait for adapter registration if a compatible adapter module is active
    if (hasCompatibleAdapter) {
        await new Promise(resolve => {
            Hooks.once('bg3HudRegistrationComplete', resolve);
            // Longer timeout in case adapter has async initialization
            setTimeout(resolve, 2000);
        });
    }

    // Create and render the HUD
    console.log('BG3 HUD Core | Creating HUD application');
    ui.BG3HUD_APP = new BG3Hotbar();
    ui.BG3HUD_APP.render(true);

    // Apply macrobar collapse setting
    applyMacrobarCollapseSetting();

    // Apply container row settings
    applyContainerRowSettings();

    console.log('BG3 HUD Core | Initialization complete');
    console.log('BG3 HUD Core | Initialization complete');
});

// ========================================
// Scene Controls Hook
// ========================================

Hooks.on('getSceneControlButtons', (controls) => {
    // V13 API: controls is a Record<string, SceneControl>, accessed by key
    const tokenTools = controls.tokens;
    if (!tokenTools) return;

    const isActive = game.settings.get(MODULE_ID, 'uiEnabled') ?? true;

    // V13 API: tools is also a Record<string, SceneControlTool>, assigned by key
    tokenTools.tools.toggleBG3UI = {
        name: "toggleBG3UI",
        title: "Toggle BG3 HUD",
        icon: "fas fa-gamepad",
        toggle: true,
        active: isActive,
        order: 100, // Place at the end
        // V13 API: onChange signature is (event: Event, active: boolean) => void
        onChange: (event, active) => ui.BG3HUD_APP?.toggle(active)
    };
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

    // Check if adapter provides auto-populate on token creation
    const adapter = BG3HUD_REGISTRY.activeAdapter;
    if (!adapter || !adapter.autoPopulate) return;

    // Only auto-populate for NPCs (non-character actors) by default
    // Player characters should use right-click to auto-populate containers manually
    // NOTE: NPCs may still be owned by players (e.g., observers/minions); ownership should not block auto-populate
    // However, allow override for player characters if explicitly enabled
    const allowPlayerCharacters = game.settings.get(adapter.MODULE_ID, 'autoPopulatePlayerCharacters');
    if (actor.type === 'character' && !allowPlayerCharacters) {
        return;
    }

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

        // Delay before passives (50ms after grids)
        await new Promise(resolve => setTimeout(resolve, 50));

        // Also auto-populate passives if adapter supports it
        if (typeof adapter.autoPopulatePassives === 'function') {
            await adapter.autoPopulatePassives(actor, tokenDocument);
        }
    } catch (error) {
        console.error('BG3 HUD Core | Error in auto-populate on token creation:', error);
    }
});
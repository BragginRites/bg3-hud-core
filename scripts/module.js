import { BG3Hotbar } from './BG3Hotbar.js';
import { BG3HUD_API, BG3HUD_REGISTRY } from './utils/registry.js';
import { registerSettings, applyMacrobarCollapseSetting, applyContainerRowSettings, applyTheme } from './utils/settings.js';
import { TooltipManager } from './managers/TooltipManager.js';
import { TargetSelectorManager } from './managers/TargetSelectorManager.js';
import { Logger } from './utils/logger.js';

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
    Logger.info('Registering settings');
    registerSettings();
});

Hooks.once('ready', async () => {
    Logger.info('Initializing');

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
    Logger.info('Calling bg3HudReady hook for system adapters');
    Hooks.callAll('bg3HudReady', BG3HUD_API);

    // Only wait for adapter registration if a compatible adapter module is active
    if (hasCompatibleAdapter) {
        await new Promise(resolve => {
            Hooks.once('bg3HudRegistrationComplete', resolve);
            // Longer timeout in case adapter has async initialization
            setTimeout(resolve, 2000);
        });
    }

    // Ensure canvas.tokens exists (ready can run before the canvas is initialised)
    if (typeof canvas !== 'undefined' && canvas && !canvas.ready) {
        await new Promise(resolve => {
            Hooks.once('canvasReady', resolve);
        });
    }

    // Create and render the HUD
    Logger.info('Creating HUD application');
    ui.BG3HUD_APP = new BG3Hotbar();
    // `ready` already applied theme, skip duplicate work in first _onRender
    ui.BG3HUD_APP._themeApplied = true;

    const initialToken = ui.BG3HUD_APP.hudOnScreen.playSheetToken();
    if (initialToken) {
        Logger.debug('Pre-binding controlled token for first HUD render:', initialToken.name);
        ui.BG3HUD_APP.currentToken = initialToken;
        ui.BG3HUD_APP.currentActor = initialToken.actor;
    }

    await ui.BG3HUD_APP.render(true);

    // Apply macrobar collapse setting
    applyMacrobarCollapseSetting(ui.BG3HUD_APP.isVisible);

    // Apply container row settings
    applyContainerRowSettings();

    Logger.info('Initialization complete');
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

    const adapter = BG3HUD_REGISTRY.activeAdapter;
    if (!adapter) return;

    // Only auto-populate for NPCs by default; PCs use right-click unless setting enabled.
    // Player-character detection is adapter-owned (falls back in BG3HUD_API).
    const allowPlayerCharacters = game.settings.get(adapter.MODULE_ID, 'autoPopulatePlayerCharacters');
    if (BG3HUD_API.isPlayerCharacter(actor) && !allowPlayerCharacters) {
        return;
    }

    const moduleId = adapter.MODULE_ID;

    // Passives — independent of grid auto-populate
    if (typeof adapter.autoPopulatePassives === 'function'
        && game.settings.get(moduleId, 'autoPopulatePassivesEnabled')) {
        try {
            await adapter.autoPopulatePassives(actor, tokenDocument);
        } catch (error) {
            Logger.error('Error auto-populating passives on token creation:', error);
        }
    }

    if (!adapter.autoPopulate) return;

    const enabled = game.settings.get(moduleId, 'autoPopulateEnabled');
    if (!enabled) return;

    const configuration = game.settings.get(moduleId, 'autoPopulateConfiguration');
    if (!configuration) return;

    const hasTypes = configuration.grid0?.length > 0
        || configuration.grid1?.length > 0
        || configuration.grid2?.length > 0;

    if (!hasTypes) return;

    try {
        const { PersistenceManager } = await import('./managers/PersistenceManager.js');
        const tempPersistence = PersistenceManager.forActor(actor);
        await adapter.autoPopulate.populateOnTokenCreation(actor, configuration, tempPersistence);

        await new Promise(resolve => setTimeout(resolve, 50));

        if (typeof adapter.onTokenCreationComplete === 'function') {
            await adapter.onTokenCreationComplete(actor, tempPersistence);
        }
    } catch (error) {
        Logger.error('Error in auto-populate on token creation:', error);
    }
});
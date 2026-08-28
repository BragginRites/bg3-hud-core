import { BG3HUD_API, BG3HUD_REGISTRY } from './utils/registry.js';
import { applyMacrobarCollapseSetting, applyTheme, applyAppearanceSettings, applyMinimalistView } from './utils/settings.js';
import { PersistenceManager } from './managers/PersistenceManager.js';
import { InteractionCoordinator } from './managers/InteractionCoordinator.js';
import { UpdateCoordinator } from './managers/UpdateCoordinator.js';
import { ComponentFactory } from './managers/ComponentFactory.js';
import { ItemUpdateManager } from './managers/ItemUpdateManager.js';
import { HudOnScreen } from './managers/HudOnScreen.js';
import { ControlsManager } from './managers/ControlsManager.js';
import { HotbarViewsContainer } from './components/containers/HotbarViewsContainer.js';
import { Logger } from './utils/logger.js';

/**
 * BG3 Hotbar Application
 * Main HUD application shell - delegates to specialized managers
 */
export class BG3Hotbar extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
    /**
     * Default application options
     */
    static DEFAULT_OPTIONS = {
        id: 'bg3-hotbar',
        classes: ['bg3-hud'],
        tag: 'div',
        window: {
            frame: false,           // No window frame/chrome
            positioned: false,      // Don't use Foundry's positioning
            resizable: false,
            minimizable: false
        },
        position: {
            width: 'auto',
            height: 'auto'
        },
        actions: {}
    };

    /**
     * Handlebars template path
     */
    static PARTS = {
        content: {
            template: 'modules/bg3-hud-core/templates/bg3-hud.hbs'
        }
    };

    /**
     * Create a new BG3Hotbar
     */
    constructor(options = {}) {
        super(options);

        this.components = {};
        this.currentToken = null;
        this.currentActor = null;
        this.overrideGMHotbar = false; // Flag to manually override GM hotbar

        // Debounce state for refresh coalescing
        this._refreshDebounceTimer = null;
        this._refreshGeneration = 0;
        /** @type {boolean} Track whether theme has been applied at least once */
        this._themeApplied = false;
        /** @type {boolean|null} Dock minimized state (caret toggle); null while animating */
        this._minimized = false;

        // Initialize managers
        this.persistenceManager = new PersistenceManager();
        this.componentFactory = new ComponentFactory(this);
        this.interactionCoordinator = new InteractionCoordinator({
            hotbarApp: this,
            persistenceManager: this.persistenceManager,
            get adapter() { return BG3HUD_REGISTRY.activeAdapter; }
        });
        this.updateCoordinator = new UpdateCoordinator({
            hotbarApp: this,
            persistenceManager: this.persistenceManager
        });
        this.itemUpdateManager = new ItemUpdateManager({
            hotbarApp: this,
            persistenceManager: this.persistenceManager
        });
        this.hudOnScreen = new HudOnScreen(this);

        // Register Foundry hooks via coordinator
        this.updateCoordinator.registerHooks();

        // Re-apply display settings when adapter registration completes
        // This handles the case where HUD renders before adapter is fully ready
        this._registrationCompleteHookId = Hooks.on('bg3HudRegistrationComplete', () => {
            if (this.rendered) {
                this.updateDisplaySettings();
            }
        });
    }

    /**
     * Check if GM hotbar should be shown
     * @returns {boolean} True if GM hotbar should be shown
     */
    canGMHotbar() {
        return !this.currentActor &&
            game.user.isGM &&
            game.settings.get('bg3-hud-core', 'enableGMHotbar');
    }

    /**
     * Check if the HUD is currently visible (showing content)
     * Returns true only if uiEnabled AND (token selected OR GM hotbar active)
     * @returns {boolean} True if the HUD is visible and showing content
     */
    get isVisible() {
        const uiEnabled = game.settings.get('bg3-hud-core', 'uiEnabled');
        if (!uiEnabled) return false;

        // Check if we have a token or are in GM hotbar mode
        const isGMHotbarMode = this.canGMHotbar() || this.overrideGMHotbar;
        return !!(this.currentToken || isGMHotbarMode);
    }

    /**
     * Apply macrobar collapse setting
     * Public method that can be called from settings onChange
     */
    applyMacrobarCollapseSetting() {
        applyMacrobarCollapseSetting();
    }

    /**
     * Update display settings (item names, uses, etc.)
     * Gets settings from the active adapter if available
     */
    updateDisplaySettings() {
        if (!this.element) return;

        // Get display settings from active adapter
        const adapter = BG3HUD_REGISTRY.activeAdapter;
        let itemName = 'false';
        let itemUse = 'false';
        if (adapter && typeof adapter.getDisplaySettings === 'function') {
            const settings = adapter.getDisplaySettings();
            itemName = String(!!settings.showItemNames);
            itemUse = String(!!settings.showItemUses);
        }

        // Apply to the container element which CSS targets
        const target = this.element.querySelector('#bg3-hotbar-container') || this.element;
        target.dataset.itemName = itemName;
        target.dataset.itemUse = itemUse;
    }

    /**
     * Refresh the hotbar (re-render)
     * Debounced: rapid calls within 50ms are coalesced into a single render.
     * Uses CSS transitionend instead of hard setTimeout for fade-out.
     * Callers that change what is on screen should use hudOnScreen, not this.
     * @param {Object} [options]
     * @param {boolean} [options.forceFull] Skip soft Token path (used when soft swap falls back).
     */
    async refresh(options = {}) {
        const forceFull = options.forceFull === true;

        if (!this.rendered) return;

        // Leftover tokenSwap callers: HudOnScreen chooses soft vs full.
        if (!forceFull && options.tokenSwap === true) {
            await this.hudOnScreen._apply();
            return;
        }

        // First time building token/GM HUD shell (no hotbar yet): skip debounce and
        // fade-out. Avoids ~250ms of artificial delay and a teardown flash after load
        // or first selection when nothing is on screen to transition from.
        const coldHudBuild = !this.components?.hotbar
            && !!(this.currentToken
                || this.overrideGMHotbar
                || this.canGMHotbar());

        // Increment generation to invalidate any previous pending refresh
        const generation = ++this._refreshGeneration;

        // Cancel any pending debounce timer
        if (this._refreshDebounceTimer) {
            clearTimeout(this._refreshDebounceTimer);
            this._refreshDebounceTimer = null;
        }

        if (!coldHudBuild) {
            // Debounce: wait 50ms for rapid calls to coalesce (e.g., multi-token select)
            await new Promise(resolve => {
                this._refreshDebounceTimer = setTimeout(resolve, 50);
            });

            // If a newer refresh was requested while we waited, bail out
            if (generation !== this._refreshGeneration) return;
        }

        // Add fade-out transition before re-rendering (not for cold first build)
        if (!coldHudBuild
            && this.element
            && !this.element.classList.contains('bg3-hud-building')) {
            this.element.classList.remove('bg3-hud-visible');
            this.element.classList.add('bg3-hud-fading-out');

            // Wait for CSS transition to finish, with safety cap at 200ms
            await new Promise(resolve => {
                const safetyTimeout = setTimeout(resolve, 200);
                this.element?.addEventListener('transitionend', function handler() {
                    clearTimeout(safetyTimeout);
                    resolve();
                }, { once: true });
            });

            // Check again after waiting — a newer call may have superseded us
            if (generation !== this._refreshGeneration) return;
        }

        if (this.element) {
            this.element.classList.add('bg3-hud-building');
            this.element.classList.remove('bg3-hud-visible');
        }

        if (generation !== this._refreshGeneration) return;
        await this.render(false);
    }

    /**
     * Prepare rendering context data
     * @param {Object} options - Render options
     * @returns {Promise<Object>} Render context
     */
    async _prepareContext(options) {
        const context = {
            ...await super._prepareContext(options),
            // Add any additional context data here if needed
        };
        return context;
    }

    /**
     * Actions after rendering
     * @param {Object} context - Render context
     * @param {Object} options - Render options
     */
    async _onRender(context, options) {
        if (this.element) {
            this.element.classList.add('bg3-hud-building');
            this.element.classList.remove('bg3-hud-visible');
        }

        await super._onRender(context, options);

        if (this.element) {
            this.element.classList.add('bg3-hud-building');
            this.element.classList.remove('bg3-hud-visible');
        }

        // Apply theme CSS variables. Only on first render.
        // Subsequent theme changes are applied by ThemeSettingDialog.close().
        if (!this._themeApplied) {
            await applyTheme();
            this._themeApplied = true;
        }

        // Apply display settings
        this.updateDisplaySettings();

        // Initialize components after DOM is ready
        await this._initializeComponents();

        // Always re-sync Foundry macro bar after component init.
        // This covers token select/deselect refreshes where UI visibility context changes.
        applyMacrobarCollapseSetting(this.isVisible);

        // Apply appearance settings (opacity, scale, position) after components are built
        applyAppearanceSettings();

        // Initialize lock state (button UI and dataset attributes)
        ControlsManager.initializeLockState();

        // Check user visibility setting
        if (!game.settings.get('bg3-hud-core', 'uiEnabled')) {
            this.updateVisibility(false);
        }

        // Only now, when UI is fully built and styled, show it (fade-in)
        // Checks internal state (building/hidden) but also respects global visibility
        this._finalizeRenderVisibility();
    }

    /**
     * Toggle between GM Hotbar and Token Hotbar
     * Switches context between the selected token and the global GM hotbar
     */
    async toggleGMHotbarMode() {
        if (!game.user.isGM) return;

        if (!game.settings.get('bg3-hud-core', 'enableGMHotbar')) {
            ui.notifications.warn(game.i18n.localize('bg3-hud-core.Notifications.GMHotbarNotEnabled'));
            return;
        }

        const showingPlaySheet = !!this.currentToken && !this.overrideGMHotbar;
        if (showingPlaySheet) {
            await this.hudOnScreen.showGmHotbarOverride();
            return;
        }

        const play = this.hudOnScreen.playSheetToken();
        if (play) {
            await this.hudOnScreen.showToken(play);
            return;
        }

        ui.notifications.warn(game.i18n.localize('bg3-hud-core.Notifications.SelectTokenToSwitch'));
    }

    /**
     * Toggle HUD visibility
     * @param {boolean|null} state - Force state or null to toggle
     * @returns {Promise<boolean>} New state
     */
    async toggle(state = null) {
        const currentState = game.settings.get('bg3-hud-core', 'uiEnabled');
        const newState = state ?? !currentState;

        if (currentState !== newState) {
            await game.settings.set('bg3-hud-core', 'uiEnabled', newState);
        }
        return newState;
    }

    /**
     * Toggle minimized dock state (legacy Application._onToggleMinimize behavior).
     * @param {Event} [event]
     */
    _onToggleMinimize(event) {
        event?.preventDefault?.();
        if (this._minimized) this.maximize();
        else this.minimize();
    }

    /**
     * Slide the HUD off-screen, leaving the caret toggle accessible.
     * Matches bg3-inspired-hotbar minimize().
     * @returns {Promise<void>}
     */
    async minimize() {
        const container = this.element?.querySelector('#bg3-hotbar-container');
        if (!this.rendered || !container || [true, null].includes(this._minimized)) return;
        this._minimized = null;

        return new Promise((resolve) => {
            container.classList.add('minimized');
            setTimeout(() => {
                this._minimized = true;
                resolve();
            }, 300);
        });
    }

    /**
     * Restore the HUD from the minimized dock state.
     * Matches bg3-inspired-hotbar maximize().
     * @returns {Promise<void>}
     */
    async maximize() {
        const container = this.element?.querySelector('#bg3-hotbar-container');
        if (!container || [false, null].includes(this._minimized)) return;
        this._minimized = null;

        return new Promise((resolve) => {
            container.classList.remove('minimized');
            setTimeout(() => {
                this._minimized = false;
                resolve();
            }, 300);
        });
    }

    /**
     * Re-apply minimized class after a rebuild if the dock was slid away.
     * @private
     */
    _applyHudDockState() {
        const container = this.element?.querySelector('#bg3-hotbar-container');
        if (!container) return;
        container.classList.toggle('minimized', this._minimized === true);
    }

    /**
     * Update visibility based on setting
     * @param {boolean} visible - Whether UI should be visible
     */
    updateVisibility(visible) {
        if (!this.element) return;

        if (visible) {
            this.element.classList.remove('bg3-hud-user-hidden');
            // If we are unhiding, ensure we aren't stuck in hidden state
            if (!this.element.classList.contains('bg3-hud-hidden')) {
                this.element.style.display = '';
            }
        } else {
            this.element.classList.add('bg3-hud-user-hidden');
            // Force hide
            this.element.style.display = 'none';
        }

        // Sync Foundry macro bar visibility (for 'whenHudVisible' option)
        applyMacrobarCollapseSetting(visible);

        // Sync token control button
        // V13 API: ui.controls.controls is a Record<string, SceneControl>
        const tool = ui.controls?.controls?.tokens?.tools?.toggleBG3UI;
        if (tool) {
            tool.active = visible;
            if (ui.controls.rendered) ui.controls.render();
        }
    }

    /**
     * Initialize UI components
     * Components are provided by system adapters via ComponentFactory
     * @private
     */
    async _initializeComponents() {
        // Clear existing components
        this._destroyComponents();

        // Check if in GM hotbar mode
        const isGMHotbarMode = this.canGMHotbar() || this.overrideGMHotbar;

        // Ensure interaction coordinator has the active adapter early
        // This is important for proper initialization even when no token is selected (Issue #8)
        if (BG3HUD_REGISTRY?.activeAdapter && this.interactionCoordinator?.setAdapter) {
            this.interactionCoordinator.setAdapter(BG3HUD_REGISTRY.activeAdapter);
        }

        // Only initialize if we have a token OR we're in GM hotbar mode
        if (!this.currentToken && !isGMHotbarMode) {
            // Hide the UI when no token is selected and not in GM mode
            if (this.element) {
                this.element.classList.add('bg3-hud-hidden');
            }
            // Macrobar sync handled by _onRender after this returns (Issue #8)
            return;
        }

        // Hide the UI during initialization to prevent visual flicker
        if (this.element) {
            this.element.classList.add('bg3-hud-building');
        }

        // Get the main container
        const container = this.element.querySelector('#bg3-hotbar-container');
        if (!container) {
            Logger.error('Container element not found');
            return;
        }

        applyMinimalistView();

        // Create regions
        const leftRegion = document.createElement('div');
        leftRegion.className = 'bg3-hud-region bg3-hud-region-left';

        const centerRegion = document.createElement('div');
        centerRegion.className = 'bg3-hud-region bg3-hud-region-center';

        const rightRegion = document.createElement('div');
        rightRegion.className = 'bg3-hud-region bg3-hud-region-right';

        // Clear container and append regions
        container.innerHTML = ''; // Ensure container is empty
        container.appendChild(leftRegion);
        container.appendChild(centerRegion);
        container.appendChild(rightRegion);

        // Set the current token in persistence manager and load state
        if (isGMHotbarMode) {
            // GM hotbar mode: set token to null to trigger GM mode in persistence manager
            this.persistenceManager.setToken(null);
        } else {
            this.persistenceManager.setToken(this.currentToken);
        }

        let state = await this.persistenceManager.loadState();

        // Hydrate state to ensure fresh item data (quantity, uses, etc.)
        // Only hydrate if we have an actor (not in GM mode)
        if (!isGMHotbarMode) {
            state = await this.persistenceManager.hydrateState(state);
        }

        // Create shared interaction handlers (delegates to InteractionCoordinator)
        const handlers = {
            onCellClick: this.interactionCoordinator.handleClick.bind(this.interactionCoordinator),
            onCellRightClick: this.interactionCoordinator.handleRightClick.bind(this.interactionCoordinator),
            onCellDragStart: this.interactionCoordinator.handleDragStart.bind(this.interactionCoordinator),
            onCellDragEnd: this.interactionCoordinator.handleDragEnd.bind(this.interactionCoordinator),
            onCellDrop: this.interactionCoordinator.handleDrop.bind(this.interactionCoordinator)
        };

        // GM hotbar mode: only create hotbar and control container
        if (isGMHotbarMode) {
            // Create hotbar container from GM hotbar state
            this.components.hotbar = await this.componentFactory.createHotbarContainer(state.hotbar.grids, handlers);
            centerRegion.appendChild(await this.components.hotbar.render()); // Append to CENTER

            // Create control container
            this.components.controls = await this.componentFactory.createControlContainer();
            this.components.hotbar.element.appendChild(await this.components.controls.render());
        } else {
            // Normal token mode: create all components
            // Create info container (if adapter provides one)
            this.components.info = await this.componentFactory.createInfoContainer();
            // Info container is usually attached to portrait, but if standalone, where does it go?
            // Assuming portrait integration for now based on previous code.

            // Create portrait container (uses adapter if available)
            // Pass info container to portrait so it can be positioned above it
            this.components.portrait = await this.componentFactory.createPortraitContainer();
            if (this.components.info) {
                this.components.portrait.infoContainer = this.components.info;
            }
            leftRegion.appendChild(await this.components.portrait.render()); // Append to LEFT

            // Create wrapper for weapon sets and quick access
            // This wrapper was previously direct child, now goes into LEFT region after portrait
            const weaponQuickWrapper = document.createElement('div');
            weaponQuickWrapper.className = 'bg3-weapon-quick-wrapper';
            leftRegion.appendChild(weaponQuickWrapper); // Append to LEFT

            // Create weapon sets container from UNIFIED state
            this.components.weaponSets = await this.componentFactory.createWeaponSetsContainer(state.weaponSets.sets, handlers);
            weaponQuickWrapper.appendChild(await this.components.weaponSets.render());
            await this.components.weaponSets.setActiveSet(state.weaponSets.activeSet, true);

            // Create quick access container from UNIFIED state (now arrays of grids)
            this.components.quickAccess = await this.componentFactory.createQuickAccessContainer(state.quickAccess, handlers);
            weaponQuickWrapper.appendChild(await this.components.quickAccess.render());

            // Optional adapter containers (left rail), ordered by registerContainer options
            const leftExtras = await this.componentFactory.createRegisteredContainers('left');
            for (const { id, component } of leftExtras) {
                this.components[id] = component;
                leftRegion.appendChild(await component.render());
            }

            // Create hotbar container from UNIFIED state
            this.components.hotbar = await this.componentFactory.createHotbarContainer(state.hotbar.grids, handlers);
            centerRegion.appendChild(await this.components.hotbar.render()); // Append to CENTER

            // Create filter container (if adapter provides one and setting is enabled)
            if (game.settings.get('bg3-hud-core', 'showFilters')) {
                this.components.filters = await this.componentFactory.createFilterContainer();
                if (this.components.filters) {
                    this.components.hotbar.element.appendChild(await this.components.filters.render());
                }
            }

            // Create views container - positioned at bottom center of hotbar
            // Only show for player characters (not NPCs). Hidden in Minimalist View.
            const minimalistView = game.settings.get('bg3-hud-core', 'minimalistView') === true;
            const isPlayerCharacter = BG3HUD_API.isPlayerCharacter(this.currentActor);
            if (!minimalistView && isPlayerCharacter) {
                this.components.views = new HotbarViewsContainer({
                    hotbarApp: this
                });
                this.components.hotbar.element.appendChild(await this.components.views.render());
            }

            // Create action buttons container (rest/turn buttons if adapter provides them)
            this.components.actionButtons = await this.componentFactory.createActionButtonsContainer();
            if (this.components.actionButtons) {
                rightRegion.appendChild(await this.components.actionButtons.render()); // Append to RIGHT
            }

            // Create control container
            this.components.controls = await this.componentFactory.createControlContainer();
            this.components.hotbar.element.appendChild(await this.components.controls.render());
        }

    }

    /**
     * Finalize render and trigger fade-in after UI is built
     * Ensures the UI is fully constructed before becoming visible
     * @private
     */
    _finalizeRenderVisibility() {
        this._applyHudDockState();
        if (!this.element) return;

        if (!this.isVisible) {
            this.element.classList.add('bg3-hud-hidden');
            this.element.classList.remove('bg3-hud-visible', 'bg3-hud-fading-out', 'bg3-hud-building');
            return;
        }

        this.element.classList.remove('bg3-hud-hidden', 'bg3-hud-fading-out');
        this.element.classList.add('bg3-hud-visible');
        const reveal = () => {
            this.element?.classList.remove('bg3-hud-building');
        };
        requestAnimationFrame(() => requestAnimationFrame(reveal));
    }

    /**
     * Destroy all components
     * @private
     */
    _destroyComponents() {
        for (const [key, component] of Object.entries(this.components)) {
            if (component && typeof component.destroy === 'function') {
                component.destroy();
            }
        }
        this.components = {};
    }

    /**
     * Clean up when closing
     */
    async close(options = {}) {
        this._destroyComponents();

        // Unregister manager hooks to prevent memory leaks
        this.updateCoordinator.unregisterHooks();
        this.itemUpdateManager.destroy();

        // Unregister the registration-complete hook
        if (this._registrationCompleteHookId !== undefined) {
            Hooks.off('bg3HudRegistrationComplete', this._registrationCompleteHookId);
            this._registrationCompleteHookId = undefined;
        }

        return super.close(options);
    }
}

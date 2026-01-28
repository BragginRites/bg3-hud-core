import { BG3HUD_REGISTRY } from './utils/registry.js';
import { applyMacrobarCollapseSetting, applyTheme, applyAppearanceSettings } from './utils/settings.js';
import { PersistenceManager } from './managers/PersistenceManager.js';
import { InteractionCoordinator } from './managers/InteractionCoordinator.js';
import { UpdateCoordinator } from './managers/UpdateCoordinator.js';
import { ComponentFactory } from './managers/ComponentFactory.js';
import { ItemUpdateManager } from './managers/ItemUpdateManager.js';
import { HotbarViewsContainer } from './components/containers/HotbarViewsContainer.js';
import { ControlsManager } from './managers/ControlsManager.js';

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

        // Register Foundry hooks via coordinator
        this.updateCoordinator.registerHooks();

        // Re-apply display settings when adapter registration completes
        // This handles the case where HUD renders before adapter is fully ready
        Hooks.on('bg3HudRegistrationComplete', () => {
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
        if (adapter && typeof adapter.getDisplaySettings === 'function') {
            const settings = adapter.getDisplaySettings();

            // Convert boolean to string for data attributes (CSS checks for string "true")
            const itemName = String(!!settings.showItemNames);
            const itemUse = String(!!settings.showItemUses);

            // Apply to the container element which CSS targets
            const container = this.element?.querySelector('#bg3-hotbar-container');
            if (container) {
                container.dataset.itemName = itemName;
                container.dataset.itemUse = itemUse;
            } else {
                this.element.dataset.itemName = itemName;
                this.element.dataset.itemUse = itemUse;
            }
        } else {
            // Fallback: no display options if no adapter
            const container = this.element?.querySelector('#bg3-hotbar-container');
            if (container) {
                container.dataset.itemName = 'false';
                container.dataset.itemUse = 'false';
            } else {
                this.element.dataset.itemName = 'false';
                this.element.dataset.itemUse = 'false';
            }
        }
    }

    /**
     * Refresh the hotbar (re-render)
     */
    async refresh() {
        if (!this.rendered) return;

        // Add fade-out transition before re-rendering
        if (this.element && !this.element.classList.contains('bg3-hud-building')) {
            this.element.classList.remove('bg3-hud-visible');
            this.element.classList.add('bg3-hud-fading-out');

            // Wait for fade-out transition to complete
            await new Promise(resolve => setTimeout(resolve, 300));
        }

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
        await super._onRender(context, options);

        // Apply theme CSS variables
        await applyTheme();

        // Apply display settings
        this.updateDisplaySettings();

        // Initialize components after DOM is ready
        await this._initializeComponents();

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

        // Check if GM hotbar is enabled
        if (!game.settings.get('bg3-hud-core', 'enableGMHotbar')) {
            ui.notifications.warn("GM Hotbar is not enabled in module settings.");
            return;
        }

        const token = canvas.tokens.controlled[0];
        // If we have no current token, we are effectively in GM mode (or no-op)
        const isCurrentlyGM = !this.currentToken;

        if (isCurrentlyGM) {
            if (token) {
                // Switch from GM hotbar to token hotbar
                this.overrideGMHotbar = false;
                this.currentToken = token;
                this.currentActor = token.actor;
                await this.refresh();
            } else {
                ui.notifications.warn("Select a token to switch to Token Hotbar");
            }
        } else {
            // Switch from token hotbar to GM hotbar
            this.overrideGMHotbar = true;
            this.currentToken = null;
            this.currentActor = null;
            await this.refresh();
        }
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
            // Apply macrobar setting since HUD is now hidden (Issue #8)
            applyMacrobarCollapseSetting(false);
            return;
        }

        // Hide the UI during initialization to prevent visual flicker
        if (this.element) {
            this.element.classList.add('bg3-hud-building');
        }

        // Get the main container
        const container = this.element.querySelector('#bg3-hotbar-container');
        if (!container) {
            console.error('BG3 HUD Core | Container element not found');
            return;
        }

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

            // Create situational bonuses container (if adapter provides one) - positioned between weapon sets and hotbar
            // Currently hanging on the left, so append to LEFT region
            this.components.situationalBonuses = await this.componentFactory.createSituationalBonusesContainer();
            if (this.components.situationalBonuses) {
                const situationalBonusesElement = await this.components.situationalBonuses.render();
                leftRegion.appendChild(situationalBonusesElement); // Append to LEFT
            }

            // Create CPR Generic Actions container (if adapter provides one) - positioned next to situational bonuses
            // Appending to LEFT region
            this.components.cprGenericActions = await this.componentFactory.createCPRGenericActionsContainer();
            if (this.components.cprGenericActions) {
                const cprGenericActionsElement = await this.components.cprGenericActions.render();
                leftRegion.appendChild(cprGenericActionsElement); // Append to LEFT
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
            // Only show for player characters (not NPCs)
            const isPlayerCharacter = this.currentActor?.hasPlayerOwner || this.currentActor?.type === 'character';
            if (isPlayerCharacter) {
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
        if (!this.element) return;
        this.element.classList.remove('bg3-hud-building', 'bg3-hud-hidden', 'bg3-hud-fading-out');
        requestAnimationFrame(() => {
            if (this.element) {
                this.element.classList.add('bg3-hud-visible');
            }
        });
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
        return super.close(options);
    }
}

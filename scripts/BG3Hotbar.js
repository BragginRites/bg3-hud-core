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

        // Debounce state for refresh coalescing
        this._refreshDebounceTimer = null;
        this._refreshGeneration = 0;
        /** @type {boolean} Track whether theme has been applied at least once */
        this._themeApplied = false;

        // UI Structure tracking for component recycling
        this.regions = {};
        this._lastInitMode = null; // 'token', 'gm', or null

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
     */
    async refresh() {
        if (!this.rendered) return;

        // Increment generation to invalidate any previous pending refresh
        const generation = ++this._refreshGeneration;

        // Cancel any pending debounce timer
        if (this._refreshDebounceTimer) {
            clearTimeout(this._refreshDebounceTimer);
            this._refreshDebounceTimer = null;
        }

        // Debounce: wait 50ms for rapid calls to coalesce (e.g., multi-token select)
        await new Promise(resolve => {
            this._refreshDebounceTimer = setTimeout(resolve, 50);
        });

        // If a newer refresh was requested while we waited, bail out
        if (generation !== this._refreshGeneration) return;

        // Add fade-out transition before re-rendering
        if (this.element && !this.element.classList.contains('bg3-hud-building')) {
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

        // Apply theme CSS variables — only on first render.
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

        // Check if GM hotbar is enabled
        if (!game.settings.get('bg3-hud-core', 'enableGMHotbar')) {
            ui.notifications.warn(game.i18n.localize('bg3-hud-core.Notifications.GMHotbarNotEnabled'));
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
                ui.notifications.warn(game.i18n.localize('bg3-hud-core.Notifications.SelectTokenToSwitch'));
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
        // Check if in GM hotbar mode
        const isGMHotbarMode = this.canGMHotbar() || this.overrideGMHotbar;
        const currentMode = isGMHotbarMode ? 'gm' : 'token';
        const modeChanged = this._lastInitMode !== currentMode;

        // Ensure interaction coordinator has the active adapter early
        if (BG3HUD_REGISTRY?.activeAdapter && this.interactionCoordinator?.setAdapter) {
            this.interactionCoordinator.setAdapter(BG3HUD_REGISTRY.activeAdapter);
        }

        // Only initialize if we have a token OR we're in GM hotbar mode
        if (!this.currentToken && !isGMHotbarMode) {
            if (this.element) {
                this.element.classList.add('bg3-hud-hidden');
            }
            this._lastInitMode = null;
            return;
        }

        // Hide the UI during initialization to prevent visual flicker
        if (this.element) {
            this.element.classList.add('bg3-hud-building');
        }

        // Get or create regions
        const container = this.element.querySelector('#bg3-hotbar-container');
        if (!container) return;

        if (modeChanged || !this.regions.left) {
            // Full teardown only on mode change or first init
            this._destroyComponents();
            container.innerHTML = '';
            
            this.regions.left = document.createElement('div');
            this.regions.left.className = 'bg3-hud-region bg3-hud-region-left';
            
            this.regions.center = document.createElement('div');
            this.regions.center.className = 'bg3-hud-region bg3-hud-region-center';
            
            this.regions.right = document.createElement('div');
            this.regions.right.className = 'bg3-hud-region bg3-hud-region-right';
            
            container.appendChild(this.regions.left);
            container.appendChild(this.regions.center);
            container.appendChild(this.regions.right);
            this._lastInitMode = currentMode;
        }

        const { left: leftRegion, center: centerRegion, right: rightRegion } = this.regions;

        // Set the current token in persistence manager and load state
        this.persistenceManager.setToken(isGMHotbarMode ? null : this.currentToken);
        let state = await this.persistenceManager.loadState();

        // Hydrate state in parallel
        if (!isGMHotbarMode) {
            state = await this.persistenceManager.hydrateState(state);
        }

        // Shared interaction handlers
        const handlers = {
            onCellClick: this.interactionCoordinator.handleClick.bind(this.interactionCoordinator),
            onCellRightClick: this.interactionCoordinator.handleRightClick.bind(this.interactionCoordinator),
            onCellDragStart: this.interactionCoordinator.handleDragStart.bind(this.interactionCoordinator),
            onCellDragEnd: this.interactionCoordinator.handleDragEnd.bind(this.interactionCoordinator),
            onCellDrop: this.interactionCoordinator.handleDrop.bind(this.interactionCoordinator)
        };

        const contextOptions = {
            actor: this.currentActor,
            token: this.currentToken,
            grids: state.hotbar.grids,
            ...handlers
        };

        // Component Recycling / Creation
        const maybeAppend = async (component, parent) => {
            const element = await component.render();
            if (element && element.parentElement !== parent) {
                parent.appendChild(element);
            }
            return component;
        };

        if (isGMHotbarMode) {
            // GM Mode
            if (this.components.hotbar) {
                this.components.hotbar.updateContext({ grids: state.hotbar.grids, ...handlers });
            } else {
                this.components.hotbar = await this.componentFactory.createHotbarContainer(state.hotbar.grids, handlers);
            }
            await maybeAppend(this.components.hotbar, centerRegion);

            if (this.components.controls) {
                this.components.controls.updateContext({ hotbarApp: this });
            } else {
                this.components.controls = await this.componentFactory.createControlContainer();
            }
            // Controls usually go inside the hotbar element for positioning
            await maybeAppend(this.components.controls, this.components.hotbar.element);
        } else {
            // Token Mode
            // Portrait
            if (this.components.portrait) {
                this.components.portrait.updateContext({ actor: this.currentActor, token: this.currentToken });
            } else {
                this.components.portrait = await this.componentFactory.createPortraitContainer();
            }
            await maybeAppend(this.components.portrait, leftRegion);

            // Info (optional)
            const InfoClass = BG3HUD_REGISTRY.infoContainer;
            if (InfoClass) {
                if (this.components.info) {
                    this.components.info.updateContext({ actor: this.currentActor, token: this.currentToken });
                } else {
                    this.components.info = await this.componentFactory.createInfoContainer();
                    if (this.components.info) this.components.portrait.infoContainer = this.components.info;
                }
                // Info is handled inside PortraitContainer.render()
            } else if (this.components.info) {
                this.components.info.destroy();
                delete this.components.info;
            }

            // Wrapper for Weapons/Quick
            let weaponQuickWrapper = leftRegion.querySelector('.bg3-weapon-quick-wrapper');
            if (!weaponQuickWrapper) {
                weaponQuickWrapper = document.createElement('div');
                weaponQuickWrapper.className = 'bg3-weapon-quick-wrapper';
                leftRegion.appendChild(weaponQuickWrapper);
            }

            // Weapon Sets
            if (this.components.weaponSets) {
                this.components.weaponSets.updateContext({ 
                    actor: this.currentActor, 
                    token: this.currentToken, 
                    weaponSets: state.weaponSets.sets,
                    ...handlers 
                });
            } else {
                this.components.weaponSets = await this.componentFactory.createWeaponSetsContainer(state.weaponSets.sets, handlers);
            }
            await maybeAppend(this.components.weaponSets, weaponQuickWrapper);
            await this.components.weaponSets.setActiveSet(state.weaponSets.activeSet, true);

            // Quick Access
            if (this.components.quickAccess) {
                this.components.quickAccess.updateContext({ 
                    actor: this.currentActor, 
                    token: this.currentToken, 
                    grids: state.quickAccess.grids ?? [state.quickAccess],
                    ...handlers 
                });
            } else {
                this.components.quickAccess = await this.componentFactory.createQuickAccessContainer(state.quickAccess, handlers);
            }
            await maybeAppend(this.components.quickAccess, weaponQuickWrapper);

            // Situational Bonuses
            if (this.components.situationalBonuses) {
                this.components.situationalBonuses.updateContext({ actor: this.currentActor, token: this.currentToken });
            } else {
                this.components.situationalBonuses = await this.componentFactory.createSituationalBonusesContainer();
            }
            if (this.components.situationalBonuses) await maybeAppend(this.components.situationalBonuses, leftRegion);

            // CPR Generic Actions
            if (this.components.cprGenericActions) {
                this.components.cprGenericActions.updateContext({ actor: this.currentActor, token: this.currentToken });
            } else {
                this.components.cprGenericActions = await this.componentFactory.createCPRGenericActionsContainer();
            }
            if (this.components.cprGenericActions) await maybeAppend(this.components.cprGenericActions, leftRegion);

            // Hotbar
            if (this.components.hotbar) {
                this.components.hotbar.updateContext({ 
                    actor: this.currentActor, 
                    token: this.currentToken, 
                    grids: state.hotbar.grids,
                    ...handlers 
                });
            } else {
                this.components.hotbar = await this.componentFactory.createHotbarContainer(state.hotbar.grids, handlers);
            }
            await maybeAppend(this.components.hotbar, centerRegion);

            // Filters
            if (game.settings.get('bg3-hud-core', 'showFilters')) {
                if (this.components.filters) {
                    this.components.filters.updateContext({ actor: this.currentActor, token: this.currentToken });
                } else {
                    this.components.filters = await this.componentFactory.createFilterContainer();
                }
                if (this.components.filters) await maybeAppend(this.components.filters, this.components.hotbar.element);
            } else if (this.components.filters) {
                this.components.filters.destroy();
                delete this.components.filters;
            }

            // Views
            const isPlayerCharacter = this.currentActor?.hasPlayerOwner || this.currentActor?.type === 'character';
            if (isPlayerCharacter) {
                if (!this.components.views) {
                    this.components.views = new HotbarViewsContainer({ hotbarApp: this });
                }
                await maybeAppend(this.components.views, this.components.hotbar.element);
            } else if (this.components.views) {
                this.components.views.destroy();
                delete this.components.views;
            }

            // Action Buttons
            if (this.components.actionButtons) {
                this.components.actionButtons.updateContext({ actor: this.currentActor, token: this.currentToken });
            } else {
                this.components.actionButtons = await this.componentFactory.createActionButtonsContainer();
            }
            if (this.components.actionButtons) await maybeAppend(this.components.actionButtons, rightRegion);

            // Controls
            if (this.components.controls) {
                this.components.controls.updateContext({ hotbarApp: this });
            } else {
                this.components.controls = await this.componentFactory.createControlContainer();
            }
            await maybeAppend(this.components.controls, this.components.hotbar.element);
        }

        // Finalize state: ensure all current components are rendered.
        // We don't need a Promise.all(render) here because maybeAppend already awaits render().
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
        this.regions = {};
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

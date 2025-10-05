import { BG3HUD_REGISTRY } from './utils/registry.js';
import { applyMacrobarCollapseSetting } from './utils/settings.js';
import { PersistenceManager } from './managers/PersistenceManager.js';
import { InteractionCoordinator } from './managers/InteractionCoordinator.js';
import { UpdateCoordinator } from './managers/UpdateCoordinator.js';
import { ComponentFactory } from './managers/ComponentFactory.js';
import { SocketManager } from './managers/SocketManager.js';

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
        
        // Initialize managers
        this.persistenceManager = new PersistenceManager();
        this.componentFactory = new ComponentFactory(this);
        this.socketManager = new SocketManager(this);
        this.interactionCoordinator = new InteractionCoordinator({
            hotbarApp: this,
            persistenceManager: this.persistenceManager,
            get adapter() { return BG3HUD_REGISTRY.activeAdapter; }
        });
        this.updateCoordinator = new UpdateCoordinator({
            hotbarApp: this,
            persistenceManager: this.persistenceManager
        });

        // Register Foundry hooks via coordinator
        this.updateCoordinator.registerHooks();
        
        // Initialize socket connection (if socketlib available)
        this.socketManager.initialize();
        
        // Link socket manager to persistence manager
        this.persistenceManager.setSocketManager(this.socketManager);
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
     */
    updateDisplaySettings() {
        if (!this.element) return;

        const showItemNames = game.settings.get('bg3-hud-core', 'showItemNames');
        const showItemUses = game.settings.get('bg3-hud-core', 'showItemUses');

        this.element.dataset.itemName = showItemNames;
        this.element.dataset.itemUse = showItemUses;
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
        
        // Apply display settings
        this.updateDisplaySettings();
        
        // Initialize components after DOM is ready
        await this._initializeComponents();
    }
    async _onRender(context, options) {
        await super._onRender(context, options);
        
        // Apply display settings
        this.updateDisplaySettings();
        
        // Initialize components after DOM is ready
        await this._initializeComponents();
    }

    /**
     * Initialize UI components
     * Components are provided by system adapters via ComponentFactory
     * @private
     */
    async _initializeComponents() {
        // Clear existing components
        this._destroyComponents();

        // Only initialize if we have a token
        if (!this.currentToken) {
            console.log('BG3 HUD Core | No token selected, skipping component initialization');
            // Hide the UI when no token is selected
            if (this.element) {
                this.element.classList.add('bg3-hud-hidden');
            }
            return;
        }

        console.log('BG3 HUD Core | Initializing components');
        
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
        
        console.log('BG3 HUD Core | Rendering containers');

        // Set the current token in persistence manager and load UNIFIED state
        this.persistenceManager.setToken(this.currentToken);
        const state = await this.persistenceManager.loadState();

        // Create shared interaction handlers (delegates to InteractionCoordinator)
        const handlers = {
            onCellClick: this.interactionCoordinator.handleClick.bind(this.interactionCoordinator),
            onCellRightClick: this.interactionCoordinator.handleRightClick.bind(this.interactionCoordinator),
            onCellDragStart: this.interactionCoordinator.handleDragStart.bind(this.interactionCoordinator),
            onCellDragEnd: this.interactionCoordinator.handleDragEnd.bind(this.interactionCoordinator),
            onCellDrop: this.interactionCoordinator.handleDrop.bind(this.interactionCoordinator)
        };

        // Create portrait container (uses adapter if available)
        this.components.portrait = await this.componentFactory.createPortraitContainer();
        container.appendChild(await this.components.portrait.render());

        // Create wrapper for weapon sets and quick access
        const weaponQuickWrapper = document.createElement('div');
        weaponQuickWrapper.className = 'bg3-weapon-quick-wrapper';
        container.appendChild(weaponQuickWrapper);

        // Create weapon sets container from UNIFIED state
        this.components.weaponSets = await this.componentFactory.createWeaponSetsContainer(state.weaponSets.sets, handlers);
        weaponQuickWrapper.appendChild(await this.components.weaponSets.render());
        await this.components.weaponSets.setActiveSet(state.weaponSets.activeSet, true);

        // Create quick access container from UNIFIED state (now arrays of grids)
        this.components.quickAccess = await this.componentFactory.createQuickAccessContainer(state.quickAccess, handlers);
        weaponQuickWrapper.appendChild(await this.components.quickAccess.render());

        // Create hotbar container from UNIFIED state
        this.components.hotbar = await this.componentFactory.createHotbarContainer(state.hotbar.grids, handlers);
        container.appendChild(await this.components.hotbar.render());

        // Create filter container (if adapter provides one) - positioned over hotbar, centered at top
        this.components.filters = await this.componentFactory.createFilterContainer();
        if (this.components.filters) {
            this.components.hotbar.element.appendChild(await this.components.filters.render());
        }

        // Create action buttons container (rest/turn buttons if adapter provides them)
        this.components.actionButtons = await this.componentFactory.createActionButtonsContainer();
        if (this.components.actionButtons) {
            container.appendChild(await this.components.actionButtons.render());
        }
        
        console.log('BG3 HUD Core | Components initialized:', Object.keys(this.components));
        if (BG3HUD_REGISTRY.activeAdapter) {
            console.log('BG3 HUD Core | Using adapter:', BG3HUD_REGISTRY.activeAdapter.constructor?.name);
        } else {
            console.log('BG3 HUD Core | Using base containers (no adapter)');
        }
        
        // Show the UI with a smooth fade-in now that everything is built
        if (this.element) {
            // Remove building/fading classes and hidden class
            this.element.classList.remove('bg3-hud-building', 'bg3-hud-hidden', 'bg3-hud-fading-out');
            // Use a small delay to ensure the DOM has fully rendered
            requestAnimationFrame(() => {
                this.element.classList.add('bg3-hud-visible');
            });
        }
        
        if (BG3HUD_REGISTRY.activeAdapter) {
            console.log('BG3 HUD Core | Using adapter:', BG3HUD_REGISTRY.activeAdapter.constructor?.name);
        } else {
            console.log('BG3 HUD Core | Using base containers (no adapter)');
        }
        
        // Show the UI with a smooth fade-in now that everything is built
        if (this.element) {
            // Remove building class and hidden class
            this.element.classList.remove('bg3-hud-building', 'bg3-hud-hidden');
            // Use a small delay to ensure the DOM has fully rendered
            requestAnimationFrame(() => {
                this.element.classList.add('bg3-hud-visible');
            });
        }
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

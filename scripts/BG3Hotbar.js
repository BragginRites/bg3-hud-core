import { BG3HUD_REGISTRY } from './utils/registry.js';
import { applyMacrobarCollapseSetting } from './utils/settings.js';
import { DragDropManager } from './managers/DragDropManager.js';
import { PersistenceManager } from './managers/PersistenceManager.js';
import { InteractionCoordinator } from './managers/InteractionCoordinator.js';
import { UpdateCoordinator } from './managers/UpdateCoordinator.js';
import { ComponentFactory } from './managers/ComponentFactory.js';

/**
 * BG3 Hotbar Application
 * Main HUD application shell - delegates to specialized managers
 */
export class BG3Hotbar extends foundry.applications.api.ApplicationV2 {
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
     * Create a new BG3Hotbar
     */
    constructor(options = {}) {
        super(options);
        
        this.components = {};
        this.currentToken = null;
        this.currentActor = null;
        
        // Initialize managers
        this.persistenceManager = new PersistenceManager();
        this.dragDropManager = new DragDropManager();
        this.componentFactory = new ComponentFactory(this);
        this.interactionCoordinator = new InteractionCoordinator({
            hotbarApp: this,
            persistenceManager: this.persistenceManager,
            dragDropManager: this.dragDropManager,
            get adapter() { return BG3HUD_REGISTRY.activeAdapter; }
        });
        this.updateCoordinator = new UpdateCoordinator({
            hotbarApp: this,
            persistenceManager: this.persistenceManager
        });

        // Register Foundry hooks via coordinator
        this.updateCoordinator.registerHooks();
    }

    /**
     * Apply macrobar collapse setting
     * Public method that can be called from settings onChange
     */
    applyMacrobarCollapseSetting() {
        applyMacrobarCollapseSetting();
    }

    /**
     * Refresh the hotbar (re-render)
     */
    async refresh() {
        if (!this.rendered) return;
        await this.render(false);
    }

    /**
     * Prepare rendering context data
     * @param {Object} options - Render options
     * @returns {Promise<Object>} Render context
     */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        return context;
    }

    /**
     * Render the application's HTML
     * @param {Object} context - Render context
     * @param {Object} options - Render options
     * @returns {Promise<string>}
     */
    async _renderHTML(context, options) {
        const template = 'modules/bg3-hud-core/templates/bg3-hud.hbs';
        const html = await renderTemplate(template, context);
        return html;
    }

    /**
     * Replace the application's HTML
     * @param {HTMLElement} result - The rendered HTML
     * @param {HTMLElement} content - The content element
     * @param {Object} options - Render options
     */
    _replaceHTML(result, content, options) {
        content.innerHTML = result;
    }

    /**
     * Actions after rendering
     * @param {Object} context - Render context
     * @param {Object} options - Render options
     */
    async _onRender(context, options) {
        await super._onRender(context, options);
        
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

        // Create quick access container from UNIFIED state
        this.components.quickAccess = await this.componentFactory.createQuickAccessContainer(state.quickAccess, handlers);
        weaponQuickWrapper.appendChild(await this.components.quickAccess.render());

        // Create hotbar container from UNIFIED state
        this.components.hotbar = await this.componentFactory.createHotbarContainer(state.hotbar.grids, handlers);
        container.appendChild(await this.components.hotbar.render());
        
        // Create control container
        this.components.controls = await this.componentFactory.createControlContainer();
        this.components.hotbar.element.appendChild(await this.components.controls.render());
        
        // Configure drag/drop manager
        if (BG3HUD_REGISTRY.activeAdapter) {
            this.dragDropManager.setAdapter(BG3HUD_REGISTRY.activeAdapter);
            this.interactionCoordinator.setAdapter(BG3HUD_REGISTRY.activeAdapter);
        }
        this.dragDropManager.setPersistenceManager(this.persistenceManager);

        console.log('BG3 HUD Core | Components initialized:', Object.keys(this.components));
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

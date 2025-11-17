/**
 * BG3 HUD Component Registry
 * Central storage for system adapter registrations
 */
export const BG3HUD_REGISTRY = {
    // Main container classes registered by adapters
    portraitContainer: null,
    passivesContainer: null,
    actionContainer: null,
    abilityContainer: null,
    actionButtonsContainer: null,
    filterContainer: null,
    weaponSetContainer: null,
    infoContainer: null,
    
    // Additional containers registered by adapters (e.g., rest/turn, weapon)
    containers: {},
    
    // System adapters
    adapters: [],
    
    // Active adapter (based on current game system)
    activeAdapter: null,
    
    // Tooltip manager instance
    tooltipManager: null,
    
    // Menu builders registered by adapters
    menuBuilders: {}
};

/**
 * BG3 HUD API
 * Methods for system adapters to register components
 */
export const BG3HUD_API = {
    /**
     * Register a portrait container class
     * @param {Class} containerClass - Class that extends PortraitContainer
     */
    registerPortraitContainer(containerClass) {
        console.log('BG3 HUD Core | Registering portrait container:', containerClass.name);
        BG3HUD_REGISTRY.portraitContainer = containerClass;
    },

    /**
     * Register a passives container class
     * @param {Class} containerClass - Class that extends PassivesContainer
     */
    registerPassivesContainer(containerClass) {
        console.log('BG3 HUD Core | Registering passives container:', containerClass.name);
        BG3HUD_REGISTRY.passivesContainer = containerClass;
    },

    /**
     * Register an action container class
     * @param {Class} containerClass - Class that extends ActionContainer
     */
    registerActionContainer(containerClass) {
        console.log('BG3 HUD Core | Registering action container:', containerClass.name);
        BG3HUD_REGISTRY.actionContainer = containerClass;
    },

    /**
     * Register an ability container class
     * @param {Class} containerClass - Class that extends AbilityContainer
     */
    registerAbilityContainer(containerClass) {
        console.log('BG3 HUD Core | Registering ability container:', containerClass.name);
        BG3HUD_REGISTRY.abilityContainer = containerClass;
    },

    /**
     * Register an action buttons container class
     * @param {Class} containerClass - Class that extends ActionButtonsContainer
     */
    registerActionButtonsContainer(containerClass) {
        console.log('BG3 HUD Core | Registering action buttons container:', containerClass.name);
        BG3HUD_REGISTRY.actionButtonsContainer = containerClass;
    },

    /**
     * Register a filter container class
     * @param {Class} containerClass - Class that extends FilterContainer
     */
    registerFilterContainer(containerClass) {
        console.log('BG3 HUD Core | Registering filter container:', containerClass.name);
        BG3HUD_REGISTRY.filterContainer = containerClass;
    },

    /**
     * Register a weapon set container class
     * @param {Class} containerClass - Class that extends WeaponSetContainer
     */
    registerWeaponSetContainer(containerClass) {
        console.log('BG3 HUD Core | Registering weapon set container:', containerClass.name);
        BG3HUD_REGISTRY.weaponSetContainer = containerClass;
    },

    /**
     * Register an info container class
     * @param {Class} containerClass - Class that extends InfoContainer
     */
    registerInfoContainer(containerClass) {
        console.log('BG3 HUD Core | Registering info container:', containerClass.name);
        BG3HUD_REGISTRY.infoContainer = containerClass;
    },

    /**
     * Register a container class
     * @param {string} id - Container identifier (e.g., 'restTurn', 'weapon')
     * @param {Class} containerClass - Container class
     */
    registerContainer(id, containerClass) {
        console.log(`BG3 HUD Core | Registering container '${id}':`, containerClass.name);
        BG3HUD_REGISTRY.containers[id] = containerClass;
    },

    /**
     * Register a system adapter
     * @param {Object} adapter - System adapter instance
     * @param {string} adapter.MODULE_ID - Required: The module ID (e.g., 'bg3-hud-dnd5e')
     * @param {string} adapter.systemId - Required: The Foundry system ID (e.g., 'dnd5e')
     * @param {string} [adapter.name] - Optional: Display name for the adapter
     */
    registerAdapter(adapter) {
        // Validate required properties
        if (!adapter.MODULE_ID) {
            console.error('BG3 HUD Core | Adapter missing required MODULE_ID property:', adapter);
            return;
        }
        if (!adapter.systemId) {
            console.error('BG3 HUD Core | Adapter missing required systemId property:', adapter);
            return;
        }
        
        console.log('BG3 HUD Core | Registering adapter:', adapter.constructor.name);
        BG3HUD_REGISTRY.adapters.push(adapter);
        
        // Set as active if it matches current system
        if (adapter.systemId === game.system.id) {
            BG3HUD_REGISTRY.activeAdapter = adapter;
            console.log('BG3 HUD Core | Active adapter set:', adapter.constructor.name);
        }
    },

    /**
     * Get the component registry
     * @returns {Object} The registry object
     */
    getRegistry() {
        return BG3HUD_REGISTRY;
    },

    /**
     * Get the active system adapter
     * @returns {Object|null} The active adapter or null
     */
    getActiveAdapter() {
        return BG3HUD_REGISTRY.activeAdapter;
    },

    /**
     * Register a tooltip renderer for a system
     * @param {string} systemId - System ID (e.g., 'dnd5e', 'pf2e', 'dc20rpg')
     * @param {Function} renderer - Renderer function that returns tooltip content
     * @param {Object} renderer.data - Data object (item, spell, etc.)
     * @param {Object} renderer.options - Rendering options
     * @returns {Promise<Object>} Object with { content: string|HTMLElement, classes?: string[], direction?: string }
     * 
     * @example
     * BG3HUD_API.registerTooltipRenderer('dnd5e', async (data, options) => {
     *   const html = await renderTemplate('path/to/template.hbs', data);
     *   return {
     *     content: html,
     *     classes: ['item-tooltip', 'spell-tooltip'],
     *     direction: 'UP'
     *   };
     * });
     */
    registerTooltipRenderer(systemId, renderer) {
        if (!BG3HUD_REGISTRY.tooltipManager) {
            console.error('BG3 HUD Core | TooltipManager not initialized. Call BG3HUD_API.setTooltipManager() first.');
            return;
        }
        BG3HUD_REGISTRY.tooltipManager.registerRenderer(systemId, renderer);
    },

    /**
     * Set the tooltip manager instance
     * @param {TooltipManager} tooltipManager - TooltipManager instance
     */
    setTooltipManager(tooltipManager) {
        BG3HUD_REGISTRY.tooltipManager = tooltipManager;
        console.log('BG3 HUD Core | TooltipManager registered');
    },

    /**
     * Get the tooltip manager instance
     * @returns {TooltipManager|null} The tooltip manager or null
     */
    getTooltipManager() {
        return BG3HUD_REGISTRY.tooltipManager;
    },

    /**
     * Register a menu builder for a system
     * @param {string} systemId - System ID (e.g., 'dnd5e', 'pf2e', 'dc20rpg')
     * @param {Class} builderClass - MenuBuilder class (or subclass)
     * @param {Object} [options] - Options for the menu builder
     * @param {Object} [options.adapter] - Adapter instance to pass to builder
     * 
     * @example
     * import { DnD5eMenuBuilder } from './components/menus/DnD5eMenuBuilder.js';
     * BG3HUD_API.registerMenuBuilder('dnd5e', DnD5eMenuBuilder, { adapter: this });
     */
    registerMenuBuilder(systemId, builderClass, options = {}) {
        console.log(`BG3 HUD Core | Registering menu builder for system '${systemId}':`, builderClass.name);
        
        // Create builder instance with adapter if provided
        const builder = new builderClass({ adapter: options.adapter || null });
        BG3HUD_REGISTRY.menuBuilders[systemId] = builder;
    },

    /**
     * Get the menu builder for a system
     * @param {string} [systemId] - System ID (defaults to current game system)
     * @returns {MenuBuilder|null} The menu builder or null
     */
    getMenuBuilder(systemId = null) {
        const targetSystemId = systemId || game.system.id;
        return BG3HUD_REGISTRY.menuBuilders[targetSystemId] || null;
    }
};

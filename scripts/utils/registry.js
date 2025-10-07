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
    activeAdapter: null
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
     */
    registerAdapter(adapter) {
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
    }
};

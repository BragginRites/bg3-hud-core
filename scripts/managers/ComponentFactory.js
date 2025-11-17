import { BG3HUD_REGISTRY } from '../utils/registry.js';

/**
 * Component Factory
 * Creates components with proper adapter integration
 * Single place for component instantiation logic
 * Follows the Argon pattern: core provides base, adapters provide extensions
 */
export class ComponentFactory {
    constructor(hotbarApp) {
        this.hotbarApp = hotbarApp;
    }

    /**
     * Create portrait container
     * Uses adapter implementation if available, otherwise base
     * @returns {Promise<PortraitContainer>}
     */
    async createPortraitContainer() {
        const { PortraitContainer } = await import('../components/containers/PortraitContainer.js');
        
        // Use adapter portrait if available (follows Argon pattern)
        const PortraitClass = BG3HUD_REGISTRY.portraitContainer || PortraitContainer;
        
        return new PortraitClass({
            actor: this.hotbarApp.currentActor,
            token: this.hotbarApp.currentToken
        });
    }

    /**
     * Create weapon sets container
     * Uses adapter implementation if available, otherwise base
     * @param {Array} weaponSetsData - Array of weapon set grid data
     * @param {Object} handlers - Interaction handlers
     * @returns {Promise<WeaponSetContainer>}
     */
    async createWeaponSetsContainer(weaponSetsData, handlers) {
        const { WeaponSetContainer } = await import('../components/containers/WeaponSetContainer.js');
        
        // Use adapter weapon set container if available (follows Argon pattern)
        const WeaponSetClass = BG3HUD_REGISTRY.weaponSetContainer || WeaponSetContainer;
        
        // Bind decorateCellElement to maintain adapter context
        const adapter = BG3HUD_REGISTRY.activeAdapter;
        const decorateCellElement = adapter?.decorateCellElement 
            ? adapter.decorateCellElement.bind(adapter) 
            : undefined;
        
        return new WeaponSetClass({
            actor: this.hotbarApp.currentActor,
            token: this.hotbarApp.currentToken,
            weaponSets: weaponSetsData,
            persistenceManager: this.hotbarApp.persistenceManager,
            decorateCellElement: decorateCellElement,
            hotbarApp: this.hotbarApp,
            ...handlers
        });
    }

    /**
     * Create quick access container
     * @param {Object} quickAccessData - Quick access grid data
     * @param {Object} handlers - Interaction handlers
     * @returns {Promise<QuickAccessContainer>}
     */
    async createQuickAccessContainer(quickAccessData, handlers) {
        const { QuickAccessContainer } = await import('../components/containers/QuickAccessContainer.js');
        
        // Bind decorateCellElement to maintain adapter context
        const adapter = BG3HUD_REGISTRY.activeAdapter;
        const decorateCellElement = adapter?.decorateCellElement 
            ? adapter.decorateCellElement.bind(adapter) 
            : undefined;
        
        return new QuickAccessContainer({
            actor: this.hotbarApp.currentActor,
            token: this.hotbarApp.currentToken,
            grids: quickAccessData?.grids ?? [quickAccessData],
            persistenceManager: this.hotbarApp.persistenceManager,
            decorateCellElement: decorateCellElement,
            ...handlers
        });
    }

    /**
     * Create hotbar container
     * @param {Array} gridsData - Array of grid data objects
     * @param {Object} handlers - Interaction handlers
     * @returns {Promise<HotbarContainer>}
     */
    async createHotbarContainer(gridsData, handlers) {
        const { HotbarContainer } = await import('../components/containers/HotbarContainer.js');
        
        // Bind decorateCellElement to maintain adapter context
        const adapter = BG3HUD_REGISTRY.activeAdapter;
        const decorateCellElement = adapter?.decorateCellElement 
            ? adapter.decorateCellElement.bind(adapter) 
            : undefined;
        
        return new HotbarContainer({
            grids: gridsData,
            actor: this.hotbarApp.currentActor,
            token: this.hotbarApp.currentToken,
            hotbarApp: this.hotbarApp,
            decorateCellElement: decorateCellElement,
            ...handlers
        });
    }

    /**
     * Create action buttons container
     * Uses adapter implementation if available, otherwise returns null
     * @returns {Promise<ActionButtonsContainer|null>}
     */
    async createActionButtonsContainer() {
        const { ActionButtonsContainer } = await import('../components/containers/ActionButtonsContainer.js');
        
        // Check if adapter provides an action buttons container class
        const ActionButtonsClass = BG3HUD_REGISTRY.actionButtonsContainer || ActionButtonsContainer;
        
        // Only create if we have an actor and either:
        // 1. Adapter registered a custom class, or
        // 2. Adapter provides a getActionButtons method
        const adapter = BG3HUD_REGISTRY.activeAdapter;
        if (!this.hotbarApp.currentActor) return null;
        if (!adapter?.getActionButtons && ActionButtonsClass === ActionButtonsContainer) return null;
        
        return new ActionButtonsClass({
            actor: this.hotbarApp.currentActor,
            token: this.hotbarApp.currentToken,
            getButtons: adapter?.getActionButtons ? () => adapter.getActionButtons() : undefined
        });
    }

    /**
     * Create filter container
     * Uses adapter implementation if available, otherwise returns null
     * @returns {Promise<FilterContainer|null>}
     */
    async createFilterContainer() {
        const { FilterContainer } = await import('../components/containers/FilterContainer.js');
        
        // Check if adapter provides a filter container class
        const FilterClass = BG3HUD_REGISTRY.filterContainer;
        
        // Only create if adapter registered a custom class and we have an actor
        if (!this.hotbarApp.currentActor || !FilterClass) return null;
        
        return new FilterClass({
            actor: this.hotbarApp.currentActor,
            token: this.hotbarApp.currentToken
        });
    }

    /**
     * Create control container
     * @returns {Promise<ControlContainer>}
     */
    async createControlContainer() {
        const { ControlContainer } = await import('../components/containers/ControlContainer.js');
        
        return new ControlContainer({
            hotbarApp: this.hotbarApp
        });
    }

    /**
     * Create info container
     * Uses adapter implementation if available, otherwise returns null
     * @returns {Promise<InfoContainer|null>}
     */
    async createInfoContainer() {
        const { InfoContainer } = await import('../components/containers/InfoContainer.js');
        
        // Check if adapter provides an info container class
        const InfoClass = BG3HUD_REGISTRY.infoContainer;
        
        // Only create if adapter registered a custom class and we have an actor
        if (!this.hotbarApp.currentActor || !InfoClass) return null;
        
        return new InfoClass({
            actor: this.hotbarApp.currentActor,
            token: this.hotbarApp.currentToken
        });
    }

    /**
     * Create situational bonuses container
     * Uses adapter implementation if available, otherwise returns null
     * @returns {Promise<BG3Component|null>}
     */
    async createSituationalBonusesContainer() {
        // Check if adapter provides a situational bonuses container class
        const SituationalBonusesClass = BG3HUD_REGISTRY.containers['situationalBonuses'];
        
        // Only create if adapter registered a custom class and we have an actor
        if (!this.hotbarApp.currentActor || !SituationalBonusesClass) return null;
        
        return new SituationalBonusesClass({
            actor: this.hotbarApp.currentActor,
            token: this.hotbarApp.currentToken
        });
    }
}


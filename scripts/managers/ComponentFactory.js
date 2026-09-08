import { BG3HUD_API, BG3HUD_REGISTRY } from '../utils/registry.js';

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
     * Ids of optional containers currently registered for a region.
     * @param {'left'|'center'} [region='left']
     * @returns {string[]}
     */
    getRegisteredContainerIds(region = 'left') {
        return BG3HUD_API.getRegisteredContainers(region).map((e) => e.id);
    }

    /**
     * Create portrait container
     * Uses adapter implementation if available, otherwise base
     * @returns {Promise<PortraitContainer>}
     */
    async createPortraitContainer() {
        const { PortraitContainer } = await import('../components/containers/PortraitContainer.js');
        
        const PortraitClass = BG3HUD_API.getNamedHudPart('portrait') || PortraitContainer;
        
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
        
        const WeaponSetClass = BG3HUD_API.getNamedHudPart('weaponSet') || WeaponSetContainer;
        
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

        const actor = this.hotbarApp.currentActor;
        const token = this.hotbarApp.currentToken;
        const housed = actor ? await this._createHotbarHousedParts(actor, token) : {};
        
        return new HotbarContainer({
            grids: gridsData,
            actor,
            token,
            hotbarApp: this.hotbarApp,
            decorateCellElement: decorateCellElement,
            ...housed,
            ...handlers
        });
    }

    /**
     * Passives and Active effects: named HUD parts Core may house on the Hotbar.
     * @private
     */
    async _createHotbarHousedParts(actor, token) {
        const ActiveEffectsClass = BG3HUD_API.getNamedHudPart('activeEffects');
        const PassivesClass = BG3HUD_API.getNamedHudPart('passives');

        return {
            activeEffectsContainer: ActiveEffectsClass ? new ActiveEffectsClass({ actor, token }) : null,
            passivesContainer: PassivesClass ? new PassivesClass({ actor, token }) : null
        };
    }

    /**
     * Housing for Rest and End turn. Core fills End turn. Adapter rest fill is optional.
     * @returns {Promise<ActionButtonsContainer|null>}
     */
    async createActionButtonsContainer() {
        const { ActionButtonsContainer } = await import('../components/containers/ActionButtonsContainer.js');
        
        const actor = this.hotbarApp.currentActor;
        if (!actor) return null;

        const restFill = BG3HUD_API.getNamedHudPart('rest');
        return new ActionButtonsContainer({
            actor,
            token: this.hotbarApp.currentToken,
            hotbarApp: this.hotbarApp,
            getRests: typeof restFill === 'function'
                ? () => restFill({
                    actor: this.hotbarApp.currentActor,
                    token: this.hotbarApp.currentToken
                }) || []
                : () => []
        });
    }

    /**
     * Create filter container
     * Uses adapter implementation if available, otherwise returns null
     * @returns {Promise<FilterContainer|null>}
     */
    async createFilterContainer() {
        const FilterClass = BG3HUD_API.getNamedHudPart('filter');
        
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
        const InfoClass = BG3HUD_API.getNamedHudPart('characterInfo');
        
        // Only create if adapter registered a custom class and we have an actor
        if (!this.hotbarApp.currentActor || !InfoClass) return null;
        
        return new InfoClass({
            actor: this.hotbarApp.currentActor,
            token: this.hotbarApp.currentToken
        });
    }

    /**
     * Create all optional containers registered for a layout region.
     * Adapters register via BG3HUD_API.registerContainer(id, Class, { region, order }).
     * @param {'left'|'center'} [region='left']
     * @returns {Promise<Array<{ id: string, component: object }>>}
     */
    async createRegisteredContainers(region = 'left') {
        if (!this.hotbarApp.currentActor) return [];

        const created = [];
        for (const entry of BG3HUD_API.getRegisteredContainers(region)) {
            const component = new entry.ContainerClass({
                actor: this.hotbarApp.currentActor,
                token: this.hotbarApp.currentToken
            });
            created.push({ id: entry.id, component });
        }
        return created;
    }
}


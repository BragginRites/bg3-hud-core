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
     * @param {Array} weaponSetsData - Array of weapon set grid data
     * @param {Object} handlers - Interaction handlers
     * @returns {Promise<WeaponSetContainer>}
     */
    async createWeaponSetsContainer(weaponSetsData, handlers) {
        const { WeaponSetContainer } = await import('../components/containers/WeaponSetContainer.js');
        
        return new WeaponSetContainer({
            actor: this.hotbarApp.currentActor,
            token: this.hotbarApp.currentToken,
            weaponSets: weaponSetsData,
            persistenceManager: this.hotbarApp.persistenceManager,
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
        
        return new QuickAccessContainer({
            actor: this.hotbarApp.currentActor,
            token: this.hotbarApp.currentToken,
            gridData: quickAccessData,
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
        
        return new HotbarContainer({
            grids: gridsData,
            actor: this.hotbarApp.currentActor,
            token: this.hotbarApp.currentToken,
            ...handlers
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
}


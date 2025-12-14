import { BG3Component } from '../BG3Component.js';
import { ContextMenu } from '../ui/ContextMenu.js';
import { BG3HUD_API } from '../../utils/registry.js';
import { PortraitDataResolver } from '../../utils/PortraitDataResolver.js';

/**
 * Portrait Container - Abstract Base Class
 * Displays character portrait and system-specific features
 * 
 * System adapters should extend this class to provide:
 * - Portrait image logic
 * - Health/resource display
 * - System-specific features (death saves, stamina, etc.)
 * 
 * @abstract
 */
export class PortraitContainer extends BG3Component {
    /**
     * Create a new portrait panel
     * @param {Object} options - Panel configuration
     * @param {Actor} options.actor - The actor to display
     * @param {Token} options.token - The token to display
     * @param {InfoContainer} options.infoContainer - Info container instance (optional)
     */
    constructor(options = {}) {
        super(options);
        this.actor = options.actor;
        this.token = options.token;
        this.infoContainer = options.infoContainer || null;
    }

    /**
     * Render the portrait panel
     * Base implementation displays the token image
     * System adapters should override to add health, resources, etc.
     * 
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        // Create portrait container
        this.element = this.createElement('div', ['bg3-portrait-container']);

        if (!this.token) {
            console.warn('PortraitContainer | No token provided');
            return this.element;
        }

        // Add info container if provided (positioned above portrait)
        if (this.infoContainer) {
            const infoElement = await this.infoContainer.render();
            this.element.appendChild(infoElement);
        }

        // Create portrait image container
        const imageContainer = this.createElement('div', ['portrait-image-container']);
        const imageSubContainer = this.createElement('div', ['portrait-image-subcontainer']);

        // Get token image
        const imageSrc = this.token.document.texture.src;
        const img = this.createElement('img', ['portrait-image']);
        img.src = imageSrc;
        img.alt = this.actor?.name || 'Portrait';

        imageSubContainer.appendChild(img);
        imageContainer.appendChild(imageSubContainer);

        // Add portrait data badges if enabled
        await this._renderPortraitData(imageContainer);

        this.element.appendChild(imageContainer);

        // Register context menu for portrait image
        this._registerPortraitMenu(imageContainer);

        return this.element;
    }

    /**
     * Render portrait data badges
     * @param {HTMLElement} container - The portrait image container
     * @private
     */
    async _renderPortraitData(container) {
        const MODULE_ID = 'bg3-hud-core';

        // Check if feature is enabled
        if (!game.settings.get(MODULE_ID, 'showPortraitData')) {
            return;
        }

        // Get config, fall back to adapter defaults if empty
        let config = game.settings.get(MODULE_ID, 'portraitDataConfig') || [];

        // If user hasn't configured anything, try to get adapter defaults
        if (!config.length || !config.some(c => c?.path)) {
            const adapter = BG3HUD_API.getActiveAdapter?.();
            if (adapter?.getPortraitDataDefaults) {
                config = adapter.getPortraitDataDefaults();
            }
        }

        if (!config.length || !this.actor) {
            return;
        }

        const badgesContainer = this.createElement('div', ['portrait-data-badges']);

        // Support 6 slots like bg3-inspired-hotbar
        for (let i = 0; i < config.length && i < 6; i++) {
            const slotConfig = config[i];
            if (!slotConfig?.path) continue;

            const result = await PortraitDataResolver.resolve(this.actor, slotConfig);
            if (!result.value) continue;

            const badge = this.createElement('div', ['portrait-data-badge', `position-${i}`]);
            badge.style.color = result.color || '#ffffff';

            if (result.icon) {
                const icon = this.createElement('i', result.icon.split(' '));
                badge.appendChild(icon);
            }

            const valueSpan = this.createElement('span', ['badge-value']);
            valueSpan.textContent = result.value;
            badge.appendChild(valueSpan);

            badgesContainer.appendChild(badge);
        }

        if (badgesContainer.children.length > 0) {
            container.appendChild(badgesContainer);
        }
    }

    /**
     * Update portrait data badges without full re-render
     * Called when actor data changes
     */
    async updatePortraitData() {
        const MODULE_ID = 'bg3-hud-core';

        // Find the existing badges container
        const portraitImageContainer = this.element?.querySelector('.portrait-image-container');
        if (!portraitImageContainer) return;

        // Remove existing badges
        const existingBadges = portraitImageContainer.querySelector('.portrait-data-badges');
        if (existingBadges) {
            existingBadges.remove();
        }

        // Check if feature is enabled
        if (!game.settings.get(MODULE_ID, 'showPortraitData')) {
            return;
        }

        // Get config, fall back to adapter defaults if empty
        let config = game.settings.get(MODULE_ID, 'portraitDataConfig') || [];

        // If user hasn't configured anything, try to get adapter defaults
        if (!config.length || !config.some(c => c?.path)) {
            const adapter = BG3HUD_API.getActiveAdapter?.();
            if (adapter?.getPortraitDataDefaults) {
                config = adapter.getPortraitDataDefaults();
            }
        }

        if (!config.length || !this.actor) {
            return;
        }

        const badgesContainer = this.createElement('div', ['portrait-data-badges']);

        // Support 6 slots like bg3-inspired-hotbar
        for (let i = 0; i < config.length && i < 6; i++) {
            const slotConfig = config[i];
            if (!slotConfig?.path) continue;

            const result = await PortraitDataResolver.resolve(this.actor, slotConfig);
            if (!result.value) continue;

            const badge = this.createElement('div', ['portrait-data-badge', `position-${i}`]);
            badge.style.color = result.color || '#ffffff';

            if (result.icon) {
                const icon = this.createElement('i', result.icon.split(' '));
                badge.appendChild(icon);
            }

            const valueSpan = this.createElement('span', ['badge-value']);
            valueSpan.textContent = result.value;
            badge.appendChild(valueSpan);

            badgesContainer.appendChild(badge);
        }

        if (badgesContainer.children.length > 0) {
            portraitImageContainer.appendChild(badgesContainer);
        }
    }

    /**
     * Register context menu handler for portrait image
     * @param {HTMLElement} imageContainer - The portrait image container element
     * @private
     */
    _registerPortraitMenu(imageContainer) {
        imageContainer.addEventListener('contextmenu', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await this._showPortraitMenu(event);
        });
    }

    /**
     * Show portrait menu
     * Uses adapter's MenuBuilder if available, otherwise falls back to core menu
     * @param {MouseEvent} event - The triggering event
     * @private
     */
    async _showPortraitMenu(event) {
        const menuBuilder = BG3HUD_API.getMenuBuilder();
        let menuItems = [];

        // Try to get menu items from adapter's MenuBuilder
        if (menuBuilder && typeof menuBuilder.buildPortraitMenu === 'function') {
            menuItems = await menuBuilder.buildPortraitMenu(this, event);
        }

        // Fallback to core portrait menu if adapter didn't provide items
        if (menuItems.length === 0) {
            menuItems = this._getCorePortraitMenuItems();
        }

        if (menuItems.length > 0) {
            const menu = new ContextMenu({
                items: menuItems,
                event: event,
                parent: document.body
            });
            await menu.render();
        }
    }

    /**
     * Get core portrait menu items (fallback)
     * System adapters should override via MenuBuilder.buildPortraitMenu()
     * @returns {Array} Menu items array
     * @private
     */
    _getCorePortraitMenuItems() {
        // Core implementation: basic token vs character portrait toggle
        // System adapters should provide richer menus via MenuBuilder
        return [
            {
                label: 'Use Token Image',
                icon: 'fas fa-chess-pawn',
                onClick: async () => {
                    // Override in subclass or via MenuBuilder
                    console.warn('PortraitContainer | Use Token Image not implemented');
                }
            },
            {
                label: 'Use Character Portrait',
                icon: 'fas fa-user',
                onClick: async () => {
                    // Override in subclass or via MenuBuilder
                    console.warn('PortraitContainer | Use Character Portrait not implemented');
                }
            }
        ];
    }

    /**
     * Get system-specific features to display
     * Override in subclass to add death saves, stamina, etc.
     * 
     * @abstract
     * @returns {Array<BG3Component>}
     */
    getSystemFeatures() {
        return [];
    }

    /**
     * Get portrait image URL
     * Override in subclass to implement portrait logic
     * 
     * @abstract
     * @returns {Promise<string>}
     */
    async getPortraitImage() {
        return this.actor?.img || this.token?.document?.texture?.src || '';
    }

    /**
     * Get health data
     * Override in subclass to provide system-specific health structure
     * 
     * @abstract
     * @returns {Object}
     */
    getHealth() {
        return {
            current: 0,
            max: 1,
            percent: 0,
            damage: 100
        };
    }
}


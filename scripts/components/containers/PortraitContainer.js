import { BG3Component } from '../BG3Component.js';
import { ContextMenu } from '../ui/ContextMenu.js';
import { BG3HUD_API } from '../../utils/registry.js';

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
        this.element.appendChild(imageContainer);

        // Register context menu for portrait image
        this._registerPortraitMenu(imageContainer);

        return this.element;
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

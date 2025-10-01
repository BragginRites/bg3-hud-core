import { BG3Component } from '../BG3Component.js';

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
     */
    constructor(options = {}) {
        super(options);
        this.actor = options.actor;
        this.token = options.token;
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

        console.log('PortraitContainer (base) | Rendered token image');

        return this.element;
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

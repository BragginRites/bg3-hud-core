import { BG3Component } from '../BG3Component.js';
import { ContextMenu } from '../ui/ContextMenu.js';
import { BG3HUD_API } from '../../utils/registry.js';
import { PortraitDataResolver } from '../../utils/PortraitDataResolver.js';
import { Logger } from '../../utils/logger.js';

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
    /** Media file extensions treated as animated portraits/tokens. */
    static VIDEO_EXTENSIONS = ['webm', 'mp4', 'ogg', 'ogv'];

    /**
     * Whether a media source URL points at a supported video format.
     * @param {string} src - Media source URL
     * @returns {boolean}
     */
    static isVideoSrc(src) {
        const extension = src?.split('.').pop()?.toLowerCase() || '';
        return PortraitContainer.VIDEO_EXTENSIONS.includes(extension);
    }

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
            Logger.warn('PortraitContainer | No token provided');
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
        const mediaElement = this._createMediaElement(imageSrc, this.actor?.name || 'Portrait');

        imageSubContainer.appendChild(mediaElement);
        imageContainer.appendChild(imageSubContainer);

        // Add portrait data badges if enabled
        await this._renderPortraitData(imageContainer);

        this.element.appendChild(imageContainer);

        // Apply portrait scale if enabled (adapters can override getPortraitScale)
        this._applyPortraitScale(imageSubContainer);

        // Register context menu for portrait image
        this._registerPortraitMenu(imageContainer);

        this._applyPortraitVisibility();
        this._applyPortraitBorder();

        return this.element;
    }

    /**
     * Whether the portrait image and portrait chrome should be shown
     * @returns {boolean}
     */
    _isPortraitVisible() {
        return game.settings.get('bg3-hud-core', 'showPortrait') ?? true;
    }

    /**
     * Toggle portrait visibility while keeping the info container button
     */
    _applyPortraitVisibility() {
        if (!this.element) return;
        this.element.classList.toggle('portrait-hidden', !this._isPortraitVisible());
    }

    /**
     * Apply portrait border style from client setting (none / simple / styled).
     */
    _applyPortraitBorder() {
        if (!this.element) return;
        const border = game.settings.get('bg3-hud-core', 'borderPortraitPreferences') ?? 'none';
        this.element.setAttribute('data-border', border);
    }

    /**
     * Live-update border on the rendered portrait without a full HUD rebuild.
     * @param {string} border
     */
    static applyBorderToLivePortrait(border) {
        const portrait = ui.BG3HUD_APP?.components?.portrait;
        if (portrait?.element) {
            portrait.element.setAttribute('data-border', border);
        }
    }

    /**
     * Swap portrait + info to a new controlled token without rebuilding the container shell.
     * @param {Actor} actor
     * @param {Token} token
     * @returns {Promise<HTMLElement>}
     */
    async swapTokenContext(actor, token) {
        this.actor = actor;
        this.token = token;

        if (this.infoContainer) {
            this.infoContainer.actor = actor;
            this.infoContainer.token = token;
            if (typeof this.infoContainer.update === 'function') {
                await this.infoContainer.update();
            }
        }

        const sub = this.element?.querySelector('.portrait-image-subcontainer');
        if (sub && token) {
            const src = await this.getPortraitImage();
            const isVideo = PortraitContainer.isVideoSrc(src);

            const existing = sub.querySelector('.portrait-image, .portrait-video');
            const existingIsVideo = existing?.tagName === 'VIDEO';

            if (existing && isVideo === existingIsVideo) {
                if (isVideo) {
                    existing.src = src || '';
                    try {
                        existing.load?.();
                    } catch {
                        /* ignore */
                    }
                } else {
                    existing.src = src || '';
                }
                existing.alt = this.actor?.name || 'Portrait';
            } else {
                if (existing) existing.remove();
                sub.appendChild(this._createMediaElement(src, this.actor?.name || 'Portrait'));
            }

            this._syncPortraitAlphaMask(sub);
        }

        const imageContainer = this.element?.querySelector('.portrait-image-container');
        if (imageContainer) {
            const subContainer = imageContainer.querySelector('.portrait-image-subcontainer');
            if (subContainer) {
                this._applyPortraitScale(subContainer);
            }
        }

        await this.updatePortraitData();
        if (typeof this.updateHealth === 'function') {
            await this.updateHealth();
        }

        this._applyPortraitVisibility();
        this._applyPortraitBorder();

        return this.element;
    }

    /**
     * Sync health-overlay alpha mask to the current portrait media.
     * Adapters create/remove `.health-overlay` based on system settings;
     * core only binds the mask when an image + overlay are present.
     * @param {HTMLElement} [portraitImageSubContainer]
     * @protected
     */
    _syncPortraitAlphaMask(portraitImageSubContainer = null) {
        const sub = portraitImageSubContainer
            || this.element?.querySelector('.portrait-image-subcontainer');
        if (!sub || !this.element) return;

        const media = sub.querySelector('.portrait-image, .portrait-video');
        const hasOverlay = !!sub.querySelector('.health-overlay');
        const isVideo = media?.tagName === 'VIDEO';

        if (!hasOverlay || !media || isVideo || !media.src) {
            sub.removeAttribute('data-bend-mode');
            sub.style.removeProperty('--bend-img');
            this.element.classList.remove('use-bend-mask');
            return;
        }

        sub.setAttribute('data-bend-mode', 'true');
        sub.style.setProperty('--bend-img', `url("${media.src}")`);
        this.element.classList.add('use-bend-mask');
    }

    /**
     * Create appropriate media element for portrait (img or video)
     * Supports animated tokens in webm, mp4, ogg, ogv formats
     * @param {string} src - Media source URL
     * @param {string} alt - Alt text for accessibility
     * @returns {HTMLElement} img or video element
     * @protected
     */
    _createMediaElement(src, alt = 'Portrait') {
        const isVideo = PortraitContainer.isVideoSrc(src);

        if (isVideo) {
            const video = this.createElement('video', ['portrait-image', 'portrait-video']);
            video.src = src;
            video.autoplay = true;
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            video.alt = alt;
            return video;
        } else {
            const img = this.createElement('img', ['portrait-image']);
            img.src = src;
            img.alt = alt;
            return img;
        }
    }

    /**
     * Render portrait data badges
     * @param {HTMLElement} container - The portrait image container
     * @private
     */
    async _renderPortraitData(container) {
        const MODULE_ID = 'bg3-hud-core';

        // Determine which config to use (layered hierarchy):
        // 1. Player opt-out (ignoreWorldPortraitData) → use client config
        // 2. World override active → use world config
        // 3. Otherwise → use client config
        const useWorldConfig = game.settings.get(MODULE_ID, 'useWorldPortraitData');
        const ignoreWorldConfig = game.settings.get(MODULE_ID, 'ignoreWorldPortraitData');

        // Effective mode: use world config only if active AND player hasn't opted out
        const effectivelyUsingWorld = useWorldConfig && !ignoreWorldConfig;

        // Check if feature is enabled:
        // - World config active (and not ignored) → always show
        // - Otherwise → respect client's showPortraitData setting
        if (!effectivelyUsingWorld && !game.settings.get(MODULE_ID, 'showPortraitData')) {
            return;
        }

        // Get config based on effective mode
        let config;
        if (effectivelyUsingWorld) {
            config = game.settings.get(MODULE_ID, 'portraitDataWorldConfig') || [];
        } else {
            config = game.settings.get(MODULE_ID, 'portraitDataConfig') || [];
        }

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

            // Apply separate colors for icon and text
            const iconColor = result.iconColor || result.color || '#ffffff';
            const textColor = result.textColor || result.color || '#ffffff';

            if (result.icon) {
                const icon = this.createElement('i', result.icon.split(' '));
                icon.style.color = iconColor;
                badge.appendChild(icon);
            }

            const valueSpan = this.createElement('span', ['badge-value']);
            valueSpan.textContent = result.value;
            valueSpan.style.color = textColor;
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

        // Determine which config to use (layered hierarchy):
        // 1. Player opt-out (ignoreWorldPortraitData) → use client config
        // 2. World override active → use world config
        // 3. Otherwise → use client config
        const useWorldConfig = game.settings.get(MODULE_ID, 'useWorldPortraitData');
        const ignoreWorldConfig = game.settings.get(MODULE_ID, 'ignoreWorldPortraitData');

        // Effective mode: use world config only if active AND player hasn't opted out
        const effectivelyUsingWorld = useWorldConfig && !ignoreWorldConfig;

        // Check if feature is enabled:
        // - World config active (and not ignored) → always show
        // - Otherwise → respect client's showPortraitData setting
        if (!effectivelyUsingWorld && !game.settings.get(MODULE_ID, 'showPortraitData')) {
            return;
        }

        // Get config based on effective mode
        let config;
        if (effectivelyUsingWorld) {
            config = game.settings.get(MODULE_ID, 'portraitDataWorldConfig') || [];
        } else {
            config = game.settings.get(MODULE_ID, 'portraitDataConfig') || [];
        }

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

            // Apply separate colors for icon and text (matching _renderPortraitData)
            const iconColor = result.iconColor || result.color || '#ffffff';
            const textColor = result.textColor || result.color || '#ffffff';

            if (result.icon) {
                const icon = this.createElement('i', result.icon.split(' '));
                icon.style.color = iconColor;
                badge.appendChild(icon);
            }

            const valueSpan = this.createElement('span', ['badge-value']);
            valueSpan.textContent = result.value;
            valueSpan.style.color = textColor;
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
        // Left-click opens the character sheet
        imageContainer.addEventListener('click', (event) => {
            if (event.button !== 0) return; // Only left-click
            event.preventDefault();
            event.stopPropagation();
            if (this.actor?.sheet) {
                this.actor.sheet.render(true);
            }
        });

        // Right-click shows context menu
        imageContainer.addEventListener('contextmenu', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await this._showPortraitMenu(event);
        });

        // Add cursor pointer to indicate clickability
        imageContainer.style.cursor = 'pointer';
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
                    Logger.warn('PortraitContainer | Use Token Image not implemented');
                }
            },
            {
                label: 'Use Character Portrait',
                icon: 'fas fa-user',
                onClick: async () => {
                    // Override in subclass or via MenuBuilder
                    Logger.warn('PortraitContainer | Use Character Portrait not implemented');
                }
            }
        ];
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

    /**
     * Get portrait scale configuration
     * Override in subclass to enable token-based scaling
     * 
     * @abstract
     * @returns {{enabled: boolean, scale: number}}
     */
    getPortraitScale() {
        return {
            enabled: false,
            scale: 1
        };
    }

    /**
     * Apply portrait scale with position offset
     * When scaled, portrait grows from center - offset prevents overlap with weapon sets
     * @param {HTMLElement} subContainer - The portrait image subcontainer
     * @private
     */
    _applyPortraitScale(subContainer) {
        if (!this.element) return;

        const { enabled, scale } = this.getPortraitScale();

        if (enabled && scale !== 1) {
            // Get base portrait size from CSS variable (defaults to 175px)
            const computedStyle = getComputedStyle(this.element);
            const baseSize = parseInt(computedStyle.getPropertyValue('--bg3-portrait-size')) || 175;
            const scaledSize = baseSize * scale;

            // Resize container - CSS bottom positioning keeps it anchored (expands upward)
            // CSS right:100% positioning keeps right edge anchored (expands leftward)
            this.element.style.setProperty('width', `${scaledSize}px`);
            this.element.style.setProperty('height', `${scaledSize}px`);
        } else {
            this.element.style.removeProperty('width');
            this.element.style.removeProperty('height');
        }
    }
}


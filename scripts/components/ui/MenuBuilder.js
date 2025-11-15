import { ContextMenu } from './ContextMenu.js';

/**
 * Menu Builder Base Class
 * Provides a unified interface for building context menus across containers
 * System adapters should extend this class to provide system-specific menu items
 * 
 * @abstract
 */
export class MenuBuilder {
    /**
     * Create a menu builder
     * @param {Object} options - Builder configuration
     * @param {Object} options.adapter - The system adapter instance
     */
    constructor(options = {}) {
        this.adapter = options.adapter || null;
    }

    /**
     * Build portrait menu items
     * Override in subclass to provide system-specific portrait menu options
     * 
     * @param {PortraitContainer} portraitContainer - The portrait container instance
     * @param {MouseEvent} event - The triggering event
     * @returns {Promise<Array>} Menu items array
     */
    async buildPortraitMenu(portraitContainer, event) {
        return [];
    }

    /**
     * Build ability menu items
     * Override in subclass to provide system-specific ability menu options
     * 
     * @param {AbilityContainer} abilityContainer - The ability container instance
     * @param {MouseEvent} event - The triggering event
     * @returns {Promise<Array>} Menu items array
     */
    async buildAbilityMenu(abilityContainer, event) {
        return [];
    }

    /**
     * Build settings menu items
     * Override in subclass to add system-specific settings options
     * 
     * @param {ControlContainer} controlContainer - The control container instance
     * @param {MouseEvent} event - The triggering event
     * @returns {Promise<Array>} Menu items array
     */
    async buildSettingsMenu(controlContainer, event) {
        return [];
    }

    /**
     * Build lock menu items
     * Override in subclass to add system-specific lock options
     * 
     * @param {ControlContainer} controlContainer - The control container instance
     * @param {MouseEvent} event - The triggering event
     * @returns {Promise<Array>} Menu items array
     */
    async buildLockMenu(controlContainer, event) {
        return [];
    }

    /**
     * Convert MenuContainer-style button object to ContextMenu items array
     * Helper method to convert old MenuContainer format to new ContextMenu format
     * 
     * @param {Object} buttons - Object with button keys and configs
     * @returns {Array} Menu items array
     */
    toMenuItems(buttons) {
        const items = [];
        
        for (const [key, button] of Object.entries(buttons)) {
            // Skip if visibility is false
            if (button.visibility === false) continue;
            
            // Handle divider
            if (key === 'divider' && !button.label) {
                items.push({ separator: true });
                continue;
            }

            const item = {
                key: key,
                label: button.label || '',
                icon: button.icon,
                value: button.value,
                valueStyle: button.style,
                custom: button.custom,
                onClick: button.click,
                class: button.class,
                visible: button.visibility !== false
            };

            // Convert subMenu if present
            if (button.subMenu && Array.isArray(button.subMenu)) {
                item.subMenu = button.subMenu.map(subMenuConfig => {
                    if (subMenuConfig.buttons) {
                        return {
                            buttons: subMenuConfig.buttons,
                            name: subMenuConfig.name
                        };
                    }
                    return subMenuConfig;
                });
            }

            items.push(item);
        }

        return items;
    }

    /**
     * Show a menu using ContextMenu.toggle()
     * Convenience method that wraps ContextMenu.toggle()
     * 
     * @param {Array} items - Menu items
     * @param {HTMLElement|BG3Component} parent - Parent element or component
     * @param {MouseEvent} event - The triggering event
     * @param {Object} options - Additional options (keepOpen, closeParent, etc.)
     * @returns {Promise<ContextMenu>}
     */
    async showMenu(items, parent, event, options = {}) {
        return ContextMenu.toggle(items, parent, event, options);
    }
}


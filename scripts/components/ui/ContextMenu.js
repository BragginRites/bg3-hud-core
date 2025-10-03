import { BG3Component } from '../BG3Component.js';

/**
 * Simple Context Menu
 * Displays a menu on right-click with action buttons
 * System-agnostic - adapters can add custom menu items
 */
export class ContextMenu extends BG3Component {
    /**
     * Create a context menu
     * @param {Object} options - Menu configuration
     * @param {Array} options.items - Menu items [{label, icon, onClick, visible}]
     * @param {MouseEvent} options.event - The triggering event
     * @param {HTMLElement} options.parent - Parent element to attach to
     */
    constructor(options = {}) {
        super(options);
        this.items = options.items || [];
        this.event = options.event;
        this.parent = options.parent || document.body;
    }

    /**
     * Render the context menu
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        this.element = this.createElement('div', ['bg3-context-menu']);

        // Filter visible items
        const visibleItems = this.items.filter(item => item.visible !== false);

        if (visibleItems.length === 0) {
            console.warn('BG3 HUD Core | No visible menu items');
            return this.element;
        }

        // Create menu items
        for (const item of visibleItems) {
            // Handle separators
            if (item.separator) {
                const separator = this.createElement('div', ['bg3-context-menu-separator']);
                this.element.appendChild(separator);
                continue;
            }

            const menuItem = this.createElement('div', ['bg3-context-menu-item']);
            
            if (item.icon) {
                const icon = document.createElement('i');
                // Split icon classes (e.g., "fas fa-trash" -> ["fas", "fa-trash"])
                const iconClasses = item.icon.split(' ');
                icon.classList.add(...iconClasses);
                menuItem.appendChild(icon);
            }

            const label = this.createElement('span', ['bg3-context-menu-label']);
            label.textContent = item.label;
            menuItem.appendChild(label);

            // Add click handler
            menuItem.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                if (item.onClick) {
                    await item.onClick(e);
                }
                
                this.destroy();
            });

            this.element.appendChild(menuItem);
        }

        // Position the menu
        this._positionMenu();

        // Append to parent
        this.parent.appendChild(this.element);

        // Close on click outside
        setTimeout(() => {
            document.addEventListener('click', this._onClickOutside);
            document.addEventListener('contextmenu', this._onClickOutside);
        }, 10);

        return this.element;
    }

    /**
     * Position the menu near the mouse
     * @private
     */
    _positionMenu() {
        if (!this.event) return;
    
        // Easy-to-tweak offsets
        const offsetX = 10; // distance to the right of the cursor
        const offsetY = -10; // distance below the cursor (to place the bottom edge)
    
        // Get actual menu size
        const menuRect = this.element.getBoundingClientRect();
        const menuWidth = menuRect.width || 200;
        const menuHeight = menuRect.height || (this.items.length * 40);
    
        // Position: bottom-left corner at (mouseX + offsetX, mouseY + offsetY)
        let x = this.event.clientX + offsetX;
        let y = this.event.clientY + offsetY - menuHeight;
    
        // Clamp horizontally
        if (x + menuWidth > window.innerWidth - offsetX) {
            x = window.innerWidth - menuWidth - offsetX;
        }
    
        // Clamp vertically
        if (y < offsetY) y = offsetY;
        if (y + menuHeight > window.innerHeight - offsetY) {
            y = window.innerHeight - menuHeight - offsetY;
        }
    
        this.element.style.left = `${x}px`;
        this.element.style.top = `${y}px`;
    }

    /**
     * Handle click outside menu
     * @param {MouseEvent} event - Click event
     * @private
     */
    _onClickOutside = (event) => {
        if (!this.element || !this.element.contains(event.target)) {
            this.destroy();
        }
    }

    /**
     * Destroy the menu
     */
    destroy() {
        document.removeEventListener('click', this._onClickOutside);
        document.removeEventListener('contextmenu', this._onClickOutside);
        super.destroy();
    }
}

import { BG3Component } from '../BG3Component.js';
import { BaseButton } from '../buttons/BaseButton.js';

/**
 * Control Container
 * Holds control buttons: row +/-, lock, settings
 * System-agnostic - displays vertically on the right side
 */
export class ControlContainer extends BG3Component {
    constructor(options = {}) {
        super(options);
        this.hotbarApp = options.hotbarApp; // Reference to BG3Hotbar
    }

    /**
     * Render the control container
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        if (!this.element) {
            this.element = this.createElement('div', ['bg3-control-container']);
        }

        // Create buttons
        const buttons = this._getButtons();

        for (const buttonData of buttons) {
            const button = new BaseButton(buttonData);
            await button.render();
            this.element.appendChild(button.element);
        }

        return this.element;
    }

    /**
     * Get control buttons
     * @returns {Array} Button data array
     * @private
     */
    _getButtons() {
        return [
            this._getAddRowButton(),
            this._getRemoveRowButton(),
            this._getLockButton(),
            this._getSettingsButton()
        ];
    }

    /**
     * Get add row button
     * @returns {Object} Button data
     * @private
     */
    _getAddRowButton() {
        return {
            key: 'control-plus',
            classes: ['hotbar-control-button'],
            icon: 'fa-plus',
            tooltip: 'Add Row',
            onClick: async () => {
                await this._addRow();
            }
        };
    }

    /**
     * Get remove row button
     * @returns {Object} Button data
     * @private
     */
    _getRemoveRowButton() {
        return {
            key: 'control-minus',
            classes: ['hotbar-control-button'],
            icon: 'fa-minus',
            tooltip: 'Remove Row',
            onClick: async () => {
                await this._removeRow();
            }
        };
    }

    /**
     * Get lock button
     * @returns {Object} Button data
     * @private
     */
    _getLockButton() {
        return {
            key: 'control-lock',
            classes: ['hotbar-control-button'],
            icon: 'fa-unlock', // Will be toggled to fa-lock when locked
            tooltip: 'Lock Settings<br>(Right-click for options)',
            onClick: async (event) => {
                await this._toggleLock(event);
            },
            onRightClick: async (event) => {
                await this._showLockMenu(event);
            }
        };
    }

    /**
     * Get settings button
     * @returns {Object} Button data
     * @private
     */
    _getSettingsButton() {
        return {
            key: 'control-settings',
            classes: ['hotbar-control-button'],
            icon: 'fa-cog',
            tooltip: 'Settings<br>(Right-click for quick actions)',
            onClick: async (event) => {
                await this._openModuleSettings();
            },
            onRightClick: async (event) => {
                await this._showSettingsMenu(event);
            }
        };
    }

    /**
     * Add a row to all grids
     * @private
     */
    async _addRow() {
        if (!this.hotbarApp || !this.hotbarApp.components.hotbar) {
            console.warn('BG3 HUD Core | No hotbar to add row to');
            return;
        }

        const hotbarContainer = this.hotbarApp.components.hotbar;
        
        // Add row to each grid data
        for (let i = 0; i < hotbarContainer.grids.length; i++) {
            hotbarContainer.grids[i].rows++;
        }

        // Update each grid container individually (no full re-render)
        for (let i = 0; i < hotbarContainer.gridContainers.length; i++) {
            const gridContainer = hotbarContainer.gridContainers[i];
            gridContainer.rows = hotbarContainer.grids[i].rows;
            await gridContainer.render();
        }

        // Save to persistence - update each grid's config
        for (let i = 0; i < hotbarContainer.grids.length; i++) {
            await this.hotbarApp.persistenceManager.updateGridConfig(i, {
                rows: hotbarContainer.grids[i].rows
            });
        }
    }

    /**
     * Remove a row from all grids
     * @private
     */
    async _removeRow() {
        if (!this.hotbarApp || !this.hotbarApp.components.hotbar) {
            console.warn('BG3 HUD Core | No hotbar to remove row from');
            return;
        }

        const hotbarContainer = this.hotbarApp.components.hotbar;
        
        // Check if we can remove a row (minimum 1 row)
        if (hotbarContainer.grids[0].rows <= 1) {
            return;
        }

        // Remove row from each grid data
        for (let i = 0; i < hotbarContainer.grids.length; i++) {
            hotbarContainer.grids[i].rows--;
        }

        // Update each grid container individually (no full re-render)
        for (let i = 0; i < hotbarContainer.gridContainers.length; i++) {
            const gridContainer = hotbarContainer.gridContainers[i];
            gridContainer.rows = hotbarContainer.grids[i].rows;
            await gridContainer.render();
        }

        // Save to persistence - update each grid's config
        for (let i = 0; i < hotbarContainer.grids.length; i++) {
            await this.hotbarApp.persistenceManager.updateGridConfig(i, {
                rows: hotbarContainer.grids[i].rows
            });
        }
    }

    /**
     * Toggle master lock
     * @param {MouseEvent} event - Click event
     * @private
     */
    async _toggleLock(event) {
        // TODO: Implement lock toggle logic
        // For now, just show a message
        ui.notifications.info('Lock toggle - to be implemented');
    }

    /**
     * Show lock settings menu
     * @param {MouseEvent} event - Right-click event
     * @private
     */
    async _showLockMenu(event) {
        event.preventDefault();
        
        const { ContextMenu } = await import('../ui/ContextMenu.js');

        const menuItems = [
            {
                label: 'Deselecting Token',
                icon: 'fas fa-user-slash',
                onClick: () => {
                    // TODO: Implement lock setting toggle
                    ui.notifications.info('Deselect lock - to be implemented');
                }
            },
            {
                label: 'Opacity',
                icon: 'fas fa-eye',
                onClick: () => {
                    // TODO: Implement lock setting toggle
                    ui.notifications.info('Opacity lock - to be implemented');
                }
            },
            {
                label: 'Drag & Drop',
                icon: 'fas fa-arrows-alt',
                onClick: () => {
                    // TODO: Implement lock setting toggle
                    ui.notifications.info('Drag & Drop lock - to be implemented');
                }
            }
        ];

        const menu = new ContextMenu({
            items: menuItems,
            event: event,
            parent: document.body
        });

        await menu.render();
    }

    /**
     * Open module settings in Foundry's settings window
     * @private
     */
    async _openModuleSettings() {
        // Open the Foundry settings window
        const menu = game.settings.menus.get('bg3-hud-core.settingsMenu');
        if (menu) {
            // If there's a registered settings menu, open it
            const app = new menu.type();
            app.render(true);
        } else {
            // Otherwise, open the module configuration directly
            const setting = game.settings.settings.get('bg3-hud-core');
            if (setting) {
                new SettingsConfig().render(true, {
                    filter: 'bg3-hud-core'
                });
            } else {
                // Fallback: open general settings
                new SettingsConfig().render(true);
            }
        }
    }

    /**
     * Show settings menu (right-click context menu)
     * @param {MouseEvent} event - Click event
     * @private
     */
    async _showSettingsMenu(event) {
        const { ContextMenu } = await import('../ui/ContextMenu.js');

        const menuItems = [
            {
                label: 'Reset Layout',
                icon: 'fas fa-rotate',
                onClick: async () => {
                    await this._resetLayout();
                }
            },
            {
                label: 'Clear All Items',
                icon: 'fas fa-trash',
                onClick: async () => {
                    await this._clearAllItems();
                }
            },
            {
                label: 'Export Layout',
                icon: 'fas fa-file-export',
                onClick: () => {
                    this._exportLayout();
                }
            },
            {
                label: 'Import Layout',
                icon: 'fas fa-file-import',
                onClick: () => {
                    this._importLayout();
                }
            }
        ];

        const menu = new ContextMenu({
            items: menuItems,
            event: event,
            parent: document.body
        });

        await menu.render();
    }

    /**
     * Reset layout to defaults
     * @private
     */
    async _resetLayout() {
        if (!this.hotbarApp) return;

        const hotbarContainer = this.hotbarApp.components.hotbar;
        
        // Get default configuration from persistence manager
        const defaultConfig = this.hotbarApp.persistenceManager.DEFAULT_GRID_CONFIG;
        
        // Reset all grids to default size
        for (let i = 0; i < hotbarContainer.grids.length; i++) {
            hotbarContainer.grids[i].rows = defaultConfig.rows;
            hotbarContainer.grids[i].cols = defaultConfig.cols;
        }

        // Update each grid container individually
        for (let i = 0; i < hotbarContainer.gridContainers.length; i++) {
            const gridContainer = hotbarContainer.gridContainers[i];
            gridContainer.rows = defaultConfig.rows;
            gridContainer.cols = defaultConfig.cols;
            gridContainer.element.style.display = ''; // Ensure it's visible
            await gridContainer.render();
        }

        // Save to persistence - update each grid's config
        for (let i = 0; i < hotbarContainer.grids.length; i++) {
            await this.hotbarApp.persistenceManager.updateGridConfig(i, {
                rows: defaultConfig.rows,
                cols: defaultConfig.cols
            });
        }
    }

    /**
     * Clear all items from ALL containers (hotbar, weapon sets, quick access)
     * Seamless update: clear persistence then update each container in place
     * @private
     */
    async _clearAllItems() {
        if (!this.hotbarApp) return;

        try {
            // Centralized clear: use PersistenceManager to clear everything
            await this.hotbarApp.persistenceManager.clearAll();

            // Seamless update: update each container in place (no full refresh)
            const updates = [];

            // Clear hotbar grids
            const hotbarContainer = this.hotbarApp.components.hotbar;
            if (hotbarContainer) {
                for (let i = 0; i < hotbarContainer.gridContainers.length; i++) {
                    const gridContainer = hotbarContainer.gridContainers[i];
                    gridContainer.items = {};
                    updates.push(gridContainer.render());
                }
            }

            // Clear weapon sets
            const weaponSetsContainer = this.hotbarApp.components.weaponSets;
            if (weaponSetsContainer) {
                for (let i = 0; i < weaponSetsContainer.gridContainers.length; i++) {
                    const gridContainer = weaponSetsContainer.gridContainers[i];
                    gridContainer.items = {};
                    updates.push(gridContainer.render());
                }
            }

            // Clear quick access
            const quickAccessContainer = this.hotbarApp.components.quickAccess;
            if (quickAccessContainer?.gridContainers[0]) {
                const gridContainer = quickAccessContainer.gridContainers[0];
                gridContainer.items = {};
                updates.push(gridContainer.render());
            }

            // Wait for all updates in parallel
            await Promise.all(updates);

        } catch (error) {
            console.error('BG3 HUD Core | Failed to clear all items:', error);
            ui.notifications.error('Failed to clear all items');
        }
    }

    /**
     * Export layout as JSON (ALL PANELS by default)
     * Includes hotbar, weapon sets, active set index, and quick access
     * @private
     */
    _exportLayout() {
        if (!this.hotbarApp) return;

        const actor = this.hotbarApp.currentActor;
        const token = this.hotbarApp.currentToken;

        // Gather data from unified state
        const state = this.hotbarApp.persistenceManager.getState();
        const hotbar = state?.hotbar?.grids || [];
        const weaponSets = state?.weaponSets?.sets || [];
        const activeWeaponSet = state?.weaponSets?.activeSet ?? 0;
        const quickAccess = state?.quickAccess || { rows: 2, cols: 3, items: {} };

        const exportPayload = {
            meta: {
                module: 'bg3-hud-core',
                version: 'prototype',
                timestamp: new Date().toISOString(),
                actorUuid: actor?.uuid || null,
                tokenId: token?.id || null
            },
            hotbar,
            weaponSets,
            activeWeaponSet,
            quickAccess
        };

        const dataStr = JSON.stringify(exportPayload, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `bg3-hud-full-layout-${Date.now()}.json`;
        link.click();
        
        URL.revokeObjectURL(url);  
    }

    /**
     * Import layout from JSON
     * @private
     */
    _importLayout() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const layout = JSON.parse(e.target.result);
                    
                    // Validate layout
                    if (!Array.isArray(layout)) {
                        throw new Error('Invalid layout format');
                    }

                    // Update grids data
                    const hotbarContainer = this.hotbarApp.components.hotbar;
                    hotbarContainer.grids = layout;

                    // Update each grid container individually
                    for (let i = 0; i < layout.length && i < hotbarContainer.gridContainers.length; i++) {
                        const gridContainer = hotbarContainer.gridContainers[i];
                        gridContainer.rows = layout[i].rows;
                        gridContainer.cols = layout[i].cols;
                        gridContainer.items = layout[i].items || {};
                        await gridContainer.render();
                    }

                    // Save layout - update each grid's config and items
                    for (let i = 0; i < layout.length; i++) {
                        await this.hotbarApp.persistenceManager.updateGridConfig(i, {
                            rows: layout[i].rows,
                            cols: layout[i].cols
                        });
                        await this.hotbarApp.persistenceManager.updateContainer('hotbar', i, layout[i].items || {});
                    }
                    
                } catch (error) {
                    console.error('BG3 HUD Core | Failed to import layout:', error);
                }
            };
            reader.readAsText(file);
        };
        
        input.click();
    }
}

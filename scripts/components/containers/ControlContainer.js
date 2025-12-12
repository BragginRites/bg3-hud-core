import { BG3Component } from '../BG3Component.js';
import { BaseButton } from '../buttons/BaseButton.js';
import { ContextMenu } from '../ui/ContextMenu.js';
import { BG3HUD_API } from '../../utils/registry.js';
import { ControlsManager } from '../../managers/ControlsManager.js';

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
            // Mark as UI element to prevent system tooltips
            this.element.dataset.bg3Ui = 'true';
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
        const buttons = [
            this._getAddRowButton(),
            this._getRemoveRowButton(),
            this._getLockButton(),
            this._getSettingsButton()
        ];

        // Add GM hotbar toggle button if appropriate
        if (this._shouldShowGMHotbarToggle()) {
            buttons.unshift(this._getGMHotbarToggleButton());
        }

        return buttons;
    }

    /**
     * Check if GM hotbar toggle button should be shown
     * @returns {boolean} True if toggle should be shown
     * @private
     */
    _shouldShowGMHotbarToggle() {
        return game.user.isGM && 
               game.settings.get('bg3-hud-core', 'enableGMHotbar');
    }

    /**
     * Get GM hotbar toggle button
     * @returns {Object} Button data
     * @private
     */
    _getGMHotbarToggleButton() {
        const isUsingGM = !this.hotbarApp.currentToken;
        
        return {
            key: 'toggle-gm-hotbar',
            classes: ['hotbar-control-button'],
            icon: 'fas fa-random',
            tooltip: 'Toggle between GM Hotbar and Token Hotbar',
            onClick: async () => {
                const token = canvas.tokens.controlled[0];
                const isCurrentlyGM = !this.hotbarApp.currentToken;

                if (isCurrentlyGM && token) {
                    // Switch from GM hotbar to token hotbar
                    this.hotbarApp.overrideGMHotbar = false;
                    this.hotbarApp.currentToken = token;
                    this.hotbarApp.currentActor = token.actor;
                    await this.hotbarApp.refresh();
                } else {
                    // Switch from token hotbar to GM hotbar
                    this.hotbarApp.overrideGMHotbar = true;
                    this.hotbarApp.currentToken = null;
                    this.hotbarApp.currentActor = null;
                    await this.hotbarApp.refresh();
                }
            }
        };
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
            icon: 'fas fa-plus',
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
            icon: 'fas fa-minus',
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
        const isLocked = ControlsManager.getMasterLock();
        return {
            key: 'control-lock',
            classes: ['hotbar-control-button', ...(isLocked ? ['locked'] : [])],
            icon: isLocked ? 'fas fa-lock' : 'fas fa-unlock',
            tooltip: game.i18n.localize('bg3-hud-core.Controls.Lock.Tooltip'),
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
            icon: 'fas fa-cog',
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
        // Check if any lock settings are enabled
        const hasLockSettings = ControlsManager.hasAnyLockEnabled();
        
        if (!hasLockSettings) {
            // No lock settings selected - prompt user to right-click
            ui.notifications.warn(game.i18n.localize('bg3-hud-core.Controls.Lock.NoSettingsWarning'));
            return;
        }
        
        // Toggle the master lock
        await ControlsManager.updateMasterLock();
    }

    /**
     * Show lock settings menu
     * Uses adapter's MenuBuilder if available, otherwise falls back to core menu
     * @param {MouseEvent} event - Right-click event
     * @private
     */
    async _showLockMenu(event) {
        event.preventDefault();
        
        const menuBuilder = BG3HUD_API.getMenuBuilder();
        let menuItems = [];

        // Try to get menu items from adapter's MenuBuilder
        if (menuBuilder && typeof menuBuilder.buildLockMenu === 'function') {
            menuItems = await menuBuilder.buildLockMenu(this, event);
        }

        // Fallback to core lock menu if adapter didn't provide items
        if (menuItems.length === 0) {
            menuItems = this._getCoreLockMenuItems();
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
     * Get core lock menu items (fallback)
     * System adapters should override via MenuBuilder.buildLockMenu()
     * @returns {Array} Menu items array
     * @private
     */
    _getCoreLockMenuItems() {
        const menuItems = [];

        // Add GM hotbar lock option if GM hotbar is enabled
        if (game.user.isGM && game.settings.get('bg3-hud-core', 'enableGMHotbar')) {
            const isLocked = game.settings.get('bg3-hud-core', 'gmHotbarLock');
            menuItems.push({
                label: game.i18n.localize('bg3-hud-core.Controls.Lock.KeepGMHotbar'),
                icon: 'fas fa-shield-alt',
                class: isLocked ? 'checked' : '',
                custom: '<div class="menu-item-checkbox"><i class="fas fa-check"></i></div>',
                onClick: async () => {
                    const newValue = !isLocked;
                    await game.settings.set('bg3-hud-core', 'gmHotbarLock', newValue);
                    // Update override flag if locking
                    if (newValue && this.hotbarApp.canGMHotbar()) {
                        this.hotbarApp.overrideGMHotbar = true;
                    }
                }
            });
            
            // Add separator after GM hotbar option
            menuItems.push({ separator: true });
        }

        // Deselect Token lock
        const deselectLocked = ControlsManager.getLockSetting('deselect');
        menuItems.push({
            label: game.i18n.localize('bg3-hud-core.Controls.Lock.DeselectToken'),
            icon: 'fas fa-user-slash',
            class: deselectLocked ? 'checked' : '',
            custom: '<div class="menu-item-checkbox"><i class="fas fa-check"></i></div>',
            onClick: async () => {
                await ControlsManager.updateLockSetting('deselect');
            }
        });

        // Opacity lock
        const opacityLocked = ControlsManager.getLockSetting('opacity');
        menuItems.push({
            label: game.i18n.localize('bg3-hud-core.Controls.Lock.Opacity'),
            icon: 'fas fa-eye',
            class: opacityLocked ? 'checked' : '',
            custom: '<div class="menu-item-checkbox"><i class="fas fa-check"></i></div>',
            onClick: async () => {
                await ControlsManager.updateLockSetting('opacity');
            }
        });

        // Drag & Drop lock
        const dragDropLocked = ControlsManager.getLockSetting('dragDrop');
        menuItems.push({
            label: game.i18n.localize('bg3-hud-core.Controls.Lock.DragDrop'),
            icon: 'fas fa-arrows-alt',
            class: dragDropLocked ? 'checked' : '',
            custom: '<div class="menu-item-checkbox"><i class="fas fa-check"></i></div>',
            onClick: async () => {
                await ControlsManager.updateLockSetting('dragDrop');
            }
        });

        return menuItems;
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
     * Uses adapter's MenuBuilder if available, otherwise falls back to core menu
     * @param {MouseEvent} event - Click event
     * @private
     */
    async _showSettingsMenu(event) {
        const menuBuilder = BG3HUD_API.getMenuBuilder();
        let menuItems = [];

        // Try to get menu items from adapter's MenuBuilder
        if (menuBuilder && typeof menuBuilder.buildSettingsMenu === 'function') {
            menuItems = await menuBuilder.buildSettingsMenu(this, event);
        }

        // Fallback to core settings menu if adapter didn't provide items
        if (menuItems.length === 0) {
            menuItems = this._getCoreSettingsMenuItems();
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
     * Get core settings menu items (fallback)
     * System adapters should override via MenuBuilder.buildSettingsMenu()
     * @returns {Array} Menu items array
     * @private
     */
    _getCoreSettingsMenuItems() {
        return [
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
                label: 'Save Layout as Actor Default',
                icon: 'fas fa-clone',
                onClick: async () => {
                    await this._saveLayoutAsActorDefault();
                }
            },
            {
                separator: true
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
    }

    /**
     * Save current layout/state to the actor so future tokens start with it
     * @private
     */
    async _saveLayoutAsActorDefault() {
        if (!this.hotbarApp?.currentActor) {
            ui.notifications?.warn('No actor available to save layout.');
            return;
        }

        try {
            // Get the current state (already reflects grid resize/save operations)
            const currentState = await this.hotbarApp.persistenceManager.loadState();

            // Resolve the base actor (handles unlinked tokens)
            const baseActor = game.actors?.get(this.hotbarApp.currentActor.id) || this.hotbarApp.currentActor;

            // Use a fresh persistence manager to write onto the base actor
            const { PersistenceManager } = await import('/modules/bg3-hud-core/scripts/managers/PersistenceManager.js');
            const pm = new PersistenceManager();
            pm.setToken(baseActor);
            await pm.saveState(foundry.utils.deepClone(currentState));

            ui.notifications?.info('Saved layout as actor default for future tokens.');
        } catch (error) {
            console.error('BG3 HUD Core | Failed to save layout as actor default:', error);
            ui.notifications?.error('Failed to save layout as actor default.');
        }
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
     * Includes hotbar, weapon sets, active set index, quick access, and views
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
        const views = state?.views || { list: [], activeViewId: null };

        const exportPayload = {
            meta: {
                module: 'bg3-hud-core',
                version: 2, // Bumped for views support
                timestamp: new Date().toISOString(),
                actorUuid: actor?.uuid || null,
                tokenId: token?.id || null
            },
            hotbar,
            weaponSets,
            activeWeaponSet,
            quickAccess,
            views
        };

        const dataStr = JSON.stringify(exportPayload, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `bg3-hud-layout-${Date.now()}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
    }

    /**
     * Import layout from JSON
     * Supports both legacy (v1) and new (v2) format with views
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
                    const importData = JSON.parse(e.target.result);
                    
                    // Check format version
                    const version = importData.meta?.version || 1;
                    
                    if (version === 2) {
                        // New format with views
                        await this._importLayoutV2(importData);
                    } else {
                        // Legacy format (just hotbar arrays)
                        await this._importLayoutV1(importData);
                    }
                } catch (error) {
                    console.error('BG3 HUD Core | Failed to import layout:', error);
                    ui.notifications.error('Failed to import layout');
                }
            };
            reader.readAsText(file);
        };
        
        input.click();
    }

    /**
     * Import layout V2 format (with views)
     * @param {Object} importData - Import data
     * @private
     */
    async _importLayoutV2(importData) {
        const state = await this.hotbarApp.persistenceManager.loadState();
        
        // Import views if present
        if (importData.views && Array.isArray(importData.views.list)) {
            state.views = foundry.utils.deepClone(importData.views);
            
            // If there's an active view, load its hotbar state (views only affect hotbar)
            if (state.views.activeViewId) {
                const activeView = state.views.list.find(v => v.id === state.views.activeViewId);
                if (activeView?.hotbarState?.hotbar) {
                    state.hotbar = foundry.utils.deepClone(activeView.hotbarState.hotbar);
                }
            }
            
            // Import weapon sets and quick access separately (not part of views)
            if (importData.weaponSets) {
                state.weaponSets = {
                    sets: foundry.utils.deepClone(importData.weaponSets),
                    activeSet: importData.activeWeaponSet ?? 0
                };
            }
            if (importData.quickAccess) {
                state.quickAccess = foundry.utils.deepClone(importData.quickAccess);
            }
        } else {
            // Import legacy data directly (no views)
            if (importData.hotbar) {
                state.hotbar = { grids: foundry.utils.deepClone(importData.hotbar) };
            }
            if (importData.weaponSets) {
                state.weaponSets = {
                    sets: foundry.utils.deepClone(importData.weaponSets),
                    activeSet: importData.activeWeaponSet ?? 0
                };
            }
            if (importData.quickAccess) {
                state.quickAccess = foundry.utils.deepClone(importData.quickAccess);
            }
            
            // Sync to active view
            this.hotbarApp.persistenceManager._syncCurrentStateToActiveView(state);
        }
        
        // Save the imported state
        await this.hotbarApp.persistenceManager.saveState(state);
        
        // Refresh the hotbar to show imported data
        await this.hotbarApp.refresh();
    }

    /**
     * Import layout V1 format (legacy - just hotbar grids)
     * @param {Array} layout - Legacy layout array
     * @private
     */
    async _importLayoutV1(layout) {
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
    }
}

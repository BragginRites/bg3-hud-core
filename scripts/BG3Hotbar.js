import { BG3HUD_REGISTRY } from './utils/registry.js';
import { applyMacrobarCollapseSetting } from './utils/settings.js';
import { DragDropManager } from './managers/DragDropManager.js';
import { PersistenceManager } from './managers/PersistenceManager.js';

/**
 * BG3 Hotbar Application
 * Main HUD that contains all panels and components
 * Uses ApplicationV2 but configured to render without window chrome
 */
export class BG3Hotbar extends foundry.applications.api.ApplicationV2 {
    /**
     * Default application options
     */
    static DEFAULT_OPTIONS = {
        id: 'bg3-hotbar',
        classes: ['bg3-hud'],
        tag: 'div',
        window: {
            frame: false,           // No window frame/chrome
            positioned: false,      // Don't use Foundry's positioning
            resizable: false,
            minimizable: false
        },
        position: {
            width: 'auto',
            height: 'auto'
        },
        actions: {}
    };

    /**
     * Create a new BG3Hotbar
     */
    constructor(options = {}) {
        super(options);
        
        this.components = {};
        this.currentToken = null;
        this.currentActor = null;
        this.dragDropManager = new DragDropManager();
        this.persistenceManager = new PersistenceManager();

        // Register Foundry hooks
        this._registerHooks();
    }

    /**
     * Apply macrobar collapse setting
     * Public method that can be called from settings onChange
     */
    applyMacrobarCollapseSetting() {
        applyMacrobarCollapseSetting();
    }

    /**
     * Refresh the hotbar (re-initialize components)
     */
    async refresh() {
        console.log('BG3 HUD Core | Refreshing hotbar');
        await this._initializeComponents();
    }

    /**
     * Register Foundry hooks for HUD updates
     * @private
     */
    _registerHooks() {
        Hooks.on('controlToken', this._onControlToken.bind(this));
        Hooks.on('updateToken', this._onUpdateToken.bind(this));
        Hooks.on('updateActor', this._onUpdateActor.bind(this));
        Hooks.on('updateCombat', this._onUpdateCombat.bind(this));
    }

    /**
     * Prepare rendering context data
     * @param {Object} options - Render options
     * @returns {Promise<Object>} Render context
     */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        return context;
    }

    /**
     * Render the application's HTML
     * @param {Object} context - Render context
     * @param {Object} options - Render options
     * @returns {Promise<string>}
     */
    async _renderHTML(context, options) {
        const template = 'modules/bg3-hud-core/templates/bg3-hud.hbs';
        const html = await renderTemplate(template, context);
        return html;
    }

    /**
     * Replace the application's HTML
     * @param {HTMLElement} result - The rendered HTML
     * @param {HTMLElement} content - The content element
     * @param {Object} options - Render options
     */
    _replaceHTML(result, content, options) {
        content.innerHTML = result;
    }

    /**
     * Actions after rendering
     * @param {Object} context - Render context
     * @param {Object} options - Render options
     */
    async _onRender(context, options) {
        await super._onRender(context, options);
        
        // Initialize components after DOM is ready
        await this._initializeComponents();
    }

    /**
     * Initialize UI components
     * Components are provided by system adapters
     * @private
     */
    async _initializeComponents() {
        // Clear existing components
        this._destroyComponents();

        // Only initialize if we have a token
        if (!this.currentToken) {
            console.log('BG3 HUD Core | No token selected, skipping component initialization');
            return;
        }

        console.log('BG3 HUD Core | Initializing components');
        
        // Get the main container
        const container = this.element.querySelector('#bg3-hotbar-container');
        if (!container) {
            console.error('BG3 HUD Core | Container element not found');
            return;
        }

        // TODO: Uncomment this check when ready for production
        // If no adapter is loaded, show a message
        // if (!BG3HUD_REGISTRY.activeAdapter) {
        //     console.log('BG3 HUD Core | No adapter loaded - HUD will be empty');
        //     const notice = document.createElement('div');
        //     notice.className = 'bg3-no-adapter-notice';
        //     notice.innerHTML = `
        //         <p>⚠️ No system adapter loaded</p>
        //         <p>Install <strong>bg3-hud-dnd5e</strong> or <strong>bg3-hud-pf2e</strong></p>
        //     `;
        //     container.appendChild(notice);
        //     return;
        // }
        
        console.log('BG3 HUD Core | Rendering containers');

        // Import core container classes
        const { PortraitContainer } = await import('./components/containers/PortraitContainer.js');
        const { HotbarContainer } = await import('./components/containers/HotbarContainer.js');

        // Use adapter portrait if available, otherwise use base
        const PortraitClass = BG3HUD_REGISTRY.portraitContainer || PortraitContainer;

        // Initialize portrait container (always)
        this.components.portrait = new PortraitClass({
            actor: this.currentActor,
            token: this.currentToken
        });
        const portraitElement = await this.components.portrait.render();
        container.appendChild(portraitElement);

        // Load hotbar data from persistence
        this.persistenceManager.setToken(this.currentToken);
        const gridsData = await this.persistenceManager.load();
        
        // Initialize hotbar container (always) - contains multiple grids + drag bars
        this.components.hotbar = new HotbarContainer({
            grids: gridsData,
            actor: this.currentActor,
            token: this.currentToken,
            // Drag & drop handlers
            onCellClick: this._handleCellClick.bind(this),
            onCellRightClick: this._handleCellRightClick.bind(this),
            onCellDragStart: this._handleCellDragStart.bind(this),
            onCellDragEnd: this._handleCellDragEnd.bind(this),
            onCellDrop: this._handleCellDrop.bind(this)
        });
        const hotbarElement = await this.components.hotbar.render();
        container.appendChild(hotbarElement);
        
        // Initialize control container (row controls, settings)
        const { ControlContainer } = await import('./components/containers/ControlContainer.js');
        this.components.controls = new ControlContainer({
            hotbarApp: this  // Pass reference to BG3Hotbar
        });
        const controlsElement = await this.components.controls.render();
        this.components.hotbar.element.appendChild(controlsElement);
        
        // Set adapter and persistence manager for drag drop manager
        if (BG3HUD_REGISTRY.activeAdapter) {
            this.dragDropManager.setAdapter(BG3HUD_REGISTRY.activeAdapter);
        }
        this.dragDropManager.setPersistenceManager(this.persistenceManager);

        console.log('BG3 HUD Core | Components initialized:', Object.keys(this.components));
        if (BG3HUD_REGISTRY.activeAdapter) {
            console.log('BG3 HUD Core | Using adapter:', BG3HUD_REGISTRY.activeAdapter.constructor?.name);
        } else {
            console.log('BG3 HUD Core | Using base containers (no adapter)');
        }
    }

    /**
     * Destroy all components
     * @private
     */
    _destroyComponents() {
        for (const [key, component] of Object.entries(this.components)) {
            if (component && typeof component.destroy === 'function') {
                component.destroy();
            }
        }
        this.components = {};
    }

    /**
     * Refresh the HUD
     */
    async refresh() {
        if (!this.rendered) return;
        await this.render(false);
    }

    // ========================================
    // Foundry Hook Handlers
    // ========================================

    /**
     * Handle token control
     * @param {Token} token - Controlled token
     * @param {boolean} controlled - Whether token is controlled
     * @private
     */
    async _onControlToken(token, controlled) {
        if (controlled) {
            this.currentToken = token;
            this.currentActor = token.actor;
            console.log('BG3 HUD Core | Token controlled:', token.name);
        } else {
            this.currentToken = null;
            this.currentActor = null;
            console.log('BG3 HUD Core | Token deselected');
        }
        await this.refresh();
    }

    /**
     * Handle token update
     * @param {Token} token - Updated token
     * @param {Object} changes - Changes made
     * @private
     */
    async _onUpdateToken(token, changes) {
        if (token === this.currentToken) {
            await this.refresh();
        }
    }

    /**
     * Handle actor update
     * @param {Actor} actor - Updated actor
     * @param {Object} changes - Changes made
     * @private
     */
    async _onUpdateActor(actor, changes) {
        if (actor !== this.currentActor) return;

        // If this update was triggered by our own persistence save, skip to avoid redundant rerender
        if (this.persistenceManager?._lastSaveWasLocal) {
            this.persistenceManager._lastSaveWasLocal = false;
            return;
        }

        // Targeted update: when our hotbar flag changes, update grids in place instead of full refresh
        const moduleId = this.persistenceManager?.MODULE_ID || 'bg3-hud-core';
        const flagName = this.persistenceManager?.FLAG_NAME || 'hotbarData';
        const moduleFlags = changes?.flags?.[moduleId];
        const hotbarChanged = moduleFlags && Object.prototype.hasOwnProperty.call(moduleFlags, flagName);

        if (hotbarChanged && this.components?.hotbar) {
            try {
                // Get latest grids data
                const latest = actor.getFlag(moduleId, flagName) ?? this.persistenceManager?.getGridsData?.();
                if (Array.isArray(latest)) {
                    this.persistenceManager.gridsData = foundry.utils.deepClone(latest);
                    // Update hotbar container in place
                    this.components.hotbar.grids = this.persistenceManager.gridsData;
                    for (let i = 0; i < this.components.hotbar.grids.length; i++) {
                        const gridData = this.components.hotbar.grids[i];
                        const gridContainer = this.components.hotbar.gridContainers[i];
                        if (gridContainer) {
                            gridContainer.rows = gridData.rows;
                            gridContainer.cols = gridData.cols;
                            gridContainer.items = gridData.items || {};
                            await gridContainer.render();
                        }
                    }
                    return; // Avoid full refresh
                }
            } catch (e) {
                console.warn('BG3 HUD Core | Targeted hotbar update failed, falling back to refresh', e);
            }
        }

        await this.refresh();
    }

    /**
     * Handle combat update
     * @param {Combat} combat - Updated combat
     * @param {Object} changes - Changes made
     * @private
     */
    async _onUpdateCombat(combat, changes) {
        // Refresh if it's the current combatant's turn
        const combatant = combat.combatant;
        if (combatant && combatant.token === this.currentToken) {
            await this.refresh();
        }
    }

    /**
     * Clean up when closing
     */
    async close(options = {}) {
        this._destroyComponents();
        return super.close(options);
    }

    /* -------------------------------------------- */
    /*  Cell Interaction Handlers                   */
    /* -------------------------------------------- */

    /**
     * Handle cell click
     * @param {GridCell} cell - The clicked cell
     * @param {MouseEvent} event - The click event
     * @private
     */
    _handleCellClick(cell, event) {
        console.log('BG3 HUD Core | Cell clicked:', cell.index, cell.data);
        
        // If no data in cell, do nothing
        if (!cell.data) return;

        // Call adapter's click handler if available
        if (BG3HUD_REGISTRY.activeAdapter && typeof BG3HUD_REGISTRY.activeAdapter.onCellClick === 'function') {
            BG3HUD_REGISTRY.activeAdapter.onCellClick(cell, event);
        } else {
            console.log('BG3 HUD Core | No adapter click handler - cell has data:', cell.data);
        }
    }

    /**
     * Handle cell right-click
     * @param {GridCell} cell - The right-clicked cell
     * @param {MouseEvent} event - The click event
     * @private
     */
    async _handleCellRightClick(cell, event) {
        console.log('BG3 HUD Core | Cell right-clicked:', cell.index, cell.data);

        // Build context menu items
        const menuItems = [];

        // Core menu items (always available)
        if (cell.data) {
            menuItems.push({
                label: 'Remove Item',
                icon: 'fas fa-trash',
                onClick: async () => {
                    await this._removeCell(cell);
                }
            });
        }

        // Let adapter add custom menu items
        if (BG3HUD_REGISTRY.activeAdapter && typeof BG3HUD_REGISTRY.activeAdapter.getCellMenuItems === 'function') {
            const adapterItems = await BG3HUD_REGISTRY.activeAdapter.getCellMenuItems(cell);
            if (adapterItems && adapterItems.length > 0) {
                menuItems.push(...adapterItems);
            }
        }

        // Show context menu if we have items
        if (menuItems.length > 0) {
            const { ContextMenu } = await import('./components/ui/ContextMenu.js');
            const menu = new ContextMenu({
                items: menuItems,
                event: event,
                parent: document.body
            });
            await menu.render();
        }
    }

    /**
     * Remove item from a cell
     * @param {GridCell} cell - The cell to clear
     * @private
     */
    async _removeCell(cell) {
        console.log('BG3 HUD Core | Removing item from cell:', cell.index);
        
        // Clear the cell
        await cell.setData(null);

        // Update persistence
        const slotKey = `${cell.col}-${cell.row}`;
        await this.persistenceManager.updateCell(cell.gridIndex, slotKey, null);

        ui.notifications.info('Item removed from hotbar');
    }

    /**
     * Handle cell drag start
     * @param {GridCell} cell - The cell being dragged
     * @param {DragEvent} event - The drag event
     * @private
     */
    _handleCellDragStart(cell, event) {
        this.dragDropManager.onDragStart(cell, event);
    }

    /**
     * Handle cell drag end
     * @param {GridCell} cell - The cell that was dragged
     * @param {DragEvent} event - The drag event
     * @private
     */
    _handleCellDragEnd(cell, event) {
        this.dragDropManager.onDragEnd(cell, event);
    }

    /**
     * Handle cell drop
     * @param {GridCell} cell - The cell being dropped on
     * @param {DragEvent} event - The drop event
     * @param {Object} dragData - The drag data
     * @private
     */
    async _handleCellDrop(cell, event, dragData) {
        await this.dragDropManager.onDrop(cell, event, dragData);
    }
}

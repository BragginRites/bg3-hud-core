import { BG3Component } from '../BG3Component.js';
import { ViewButton, NewViewButton } from '../buttons/ViewButton.js';
import { showCreateViewDialog, showEditViewDialog } from '../../utils/dialogs.js';

/**
 * Hotbar Views Container
 * Displays saved hotbar views (configurations) and allows switching between them
 * Positioned at bottom-center of hotbar, hover-activated
 */
export class HotbarViewsContainer extends BG3Component {
    /**
     * Maximum number of views allowed
     */
    static MAX_VIEWS = 5;

    /**
     * Create hotbar views container
     * @param {Object} options - Container options
     * @param {BG3Hotbar} options.hotbarApp - Reference to main hotbar app
     */
    constructor(options = {}) {
        super(options);
        this.hotbarApp = options.hotbarApp;
        this.persistenceManager = options.hotbarApp?.persistenceManager;
        this.viewButtons = [];
        this.newViewButton = null;
    }

    /**
     * Render the views container
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        // Create container element on first render
        if (!this.element) {
            this.element = this.createElement('div', ['bg3-views-container']);
        }

        // Clear existing content
        this.element.innerHTML = '';
        this.viewButtons = [];

        // Get views from persistence manager
        const views = this.persistenceManager?.getViews() || [];
        const activeViewId = this.persistenceManager?.getActiveViewId();

        // Create view buttons
        for (const view of views) {
            const isActive = view.id === activeViewId;
            const button = await this._createViewButton(view, isActive);
            this.viewButtons.push(button);
            this.element.appendChild(button.element);
        }

        // Add separator if we have views
        if (views.length > 0) {
            const separator = document.createElement('div');
            separator.className = 'bg3-views-separator';
            this.element.appendChild(separator);
        }

        // Create "New View" button
        this.newViewButton = await this._createNewViewButton();
        this.element.appendChild(this.newViewButton.element);

        return this.element;
    }

    /**
     * Create a view button
     * @param {Object} view - View data
     * @param {boolean} isActive - Whether this view is active
     * @returns {Promise<ViewButton>}
     * @private
     */
    async _createViewButton(view, isActive) {
        const button = new ViewButton({
            view: view,
            isActive: isActive,
            onSwitch: async () => {
                await this._switchToView(view.id);
            },
            onContextMenu: async (event) => {
                await this._showContextMenu(event, view);
            }
        });

        await button.render();
        return button;
    }

    /**
     * Create the "New View" button
     * @returns {Promise<NewViewButton>}
     * @private
     */
    async _createNewViewButton() {
        const button = new NewViewButton({
            onCreate: async () => {
                await this._showCreateViewDialog();
            }
        });

        await button.render();
        return button;
    }

    /**
     * Switch to a different view
     * @param {string} viewId - View ID to switch to
     * @private
     */
    async _switchToView(viewId) {
        if (!this.persistenceManager) return;

        const currentViewId = this.persistenceManager.getActiveViewId();
        if (currentViewId === viewId) return; // Already active

        try {
            // Switch view in persistence manager (this loads the view's state)
            await this.persistenceManager.switchView(viewId);

            // Update only the grid containers with new items (no full refresh)
            await this._updateHotbarContainers();

            // Update view buttons to reflect new active state
            await this.render();

        } catch (error) {
            console.error('BG3 HUD Core | Failed to switch view:', error);
        }
    }

    /**
     * Update hotbar containers with current state (seamless update, no full refresh)
     * Views only affect hotbar grids, not weapon sets or quick access
     * Includes grid configuration (rows/cols) and items
     * @private
     */
    async _updateHotbarContainers() {
        if (!this.hotbarApp?.components) return;

        const state = this.persistenceManager.getState();
        if (!state) return;

        const updates = [];

        // Update hotbar grids only (views don't affect weapon sets or quick access)
        if (this.hotbarApp.components.hotbar) {
            const hotbarContainer = this.hotbarApp.components.hotbar;

            // Also update the parent container's grids array
            hotbarContainer.grids = state.hotbar.grids;

            for (let i = 0; i < state.hotbar.grids.length; i++) {
                const gridData = state.hotbar.grids[i];
                const gridContainer = hotbarContainer.gridContainers[i];
                if (gridContainer) {
                    // Update grid configuration (rows/cols)
                    gridContainer.rows = gridData.rows;
                    gridContainer.cols = gridData.cols;
                    gridContainer.items = gridData.items || {};

                    // Show/hide grid based on cols
                    if (gridData.cols === 0) {
                        gridContainer.element.style.display = 'none';
                    } else {
                        gridContainer.element.style.display = '';
                    }

                    updates.push(gridContainer.render());
                }
            }
        }

        // Wait for all updates to complete
        await Promise.all(updates);
    }

    /**
     * Show create view dialog
     * @private
     */
    async _showCreateViewDialog() {
        // Check if already at max views
        const views = this.persistenceManager?.getViews() || [];
        if (views.length >= HotbarViewsContainer.MAX_VIEWS) {
            ui.notifications.warn(`Maximum of ${HotbarViewsContainer.MAX_VIEWS} views allowed`);
            return;
        }

        const result = await showCreateViewDialog();
        if (result) {
            await this._createView(result.name, result.icon);
        }
    }

    /**
     * Create a new view with empty hotbar state
     * @param {string} name - View name
     * @param {string|null} icon - Font Awesome icon class
     * @private
     */
    async _createView(name, icon) {
        if (!this.persistenceManager) return;

        try {
            await this.persistenceManager.createView(name, icon);

            // Update hotbar containers to show empty state
            await this._updateHotbarContainers();

            // Refresh the views container to show the new view
            await this.render();

            ui.notifications.info(`Created view: ${name}`);
        } catch (error) {
            console.error('BG3 HUD Core | Failed to create view:', error);
            ui.notifications.error('Failed to create view');
        }
    }

    /**
     * Show context menu for a view
     * @param {MouseEvent} event - Right-click event
     * @param {Object} view - View data
     * @private
     */
    async _showContextMenu(event, view) {
        event.preventDefault();
        event.stopPropagation();

        const { ContextMenu } = await import('../ui/ContextMenu.js');

        const views = this.persistenceManager?.getViews() || [];
        const canDelete = views.length > 1; // Can't delete if it's the only view

        const menuItems = [
            {
                label: 'Rename View',
                icon: 'fas fa-edit',
                onClick: async () => {
                    await this._showRenameViewDialog(view);
                }
            },
            {
                label: 'Duplicate View',
                icon: 'fas fa-copy',
                onClick: async () => {
                    await this._duplicateView(view.id);
                }
            },
            {
                label: 'Delete View',
                icon: 'fas fa-trash',
                disabled: !canDelete,
                onClick: async () => {
                    await this._deleteView(view.id);
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
     * Show rename view dialog (uses unified view dialog)
     * @param {Object} view - View to rename
     * @private
     */
    async _showRenameViewDialog(view) {
        const result = await showEditViewDialog(view);
        if (result) {
            await this._renameView(view.id, result.name, result.icon);
        }
    }

    /**
     * Rename a view
     * @param {string} viewId - View ID to rename
     * @param {string} newName - New view name
     * @param {string|null} newIcon - New icon (optional)
     * @private
     */
    async _renameView(viewId, newName, newIcon) {
        if (!this.persistenceManager) return;

        try {
            await this.persistenceManager.renameView(viewId, newName, newIcon);

            // Refresh the views container
            await this.render();
        } catch (error) {
            console.error('BG3 HUD Core | Failed to rename view:', error);
            ui.notifications.error('Failed to rename view');
        }
    }

    /**
     * Duplicate a view
     * @param {string} viewId - View ID to duplicate
     * @private
     */
    async _duplicateView(viewId) {
        if (!this.persistenceManager) return;

        try {
            const originalView = this.persistenceManager.getView(viewId);
            const newName = `${originalView?.name} (Copy)`;

            await this.persistenceManager.duplicateView(viewId, newName);

            // Refresh the views container
            await this.render();
        } catch (error) {
            console.error('BG3 HUD Core | Failed to duplicate view:', error);
            ui.notifications.error('Failed to duplicate view');
        }
    }

    /**
     * Delete a view
     * @param {string} viewId - View ID to delete
     * @private
     */
    async _deleteView(viewId) {
        if (!this.persistenceManager) return;

        const view = this.persistenceManager.getView(viewId);

        // Confirm deletion using Foundry's DialogV2
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Delete View' },
            content: `<p>Are you sure you want to delete the view <strong>"${view?.name}"</strong>?</p><p>This action cannot be undone.</p>`,
            rejectClose: false
        });

        if (!confirmed) return;

        try {
            const wasActive = this.persistenceManager.getActiveViewId() === viewId;

            await this.persistenceManager.deleteView(viewId);

            // If we deleted the active view, update the hotbar containers
            if (wasActive) {
                await this._updateHotbarContainers();
            }

            // Refresh the views container
            await this.render();
        } catch (error) {
            console.error('BG3 HUD Core | Failed to delete view:', error);
            ui.notifications.error('Failed to delete view');
        }
    }

    /**
     * Refresh the views container (re-render)
     */
    async refresh() {
        await this.render();
    }

    /**
     * Destroy the container and cleanup
     */
    destroy() {
        // Destroy view buttons
        for (const button of this.viewButtons) {
            if (button && typeof button.destroy === 'function') {
                button.destroy();
            }
        }
        this.viewButtons = [];

        // Destroy new view button
        if (this.newViewButton && typeof this.newViewButton.destroy === 'function') {
            this.newViewButton.destroy();
        }
        this.newViewButton = null;

        super.destroy();
    }
}


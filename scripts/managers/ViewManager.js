/**
 * View Manager
 * Owns the View CRUD subsystem that used to live inside PersistenceManager:
 * create/delete/switch/rename/duplicate/update views, plus the read-only
 * accessors (getViews/getView/getActiveView/getActiveViewId).
 *
 * A "view" is a named, swappable snapshot of hotbar state. Views live inside
 * the same persisted HUD state object PersistenceManager already owns, so
 * this class does not own storage itself - it depends on a host that can
 * load/save that state and that exposes the default grid configuration:
 *   - host.loadState(): Promise<Object>  - fetch the latest persisted state
 *   - host.saveState(state): Promise<void> - persist a (possibly mutated) state
 *   - host.state: Object|null            - the host's cached state (sync reads)
 *   - host.DEFAULT_GRID_CONFIG: {rows, cols, gridCount}
 *
 * In practice the host is the PersistenceManager instance itself, which holds
 * a `views` property of this class and delegates its public View methods to it.
 */
import { Logger } from '../utils/logger.js';

/**
 * Generate a unique view ID.
 * Shared with PersistenceManager (default-state construction, views-structure
 * backfill, and the v1 -> v2 migration all need to mint view IDs too), so this
 * lives as a standalone export rather than a method tied to one instance.
 * @returns {string} Unique view ID
 */
export function generateViewId() {
    return `view-${foundry.utils.randomID(16)}`;
}

export class ViewManager {
    /**
     * @param {Object} host - Object providing loadState/saveState/state/DEFAULT_GRID_CONFIG (see file header)
     */
    constructor(host) {
        this.host = host;
    }

    /**
     * Create a new view with empty hotbar state
     * @param {string} name - View name
     * @param {string|null} icon - Font Awesome icon class (optional)
     * @returns {Promise<string>} New view ID
     */
    async createView(name, icon = null) {
        const state = await this.host.loadState();

        // Generate new view ID
        const viewId = generateViewId();

        // Create empty hotbar state for new view
        const emptyHotbarState = this._getEmptyHotbarState();

        // Create new view
        const newView = {
            id: viewId,
            name: name,
            icon: icon || 'fa-bookmark',
            hotbarState: emptyHotbarState
        };

        // Add view to list
        state.views.list.push(newView);

        // Switch to new view (this will load the empty state)
        state.views.activeViewId = viewId;

        // Load the new view's empty hotbar state into current state
        state.hotbar = foundry.utils.deepClone(emptyHotbarState.hotbar);

        await this.host.saveState(state);

        Logger.debug('ViewManager: Created empty view:', name);
        return viewId;
    }

    /**
     * Delete a view
     * @param {string} viewId - View ID to delete
     * @returns {Promise<void>}
     */
    async deleteView(viewId) {
        let state = await this.host.loadState();

        // Can't delete if it's the only view
        if (state.views.list.length <= 1) {
            Logger.warn('ViewManager: Cannot delete the only view');
            return;
        }

        // Find view index
        const viewIndex = state.views.list.findIndex(v => v.id === viewId);
        if (viewIndex === -1) {
            Logger.warn('ViewManager: View not found:', viewId);
            return;
        }

        // If deleting active view, switch to another view first
        if (state.views.activeViewId === viewId) {
            // Switch to first available view that's not this one
            const newActiveView = state.views.list.find(v => v.id !== viewId);
            if (newActiveView) {
                await this.switchView(newActiveView.id);
                // Reload state after switch
                state = await this.host.loadState();
            }
        }

        // Remove view from list
        state.views.list.splice(viewIndex, 1);

        await this.host.saveState(state);

        Logger.debug('ViewManager: Deleted view:', viewId);
    }

    /**
     * Switch to a different view
     * @param {string} viewId - View ID to switch to
     * @returns {Promise<void>}
     */
    async switchView(viewId) {
        const state = await this.host.loadState();

        // Find the view
        const view = state.views.list.find(v => v.id === viewId);
        if (!view) {
            Logger.warn('ViewManager: View not found:', viewId);
            return;
        }

        // Update active view ID
        state.views.activeViewId = viewId;

        // Load the view's hotbar state into current state (views only affect hotbar)
        state.hotbar = foundry.utils.deepClone(view.hotbarState.hotbar);
        if (view.hotbarState.autoPopulateComplete === true) {
            state.autoPopulateComplete = true;
        }

        await this.host.saveState(state);

    }

    /**
     * Rename a view
     * @param {string} viewId - View ID to rename
     * @param {string} newName - New view name
     * @param {string|null} newIcon - New icon (optional)
     * @returns {Promise<void>}
     */
    async renameView(viewId, newName, newIcon = null) {
        const state = await this.host.loadState();

        // Find the view
        const view = state.views.list.find(v => v.id === viewId);
        if (!view) {
            Logger.warn('ViewManager: View not found:', viewId);
            return;
        }

        // Update name and icon
        view.name = newName;
        if (newIcon !== null) {
            view.icon = newIcon;
        }

        await this.host.saveState(state);

        Logger.debug('ViewManager: Renamed view to:', newName);
    }

    /**
     * Duplicate a view
     * @param {string} viewId - View ID to duplicate
     * @param {string|null} newName - Name for duplicated view (optional)
     * @returns {Promise<string>} New view ID
     */
    async duplicateView(viewId, newName = null) {
        const state = await this.host.loadState();

        // Find the view to duplicate
        const sourceView = state.views.list.find(v => v.id === viewId);
        if (!sourceView) {
            Logger.warn('ViewManager: View not found:', viewId);
            return null;
        }

        // Generate new view ID
        const newViewId = generateViewId();

        // Create duplicate view
        const duplicateView = {
            id: newViewId,
            name: newName || `${sourceView.name} (Copy)`,
            icon: sourceView.icon,
            hotbarState: foundry.utils.deepClone(sourceView.hotbarState)
        };

        // Add to list
        state.views.list.push(duplicateView);

        await this.host.saveState(state);

        Logger.debug('ViewManager: Duplicated view:', duplicateView.name);
        return newViewId;
    }

    /**
     * Update a view with current hotbar state
     * @param {string|null} viewId - View ID to update (null = active view)
     * @returns {Promise<void>}
     */
    async updateView(viewId = null) {
        const state = await this.host.loadState();

        // Default to active view if not specified
        const targetViewId = viewId || state.views.activeViewId;

        // Find the view
        const view = state.views.list.find(v => v.id === targetViewId);
        if (!view) {
            Logger.warn('ViewManager: View not found:', targetViewId);
            return;
        }

        // Update view's hotbar state with current state
        view.hotbarState = {
            hotbar: foundry.utils.deepClone(state.hotbar),
            weaponSets: foundry.utils.deepClone(state.weaponSets),
            quickAccess: foundry.utils.deepClone(state.quickAccess)
        };

        await this.host.saveState(state);

        Logger.debug('ViewManager: Updated view:', view.name);
    }

    /**
     * Get all views
     * @returns {Array<Object>} List of views
     */
    getViews() {
        const state = this.host.state;
        if (!state?.views?.list) return [];
        return foundry.utils.deepClone(state.views.list);
    }

    /**
     * Get active view ID
     * @returns {string|null} Active view ID
     */
    getActiveViewId() {
        return this.host.state?.views?.activeViewId || null;
    }

    /**
     * Get a specific view
     * @param {string} viewId - View ID
     * @returns {Object|null} View data or null
     */
    getView(viewId) {
        const view = this.host.state?.views?.list?.find(v => v.id === viewId);
        return view ? foundry.utils.deepClone(view) : null;
    }

    /**
     * Get active view
     * @returns {Object|null} Active view data or null
     */
    getActiveView() {
        const activeViewId = this.getActiveViewId();
        return activeViewId ? this.getView(activeViewId) : null;
    }

    /**
     * Get empty hotbar state (for new views)
     * @returns {Object} Empty hotbar state
     * @private
     */
    _getEmptyHotbarState() {
        const gridConfig = this.host.DEFAULT_GRID_CONFIG;
        const grids = [];
        for (let i = 0; i < gridConfig.gridCount; i++) {
            grids.push({
                rows: gridConfig.rows,
                cols: gridConfig.cols,
                items: {}
            });
        }

        return {
            hotbar: {
                grids: grids
            }
        };
    }
}

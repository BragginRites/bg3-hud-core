import { BG3HUD_API } from '../utils/registry.js';
import { applyAppearanceSettings, applyMacrobarCollapseSetting } from '../utils/settings.js';
import { HotbarViewsContainer } from '../components/containers/HotbarViewsContainer.js';
import { Logger } from '../utils/logger.js';

/**
 * What the HUD is on screen for.
 * Callers say show this Token, or not exactly one Token, or GM Hotbar override.
 * Soft vs full rebuild stays inside.
 */
export class HudOnScreen {
    /**
     * @param {import('../BG3Hotbar.js').BG3Hotbar} hotbarApp
     */
    constructor(hotbarApp) {
        this.app = hotbarApp;
    }

    /**
     * @param {Token} token
     * @returns {boolean}
     */
    static isCompatible(token) {
        const actor = token?.actor;
        if (!actor) return false;
        const adapter = BG3HUD_API.getActiveAdapter();
        if (adapter && typeof adapter.isCompatible === 'function') {
            return adapter.isCompatible(actor);
        }
        return actor.type !== 'group';
    }

    /**
     * Every Token currently controlled. Groups count. Two Tokens are ambiguous.
     * @returns {Token[]}
     */
    controlled() {
        return canvas.tokens?.controlled || [];
    }

    /**
     * Play sheet Token when selection is exactly one creature Token, else null.
     * Several Tokens of any kind (including a group plus an orc) is the same as zero.
     * @returns {Token|null}
     */
    playSheetToken() {
        const selected = this.controlled();
        if (selected.length !== 1) return null;
        const token = selected[0];
        return HudOnScreen.isCompatible(token) ? token : null;
    }

    /**
     * Show the play sheet for this Token. Every named part becomes this creature.
     * @param {Token} token
     */
    async showToken(token) {
        if (!token || !HudOnScreen.isCompatible(token)) return;
        this.app.overrideGMHotbar = false;
        this.app.currentToken = token;
        this.app.currentActor = token.actor;
        await this._apply();
    }

    /**
     * Not exactly one creature Token (zero, several of any kind, or a lone group).
     * GM Hotbar if enabled, otherwise nothing. Never a merge.
     */
    async showNotOneToken() {
        this.app.overrideGMHotbar = false;
        this.app.currentToken = null;
        this.app.currentActor = null;
        await this._apply();
    }

    /**
     * GM asked for the GM Hotbar while a Token may still be selected on the canvas.
     */
    async showGmHotbarOverride() {
        this.app.overrideGMHotbar = true;
        this.app.currentToken = null;
        this.app.currentActor = null;
        await this._apply();
    }

    /**
     * Apply whatever currentToken / overrideGMHotbar already is.
     * Soft vs full is internal.
     * @private
     */
    async _apply() {
        const startedAt = performance.now();
        const app = this.app;
        if (!app.rendered) {
            await app.refresh();
            Logger.info(`HUD show (first render) ${Math.round(performance.now() - startedAt)}ms`);
            return;
        }

        if (app.currentToken && this._canSoftTokenRefresh()) {
            app._refreshGeneration++;
            try {
                await this._softTokenSwapRefresh();
            } finally {
                app._refreshGeneration++;
            }
            Logger.info(`HUD show (soft swap) ${Math.round(performance.now() - startedAt)}ms`);
            return;
        }

        await app.refresh();
        Logger.info(`HUD show (full refresh) ${Math.round(performance.now() - startedAt)}ms`);
    }

    /**
     * @private
     */
    _canSoftTokenRefresh() {
        const app = this.app;
        if (!app.rendered) return false;
        if (!app.currentToken || !app.currentActor) return false;
        if (app.overrideGMHotbar) return false;
        if (app.canGMHotbar()) return false;
        return !!(app.getHotbarContainer()?.gridContainers?.length
            && app.getPortraitContainer()?.element
            && app.getWeaponSetContainer()?.gridContainers?.length
            && app.getQuickAccessContainer()?.gridContainers?.length);
    }

    /**
     * @private
     */
    _stateMatchesExistingLayout(state) {
        if (!state) return false;
        const app = this.app;
        const hotbar = app.getHotbarContainer();
        if (!state.hotbar?.grids || !hotbar?.gridContainers) return false;
        if (state.hotbar.grids.length !== hotbar.gridContainers.length) return false;
        const weaponSets = app.getWeaponSetContainer();
        if (!state.weaponSets?.sets || !weaponSets?.gridContainers) return false;
        if (state.weaponSets.sets.length !== weaponSets.gridContainers.length) return false;
        const quickAccess = app.getQuickAccessContainer();
        if (!state.quickAccess?.grids || !quickAccess?.gridContainers) return false;
        if (state.quickAccess.grids.length !== quickAccess.gridContainers.length) return false;
        return true;
    }

    /**
     * @private
     */
    _rebindComponentActors(actor, token) {
        const app = this.app;
        const hotbar = app.getHotbarContainer();
        if (hotbar && typeof hotbar.setActorToken === 'function') {
            hotbar.setActorToken(actor, token);
        } else if (hotbar) {
            hotbar.actor = actor;
            hotbar.token = token;
            if (hotbar.activeEffectsContainer) {
                hotbar.activeEffectsContainer.actor = actor;
                hotbar.activeEffectsContainer.token = token;
            }
            if (hotbar.passivesContainer) {
                hotbar.passivesContainer.actor = actor;
                hotbar.passivesContainer.token = token;
            }
        }

        const weaponSets = app.getWeaponSetContainer();
        if (weaponSets) {
            weaponSets.actor = actor;
            weaponSets.token = token;
        }
        const quickAccess = app.getQuickAccessContainer();
        if (quickAccess) {
            quickAccess.actor = actor;
            quickAccess.token = token;
        }
        const info = app.getInfoContainer();
        if (info) {
            info.actor = actor;
            info.token = token;
        }
        const portrait = app.getPortraitContainer();
        if (portrait) {
            portrait.actor = actor;
            portrait.token = token;
            if (portrait.infoContainer) {
                portrait.infoContainer.actor = actor;
                portrait.infoContainer.token = token;
            }
        }
        const filters = app.getFilterContainer();
        if (filters) {
            filters.actor = actor;
            filters.token = token;
        }
        const actionButtons = app.getActionButtonsContainer();
        if (actionButtons) {
            actionButtons.actor = actor;
            actionButtons.token = token;
        }
        for (const id of app.componentFactory.getRegisteredContainerIds('left')) {
            const comp = app.getRegisteredContainer(id);
            if (comp) {
                comp.actor = actor;
                comp.token = token;
            }
        }
    }

    /**
     * @private
     */
    async _syncHotbarViewsForActor() {
        const app = this.app;
        const isPlayerCharacter = BG3HUD_API.isPlayerCharacter(app.currentActor);
        const minimalistView = game.settings.get('bg3-hud-core', 'minimalistView') === true;
        const showViews = isPlayerCharacter && !minimalistView;
        const hotbar = app.getHotbarContainer();
        if (!hotbar?.element) return;

        if (showViews && !app.components.views) {
            app.components.views = new HotbarViewsContainer({ hotbarApp: app });
            hotbar.element.appendChild(await app.components.views.render());
        } else if (!showViews && app.components.views) {
            app.components.views.destroy();
            delete app.components.views;
        } else if (showViews && app.components.views) {
            await app.components.views.render();
        }
    }

    /**
     * Reload persist for the new Token and patch live named parts (no fade).
     * @private
     */
    async _softTokenSwapRefresh() {
        const app = this.app;
        app.persistenceManager.setToken(app.currentToken);
        let state = await app.persistenceManager.loadState();
        state = await app.persistenceManager.hydrateState(state);

        if (!this._stateMatchesExistingLayout(state)) {
            await app.refresh({ forceFull: true });
            return;
        }

        this._rebindComponentActors(app.currentActor, app.currentToken);
        await app.updateCoordinator.applyUnifiedState(state);

        if (app.getActiveEffectsContainer()) {
            await app.getActiveEffectsContainer().render();
        }
        if (app.getPassivesContainer()) {
            await app.getPassivesContainer().render();
        }

        const portrait = app.getPortraitContainer();
        if (portrait && typeof portrait.swapTokenContext === 'function') {
            await portrait.swapTokenContext(app.currentActor, app.currentToken);
        }

        await this._syncHotbarViewsForActor();

        const filters = app.getFilterContainer();
        if (filters && typeof filters.update === 'function') {
            await filters.update();
        }

        for (const id of app.componentFactory.getRegisteredContainerIds('left')) {
            const comp = app.getRegisteredContainer(id);
            if (comp && typeof comp.render === 'function') {
                await comp.render();
            }
        }

        const actionButtons = app.getActionButtonsContainer();
        if (actionButtons && typeof actionButtons.render === 'function') {
            await actionButtons.render();
        }

        app.updateDisplaySettings();
        applyMacrobarCollapseSetting(app.isVisible);
        applyAppearanceSettings();
        app._finalizeRenderVisibility();
    }
}

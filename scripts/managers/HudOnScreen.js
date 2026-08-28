import { BG3HUD_API, BG3HUD_REGISTRY } from '../utils/registry.js';
import { applyAppearanceSettings, applyMacrobarCollapseSetting } from '../utils/settings.js';
import { HotbarViewsContainer } from '../components/containers/HotbarViewsContainer.js';
import { Logger } from '../utils/logger.js';

/**
 * Switch unit: what the HUD is on screen for (ADR-0002).
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
        const adapter = BG3HUD_REGISTRY.activeAdapter;
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
        const app = this.app;
        if (!app.rendered) {
            await app.refresh();
            return;
        }

        if (app.currentToken && this._canSoftTokenRefresh()) {
            app._refreshGeneration++;
            try {
                await this._softTokenSwapRefresh();
            } finally {
                app._refreshGeneration++;
            }
            return;
        }

        await app.refresh();
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
        const c = app.components;
        return !!(c?.hotbar?.gridContainers?.length
            && c?.portrait?.element
            && c?.weaponSets?.gridContainers?.length
            && c?.quickAccess?.gridContainers?.length);
    }

    /**
     * @private
     */
    _stateMatchesExistingLayout(state) {
        if (!state) return false;
        const app = this.app;
        const hotbar = app.components?.hotbar;
        if (!state.hotbar?.grids || !hotbar?.gridContainers) return false;
        if (state.hotbar.grids.length !== hotbar.gridContainers.length) return false;
        const weaponSets = app.components?.weaponSets;
        if (!state.weaponSets?.sets || !weaponSets?.gridContainers) return false;
        if (state.weaponSets.sets.length !== weaponSets.gridContainers.length) return false;
        const quickAccess = app.components?.quickAccess;
        if (!state.quickAccess?.grids || !quickAccess?.gridContainers) return false;
        if (state.quickAccess.grids.length !== quickAccess.gridContainers.length) return false;
        return true;
    }

    /**
     * @private
     */
    _rebindComponentActors(actor, token) {
        const app = this.app;
        const hotbar = app.components.hotbar;
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

        if (app.components.weaponSets) {
            app.components.weaponSets.actor = actor;
            app.components.weaponSets.token = token;
        }
        if (app.components.quickAccess) {
            app.components.quickAccess.actor = actor;
            app.components.quickAccess.token = token;
        }
        if (app.components.info) {
            app.components.info.actor = actor;
            app.components.info.token = token;
        }
        if (app.components.portrait) {
            app.components.portrait.actor = actor;
            app.components.portrait.token = token;
            if (app.components.portrait.infoContainer) {
                app.components.portrait.infoContainer.actor = actor;
                app.components.portrait.infoContainer.token = token;
            }
        }
        if (app.components.filters) {
            app.components.filters.actor = actor;
            app.components.filters.token = token;
        }
        if (app.components.actionButtons) {
            app.components.actionButtons.actor = actor;
            app.components.actionButtons.token = token;
        }
        for (const id of app.componentFactory.getRegisteredContainerIds('left')) {
            const comp = app.components[id];
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
        const hotbar = app.components.hotbar;
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

        if (app.components.hotbar?.activeEffectsContainer) {
            await app.components.hotbar.activeEffectsContainer.render();
        }
        if (app.components.hotbar?.passivesContainer) {
            await app.components.hotbar.passivesContainer.render();
        }

        if (app.components.portrait && typeof app.components.portrait.swapTokenContext === 'function') {
            await app.components.portrait.swapTokenContext(app.currentActor, app.currentToken);
        }

        await this._syncHotbarViewsForActor();

        if (app.components.filters && typeof app.components.filters.update === 'function') {
            await app.components.filters.update();
        }

        for (const id of app.componentFactory.getRegisteredContainerIds('left')) {
            const comp = app.components[id];
            if (comp && typeof comp.render === 'function') {
                await comp.render();
            }
        }

        if (app.components.actionButtons && typeof app.components.actionButtons.render === 'function') {
            await app.components.actionButtons.render();
        }

        app.updateDisplaySettings();
        applyMacrobarCollapseSetting(app.isVisible);
        applyAppearanceSettings();

        const adapter = BG3HUD_API.getActiveAdapter();
        if (adapter?.updateCellDepletionStates && app.currentActor) {
            queueMicrotask(() => {
                try {
                    adapter.updateCellDepletionStates(app.currentActor, { _force: true });
                } catch (e) {
                    Logger.warn('updateCellDepletionStates after Token switch failed:', e);
                }
            });
        }
    }
}

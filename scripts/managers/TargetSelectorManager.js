import { TargetSelectorUI } from './TargetSelectorUI.js';
import { TargetSelectorMath } from './TargetSelectorMath.js';
import { TargetSelectorEvents } from './TargetSelectorEvents.js';
import { Logger } from '../utils/logger.js';
import { areaKind, tokensInArea } from '../target-select/inclusion.js';

/**
 * BG3 Target Selector Manager
 * Main orchestrator for interactive target selection during item/spell use.
 * Coordinates UI, events, and math components while delegating system-specific
 * logic to the registered adapter.
 */
export class TargetSelectorManager {
    /**
     * @param {Object} options
     * @param {Object} options.adapter - The registered system adapter
     */
    constructor({ adapter = null } = {}) {
        this.adapter = adapter;

        // Component instances
        this.ui = new TargetSelectorUI(this);
        this.events = new TargetSelectorEvents(this);

        // Selection state
        this.sourceToken = null;
        this.item = null;
        this.activity = null;
        this.requirements = {};
        this.selectedTargets = [];
        this.isActive = false;

        // Promise resolution
        this._resolvePromise = null;
        this._rejectPromise = null;

        // Original control tool state
        this._originalTool = null;
    }

    /**
     * Set the system adapter.
     * @param {Object} adapter - The system adapter instance
     */
    setAdapter(adapter) {
        this.adapter = adapter;
    }

    /**
     * Start the target selection process.
     * @param {Object} options
     * @param {Token} options.token - The source token (caster/attacker)
     * @param {Item} options.item - The item being used
     * @param {Object} options.activity - Optional activity for multi-activity items
     * @returns {Promise<Token[]>} Promise that resolves with selected targets
     */
    async select({ token, item, activity = null }) {
        if (this.isActive) {
            Logger.warn('Target selector is already active');
            return [];
        }

        this.sourceToken = token;
        this.item = item;
        this.activity = activity;

        // Get targeting requirements from adapter.
        // Creature-pick always opens. Existing Foundry targets are not a choice.
        this.requirements = this._getTargetRequirements();

        return new Promise((resolve, reject) => {
            this._resolvePromise = resolve;
            this._rejectPromise = reject;
            this._activate();
        });
    }

    /**
     * Check if an item/activity needs targeting.
     * @param {Item} item - The item to check
     * @param {Object} activity - Optional activity
     * @returns {boolean} True if targeting is required
     */
    needsTargeting(item, activity = null) {
        // Adapter must provide targeting rules - no fallback guessing
        if (!this.adapter?.targetingRules?.needsTargeting) {
            return false;
        }

        return this.adapter.targetingRules.needsTargeting({ item, activity });
    }

    /**
     * Toggle target selection for a token.
     * @param {Token} token - The token to toggle
     */
    toggleTarget(token) {
        const index = this.selectedTargets.indexOf(token);

        if (index > -1) {
            // Remove target
            this.selectedTargets.splice(index, 1);
            token.setTarget(false, { user: game.user, releaseOthers: false, groupSelection: true });
        } else {
            // Add target (if under max limit)
            const maxTargets = this.requirements.maxTargets || 1;
            if (this.selectedTargets.length < maxTargets) {
                this.selectedTargets.push(token);
                token.setTarget(true, { user: game.user, releaseOthers: false, groupSelection: true });
            } else {
                ui.notifications.warn(
                    game.i18n.format('bg3-hud-core.TargetSelector.MaxTargetsReached', { max: maxTargets })
                );
                return;
            }
        }

        // Update UI
        this.ui.updateTargetCount(this.selectedTargets.length, this.requirements.maxTargets || 1);
    }

    /**
     * Validate if a token is a valid target.
     * Exists, the game's own target rule (unless overridden), and range (if enabled).
     * @param {Token} token - The token to validate
     * @returns {{valid: boolean, reason: string|null}} Validation result
     */
    validateTarget(token) {
        if (!token?.actor) {
            return { valid: false, reason: game.i18n.localize('bg3-hud-core.TargetSelector.InvalidTarget') };
        }

        // Who is legal is decided by the system adapter.
        const ignoreType = game.settings.get('bg3-hud-core', 'ignoreTargetTypeRestrictions') ?? false;
        if (!ignoreType && this.adapter?.targetingRules?.isValidTargetType) {
            const adapterValidation = this.adapter.targetingRules.isValidTargetType({
                sourceToken: this.sourceToken,
                targetToken: token,
                requirements: this.requirements
            });
            if (!adapterValidation.valid) {
                return adapterValidation;
            }
        }

        // Range (optional setting)
        if (this._isRangeCheckingEnabled() && this.requirements.range) {
            const distance = TargetSelectorMath.calculateTokenDistance(this.sourceToken, token);

            let range = this.requirements.range;
            if (typeof range === 'string') {
                const numericMatch = range.match(/^(\d+)/);
                range = numericMatch ? parseInt(numericMatch[1], 10) : Infinity;
            }

            if (distance > range) {
                return {
                    valid: false,
                    reason: game.i18n.localize('bg3-hud-core.TargetSelector.OutOfRange') + ` (${Math.round(distance)}/${range})`
                };
            }
        }

        return { valid: true, reason: null };
    }

    /**
     * Adjust the maximum target count.
     * @param {number} delta - Change in max targets (+1 or -1)
     */
    adjustMaxTargets(delta) {
        const newMax = Math.max(1, (this.requirements.maxTargets || 1) + delta);
        this.requirements.maxTargets = newMax;

        // Cap minTargets to the new maxTargets (ensures min <= max)
        // This fixes Issue #23: users can now confirm with fewer than original min targets
        if (this.requirements.minTargets > newMax) {
            this.requirements.minTargets = newMax;
        }

        // Remove excess targets if new max is lower
        while (this.selectedTargets.length > newMax) {
            const removedTarget = this.selectedTargets.pop();
            removedTarget.setTarget(false, { user: game.user, releaseOthers: false, groupSelection: true });
        }

        // Update UI
        this.ui.updateTargetCount(this.selectedTargets.length, newMax);
    }

    /**
     * Confirm the current selection.
     */
    confirmSelection() {
        const minTargets = this.requirements.minTargets || 1;

        if (this.selectedTargets.length < minTargets) {
            ui.notifications.warn(
                game.i18n.format('bg3-hud-core.TargetSelector.MinTargetsRequired', { min: minTargets })
            );
            return;
        }

        this._deactivate();

        if (this._resolvePromise) {
            this._resolvePromise([...this.selectedTargets]);
            this._resolvePromise = null;
            this._rejectPromise = null;
        }
    }

    /**
     * Cancel target selection.
     */
    cancel() {
        // Clear all targets when cancelling
        this.selectedTargets.forEach(target => {
            target.setTarget(false, { user: game.user, releaseOthers: false, groupSelection: true });
        });

        this._deactivate();

        if (this._resolvePromise) {
            this._resolvePromise([]);
            this._resolvePromise = null;
            this._rejectPromise = null;
        }
    }

    /**
     * Sync internal state with Foundry's targeting.
     * Called when targeting changes outside our selector.
     */
    syncWithFoundryTargets() {
        const foundryTargets = Array.from(game.user.targets);

        // Validate each Foundry target
        const validTargets = foundryTargets.filter(token => {
            const validation = this.validateTarget(token);
            return validation.valid;
        });

        // Enforce max targets
        const maxTargets = this.requirements.maxTargets || 1;
        if (validTargets.length > maxTargets) {
            ui.notifications.warn(
                game.i18n.format('bg3-hud-core.TargetSelector.MaxTargetsReached', { max: maxTargets })
            );
        }

        this.selectedTargets = validTargets.slice(0, maxTargets);
        this.ui.updateTargetCount(this.selectedTargets.length, maxTargets);
    }

    /**
     * Show range indicator for an item without activating full selector.
     * Used for AoE templates or other range visualization needs.
     * @param {Object} params
     * @param {Token} params.token - The source token
     * @param {Item} params.item - The item
     * @param {Object} [params.activity] - Optional activity
     */
    showRangeIndicator({ token, item, activity = null }) {
        if (!token || !item || !this.adapter) return;

        // Calculate range using adapter rules
        const rangeInfo = this.adapter.targetingRules.calculateRange({
            item,
            activity,
            actor: token.actor
        });

        if (rangeInfo.range && rangeInfo.range > 0) {
            this.ui.showRangeIndicator(token, rangeInfo.range);
        }
    }

    /**
     * Hide the range indicator.
     */
    hideRangeIndicator() {
        this.ui.removeRangeIndicator();
    }

    // ========== Private Methods ==========

    /**
     * Activate the target selector.
     * @private
     */
    _activate() {
        this.isActive = true;
        this.selectedTargets = [];

        // Store for debugging
        window.bg3TargetSelector = this;

        // Switch to target tool
        this._switchToTargetTool();

        // Activate UI
        Logger.warn('Manager: Calling UI.activate with:', {
            range: this.requirements.range,
            sourceToken: this.sourceToken?.name,
            requirements: this.requirements
        });
        this.ui.activate(this.requirements);

        // Register events (includes targetToken hook for real-time sync)
        this.events.registerEvents();

        // Notification
        ui.notifications.info(
            game.i18n.format('bg3-hud-core.TargetSelector.Activated', {
                cancel: 'Escape',
                confirm: 'Enter'
            })
        );
    }

    /**
     * Deactivate the target selector.
     * @private
     */
    _deactivate() {
        if (!this.isActive) {
            return;
        }

        this.isActive = false;

        // Clear debug reference
        if (window.bg3TargetSelector === this) {
            window.bg3TargetSelector = null;
        }

        // Deactivate UI
        this.ui.deactivate();

        // Restore token tool
        this._restoreTokenTool();

        // Unregister events (includes targetToken hook cleanup)
        this.events.unregisterEvents();
    }

    /**
     * Get targeting requirements from adapter.
     * @returns {Object} Target requirements
     * @private
     */
    _getTargetRequirements() {
        // Adapter must provide targeting rules - return defaults if not
        if (!this.adapter?.targetingRules?.getTargetRequirements) {
            Logger.warn('No targeting rules available, using defaults');
            return {
                minTargets: 1,
                maxTargets: 1,
                range: null,
                targetType: 'any',
                hasTemplate: false
            };
        }

        return this.adapter.targetingRules.getTargetRequirements({
            item: this.item,
            activity: this.activity
        });
    }

    /**
     * Area-fill: this click places the Area and confirms.
     * @param {{x:number,y:number}} point Canvas coordinates
     */
    placeArea(point) {
        if (!this.isActive || !this.requirements?.hasTemplate || !point) return;

        if (this._isRangeCheckingEnabled() && this._pointOutOfRange(point)) {
            ui.notifications.warn(game.i18n.localize('bg3-hud-core.TargetSelector.OutOfRange'));
            return;
        }

        const template = this.requirements.template || {};
        const gridSize = canvas?.grid?.size || 100;
        const sceneDistance = canvas?.scene?.grid?.distance || 5;
        const feet = Number(template.size ?? template.distance ?? 0);
        const sizePx = feet > 0 ? (feet / sceneDistance) * gridSize : gridSize;
        const kind = areaKind(template.type);
        const fromCaster = kind === 'cone' || kind === 'line' || template.type === 'emanation';
        const caster = this.sourceToken?.center || point;
        const origin = fromCaster ? { x: caster.x, y: caster.y } : point;
        const tokens = canvas?.tokens?.placeables || [];
        const hits = tokensInArea(
            tokens.map((token) => ({
                token,
                x: token.x,
                y: token.y,
                w: token.w,
                h: token.h,
                hasActor: !!token.actor
            })),
            {
                kind,
                origin,
                toward: point,
                size: sizePx,
                width: gridSize
            }
        );

        const selected = hits.map((hit) => hit.token);
        if (!selected.length) {
            for (const token of Array.from(game.user?.targets || [])) {
                token.setTarget(false, { user: game.user, releaseOthers: false, groupSelection: true });
            }
        }
        selected.forEach((token, index) => {
            token.setTarget(true, {
                user: game.user,
                releaseOthers: index === 0,
                groupSelection: true
            });
        });
        this.selectedTargets = selected;
        this._deactivate();

        if (this._resolvePromise) {
            const result = selected.slice();
            result.placed = true;
            this._resolvePromise(result);
            this._resolvePromise = null;
            this._rejectPromise = null;
        }
    }

    /**
     * @param {{x:number,y:number}} point
     * @returns {boolean}
     * @private
     */
    _pointOutOfRange(point) {
        const range = this.requirements?.range;
        if (!range || !this.sourceToken || !canvas?.grid?.size) return false;
        const gridSize = canvas.grid.size;
        const dx = Math.abs(point.x - this.sourceToken.center.x) / gridSize;
        const dy = Math.abs(point.y - this.sourceToken.center.y) / gridSize;
        return Math.max(dx, dy) > range;
    }

    /**
     * Check if range checking is enabled.
     * @returns {boolean}
     * @private
     */
    _isRangeCheckingEnabled() {
        return game.settings.get('bg3-hud-core', 'enableRangeChecking') ?? true;
    }

    /**
     * Switch to target tool.
     * @private
     */
    _switchToTargetTool() {
        const activeControlName = ui.controls.control?.name || ui.controls.activeControl; // Fallback for older versions

        if (activeControlName !== 'token') {
            return;
        }

        this._originalTool = ui.controls.activeTool;

        // Switch to target tool if available
        const targetTool = ui.controls.tools?.find(t => t.name === 'target');
        if (targetTool) {
            ui.controls.activeTool = 'target';
            ui.controls.render();
        }
    }

    /**
     * Restore original token tool.
     * @private
     */
    _restoreTokenTool() {
        const activeControlName = ui.controls.control?.name || ui.controls.activeControl;

        if (this._originalTool && activeControlName === 'token') {
            ui.controls.activeTool = this._originalTool;
            ui.controls.render();
            this._originalTool = null;
        }
    }



    /**
     * Clean up resources.
     */
    destroy() {
        this._deactivate();
        this.ui.destroy();
        this.events.destroy();
    }
}

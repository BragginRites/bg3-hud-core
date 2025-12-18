import { TargetSelectorUI } from './TargetSelectorUI.js';
import { TargetSelectorMath } from './TargetSelectorMath.js';
import { TargetSelectorEvents } from './TargetSelectorEvents.js';

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
            console.warn('BG3 HUD Core | Target selector is already active');
            return [];
        }

        this.sourceToken = token;
        this.item = item;
        this.activity = activity;

        // Get targeting requirements from adapter
        this.requirements = this._getTargetRequirements();

        // Check if we should skip the selector
        if (this._shouldSkipSelector()) {
            const existingTargets = Array.from(game.user.targets);
            return existingTargets;
        }

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
        if (!this.adapter?.targetingRules?.needsTargeting) {
            // Fallback: items with range and target settings need targeting
            return this._fallbackNeedsTargeting(item, activity);
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
     * @param {Token} token - The token to validate
     * @returns {{valid: boolean, reason: string|null}} Validation result
     */
    validateTarget(token) {
        if (!token) {
            return { valid: false, reason: game.i18n.localize('bg3-hud-core.TargetSelector.InvalidTarget') };
        }

        // Check visibility
        if (!token.isVisible || token.document.hidden) {
            return { valid: false, reason: game.i18n.localize('bg3-hud-core.TargetSelector.TokenNotVisible') };
        }

        // Check range if enabled
        if (this._isRangeCheckingEnabled() && this.requirements.range) {
            const distance = TargetSelectorMath.calculateTokenDistance(this.sourceToken, token);

            // Ensure range is a number (adapters might return strings like "60 feet")
            let range = this.requirements.range;
            if (typeof range === 'string') {
                const numericMatch = range.match(/^(\d+)/);
                range = numericMatch ? parseInt(numericMatch[1], 10) : Infinity;
            }

            const isInRange = distance <= range;

            console.log(`BG3 HUD Core | Range Check: ${this.sourceToken?.name} → ${token?.name}`, {
                distance,
                range,
                originalRange: this.requirements.range,
                isInRange,
                sourcePosition: { x: this.sourceToken?.x, y: this.sourceToken?.y, w: this.sourceToken?.w, h: this.sourceToken?.h },
                targetPosition: { x: token?.x, y: token?.y, w: token?.w, h: token?.h },
                gridSize: canvas?.grid?.size,
                gridDistance: canvas?.grid?.distance
            });

            if (!isInRange) {
                return {
                    valid: false,
                    reason: game.i18n.localize('bg3-hud-core.TargetSelector.OutOfRange') + ` (${Math.round(distance)}/${range})`
                };
            }
        }

        // Check target type via adapter
        if (this.adapter?.targetingRules?.isValidTargetType) {
            const adapterValidation = this.adapter.targetingRules.isValidTargetType({
                sourceToken: this.sourceToken,
                targetToken: token,
                requirements: this.requirements
            });

            if (!adapterValidation.valid) {
                return adapterValidation;
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

        // Auto-target self if enabled and valid
        if (this._shouldAutoTargetSelf()) {
            const validation = this.validateTarget(this.sourceToken);
            if (validation.valid) {
                this.toggleTarget(this.sourceToken);
            }
        }

        // Switch to target tool
        this._switchToTargetTool();

        // Activate UI
        console.warn('BG3 HUD Core | Manager: Calling UI.activate with:', {
            range: this.requirements.range,
            sourceToken: this.sourceToken?.name,
            requirements: this.requirements
        });
        this.ui.activate(this.requirements);

        // Register events
        console.warn('BG3 HUD Core | Manager: Registering events');
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

        // Unregister events
        this.events.unregisterEvents();
    }

    /**
     * Get targeting requirements from adapter.
     * @returns {Object} Target requirements
     * @private
     */
    _getTargetRequirements() {
        if (!this.adapter?.targetingRules?.getTargetRequirements) {
            return this._fallbackGetRequirements();
        }

        return this.adapter.targetingRules.getTargetRequirements({
            item: this.item,
            activity: this.activity
        });
    }

    /**
     * Check if selector should be skipped.
     * @returns {boolean} True if should skip
     * @private
     */
    _shouldSkipSelector() {
        // Check setting
        const skipWithValidTarget = game.settings.get('bg3-hud-core', 'skipSelectorWithValidTarget') ?? true;
        if (!skipWithValidTarget) {
            return false;
        }

        // Only skip for single-target
        const maxTargets = this.requirements.maxTargets || 1;
        if (maxTargets !== 1) {
            return false;
        }

        // Check if exactly one valid target exists
        const currentTargets = Array.from(game.user.targets);
        if (currentTargets.length !== 1) {
            return false;
        }

        // Validate the current target
        const validation = this.validateTarget(currentTargets[0]);
        return validation.valid;
    }

    /**
     * Check if should auto-target self.
     * @returns {boolean}
     * @private
     */
    _shouldAutoTargetSelf() {
        const autoTargetSelf = game.settings.get('bg3-hud-core', 'autoTargetSelf') ?? false;
        if (!autoTargetSelf) {
            return false;
        }

        // Don't auto-target self if target type is 'other'
        if (this.requirements.targetType === 'other') {
            return false;
        }

        return true;
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
     * Fallback needs targeting check when adapter doesn't provide one.
     * @param {Item} item
     * @param {Object} activity
     * @returns {boolean}
     * @private
     */
    _fallbackNeedsTargeting(item, activity) {
        if (!item) {
            return false;
        }

        // Check for target configuration
        const target = activity?.target || item.system?.target;
        if (target?.type && !['self', 'none'].includes(target.type)) {
            return true;
        }

        // Check for range
        const range = activity?.range || item.system?.range;
        if (range?.value && range.value > 0 && range.units !== 'self') {
            return true;
        }

        return false;
    }

    /**
     * Fallback get requirements when adapter doesn't provide one.
     * @returns {Object}
     * @private
     */
    _fallbackGetRequirements() {
        const target = this.activity?.target || this.item?.system?.target;
        const range = this.activity?.range || this.item?.system?.range;

        return {
            minTargets: 1,
            maxTargets: target?.value || target?.affects?.count || 1,
            range: TargetSelectorMath.getRangeInSceneUnits(range?.value, range?.units),
            targetType: target?.type || target?.affects?.type || 'any',
            hasTemplate: !!target?.template?.type
        };
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

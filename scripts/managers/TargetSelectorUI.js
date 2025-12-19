/**
 * Target Selector UI Manager
 * Handles all UI elements and display logic for the target selector.
 * Manages DOM elements, canvas overlays, and visual feedback.
 */
export class TargetSelectorUI {
    /**
     * @param {TargetSelectorManager} manager - The parent manager instance
     */
    constructor(manager) {
        this.manager = manager;

        // DOM elements
        this._instructionsElement = null;
        this._mouseDisplayElement = null;
        this._targetListElement = null;
        this._overlayElement = null;

        // Canvas graphics
        this._rangeIndicator = null;

        // Animation frames
        this._animationFrame = null;

        // Original cursor style
        this._originalCursor = null;
    }

    /**
     * Initialize UI when target selector activates.
     * @param {Object} requirements - Targeting requirements
     */
    activate(requirements) {
        console.warn('BG3 HUD Core | UI: Activate called', requirements);

        this._createInstructionsDisplay(requirements);
        this._createMouseDisplay(requirements);
        this._setTargetingCursor();

        // Show the target list dialog immediately
        this.showTargetList();

        if (requirements.range && this.manager.sourceToken) {
            console.warn('BG3 HUD Core | UI: Attempting to show range indicator', { range: requirements.range, token: this.manager.sourceToken.name });
            try {
                this.showRangeIndicator(this.manager.sourceToken, requirements.range);
            } catch (e) {
                console.error('BG3 HUD Core | Error showing range indicator:', e);
            }
        } else {
            console.warn('BG3 HUD Core | UI: Skipping range indicator', { range: requirements.range, hasSourceToken: !!this.manager.sourceToken });
        }

        // Add targeting class to body
        document.body.classList.add('bg3-targeting');
    }

    /**
     * Clean up all UI elements on deactivation.
     */
    deactivate() {
        this._removeInstructionsDisplay();
        this._removeMouseDisplay();
        this._removeTargetListDisplay();
        this.removeRangeIndicator();
        this._restoreOriginalCursor();

        // Remove targeting class from body
        document.body.classList.remove('bg3-targeting');

        // Cancel any pending animations
        if (this._animationFrame) {
            cancelAnimationFrame(this._animationFrame);
            this._animationFrame = null;
        }
    }

    /**
     * Update the mouse position display.
     * @param {number} x - Mouse X position
     * @param {number} y - Mouse Y position
     */
    updateMousePosition(x, y) {
        if (!this._mouseDisplayElement) {
            return;
        }

        // Offset from cursor
        const offsetX = 20;
        const offsetY = -20;

        this._mouseDisplayElement.style.left = `${x + offsetX}px`;
        this._mouseDisplayElement.style.top = `${y + offsetY}px`;
    }

    /**
     * Update target count displays.
 * @param {number} currentCount - Current number of selected targets
 * @param {number} maxTargets - Maximum targets allowed
 */
    updateTargetCount(currentCount, maxTargets) {
        // Update mouse display
        if (this._mouseDisplayElement) {
            const countElement = this._mouseDisplayElement.querySelector('.target-count');
            if (countElement) {
                countElement.textContent = `${currentCount}/${maxTargets === Infinity ? '∞' : maxTargets}`;
            }
        }

        // Update target list if shown
        this._updateTargetList();
    }

    /**
     * Show the target list dialog with detailed info.
     * Inspired by midi-qol's target confirmation dialog.
     */
    async showTargetList() {
        if (this._targetListElement) {
            this._updateTargetList();
            return;
        }

        const position = this._getTargetListPosition();

        this._targetListElement = document.createElement('div');
        this._targetListElement.id = 'bg3-target-list';
        this._targetListElement.className = 'bg3-target-list-dialog';
        this._targetListElement.style.cssText = `
            position: fixed;
            left: ${position.left}px;
            top: ${position.top}px;
            z-index: var(--bg3-z-target-selector, 10000);
        `;

        await this._updateTargetList();
        document.body.appendChild(this._targetListElement);
    }

    /**
     * Enable dragging for the target list dialog.
     * @private
     */
    _enableDragging() {
        // Cleanup previous listeners if they exist to prevent duplicates
        if (this._dragCleanup) {
            this._dragCleanup();
            this._dragCleanup = null;
        }

        if (!this._targetListElement) return;

        const header = this._targetListElement.querySelector('.bg3-target-list-header');
        if (!header) return;

        header.style.cursor = 'grab';

        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        const onMouseDown = (e) => {
            // Ignore if clicking buttons in header
            if (e.target.closest('button')) return;

            isDragging = true;
            header.style.cursor = 'grabbing';

            startX = e.clientX;
            startY = e.clientY;

            const rect = this._targetListElement.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;

            // Prevent text selection
            e.preventDefault();
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            this._targetListElement.style.left = `${initialLeft + dx}px`;
            this._targetListElement.style.top = `${initialTop + dy}px`;
        };

        const onMouseUp = async () => {
            if (!isDragging) return;

            isDragging = false;
            header.style.cursor = 'grab';

            // Save new position
            const rect = this._targetListElement.getBoundingClientRect();
            try {
                await game.user.setFlag('bg3-hud-core', 'targetSelectorPos', {
                    left: rect.left,
                    top: rect.top
                });
            } catch (err) {
                console.warn('BG3 HUD Core | Failed to save target selector position:', err);
            }
        };

        header.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        // Store cleanup function
        this._dragCleanup = () => {
            header.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }

    // ========== Private Methods ==========

    /**
     * Create the full-screen overlay to intercept clicks.
     * @private
     */
    _createOverlay() {
        this._removeOverlay();

        this._overlayElement = document.createElement('div');
        this._overlayElement.id = 'bg3-target-overlay';
        this._overlayElement.className = 'bg3-target-overlay';

        // Styles are important here for blocking interaction
        this._overlayElement.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            z-index: var(--bg3-z-target-overlay, 900);
            cursor: crosshair;
            background: transparent;
            pointer-events: none;
        `;

        document.body.appendChild(this._overlayElement);
    }

    /**
     * Remove the overlay.
     * @private
     */
    _removeOverlay() {
        if (this._overlayElement) {
            this._overlayElement.remove();
            this._overlayElement = null;
        }
    }

    /**
     * Create the instructions display at bottom of screen.
     * @param {Object} requirements - Targeting requirements
     * @private
     */
    _createInstructionsDisplay(requirements) {
        this._removeInstructionsDisplay();

        const confirmKey = this._getConfirmKeybindDisplay();
        const adjustKeys = this._getAdjustKeybindDisplay();

        const minTargets = requirements.minTargets || 1;
        const maxTargets = requirements.maxTargets === Infinity
            ? game.i18n.localize('bg3-hud-core.TargetSelector.Unlimited')
            : requirements.maxTargets || 1;

        let instructionText = game.i18n.format('bg3-hud-core.TargetSelector.Instructions', {
            min: minTargets,
            max: maxTargets,
            confirm: confirmKey,
            cancel: 'Escape'
        });

        if (requirements.maxTargets !== 1) {
            instructionText += ` | ${adjustKeys}`;
        }

        this._instructionsElement = document.createElement('div');
        this._instructionsElement.className = 'bg3-target-instructions';
        this._instructionsElement.innerHTML = instructionText;

        document.body.appendChild(this._instructionsElement);
    }

    /**
     * Remove the instructions display.
     * @private
     */
    _removeInstructionsDisplay() {
        if (this._instructionsElement) {
            this._instructionsElement.remove();
            this._instructionsElement = null;
        }
    }

    /**
     * Create the mouse-following display.
     * @param {Object} requirements - Targeting requirements
     * @private
     */
    _createMouseDisplay(requirements) {
        this._removeMouseDisplay();

        const maxTargets = requirements.maxTargets === Infinity
            ? '∞'
            : requirements.maxTargets || 1;

        this._mouseDisplayElement = document.createElement('div');
        this._mouseDisplayElement.id = 'bg3-mouse-target-display';
        this._mouseDisplayElement.className = 'bg3-mouse-target-display';
        this._mouseDisplayElement.innerHTML = `
            <span class="target-icon">🎯</span>
            <span class="target-count">0/${maxTargets}</span>
        `;

        // Start hidden, will be positioned on mouse move
        this._mouseDisplayElement.style.cssText = `
            position: fixed;
            pointer-events: none;
            z-index: var(--bg3-z-target-selector, 10000);
            left: 0;
            top: 0;
        `;

        document.body.appendChild(this._mouseDisplayElement);
    }

    /**
     * Remove the mouse display.
     * @private
     */
    _removeMouseDisplay() {
        if (this._mouseDisplayElement) {
            this._mouseDisplayElement.remove();
            this._mouseDisplayElement = null;
        }
    }

    /**
     * Remove the target list display.
     * @private
     */
    _removeTargetListDisplay() {
        if (this._targetListElement) {
            // Clean up drag listeners if they exist
            if (this._dragCleanup) {
                this._dragCleanup();
                this._dragCleanup = null;
            }
            this._targetListElement.remove();
            this._targetListElement = null;
        }
    }

    /**
     * Update the target list content.
     * @private
     */
    async _updateTargetList() {
        if (!this._targetListElement) {
            return;
        }

        const targets = this.manager.selectedTargets;
        const requirements = this.manager.requirements;
        const adapter = this.manager.adapter;

        let html = `
            <div class="bg3-target-list-header">
                <h3>${game.i18n.localize('bg3-hud-core.TargetSelector.SelectedTargets')}</h3>
                <div class="target-controls">
                    <span class="current-count">${targets.length}</span>
                    <span class="sep">/</span>
                    <div class="max-control">
                        <button type="button" class="adjust-btn" data-action="decrease-max" title="${game.i18n.localize('bg3-hud-core.TargetSelector.DecreaseMax')}">
                            <i class="fas fa-minus"></i>
                        </button>
                        <span class="max-count">${requirements.maxTargets === Infinity ? '∞' : requirements.maxTargets}</span>
                        <button type="button" class="adjust-btn" data-action="increase-max" title="${game.i18n.localize('bg3-hud-core.TargetSelector.IncreaseMax')}">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                </div>
            </div>
            <div class="bg3-target-list-content">
        `;

        if (targets.length === 0) {
            html += `<p class="no-targets">${game.i18n.localize('bg3-hud-core.TargetSelector.NoTargetsSelected')}</p>`;
        } else {
            for (const token of targets) {
                const targetInfo = await this._getTargetDisplayInfo(token, adapter);
                html += this._renderTargetItem(token, targetInfo);
            }
        }

        html += `
            </div>
            <div class="bg3-target-list-footer">
                <button type="button" class="confirm-btn" data-action="confirm">
                    <i class="fas fa-check"></i> ${game.i18n.localize('bg3-hud-core.TargetSelector.Confirm')}
                </button>
                <button type="button" class="cancel-btn" data-action="cancel">
                    <i class="fas fa-times"></i> ${game.i18n.localize('bg3-hud-core.TargetSelector.Cancel')}
                </button>
            </div>
        `;

        this._targetListElement.innerHTML = html;

        // Re-apply dragging style if needed (inner HTML update wipes it)
        const header = this._targetListElement.querySelector('.bg3-target-list-header');
        if (header) header.style.cursor = 'grab';

        // Attach button handlers
        this._targetListElement.querySelector('[data-action="confirm"]')?.addEventListener('click', () => {
            this.manager.confirmSelection();
        });
        this._targetListElement.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
            this.manager.cancel();
        });

        // Max targets adjustment handlers
        this._targetListElement.querySelector('[data-action="decrease-max"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.manager.adjustMaxTargets(-1);
        });
        this._targetListElement.querySelector('[data-action="increase-max"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.manager.adjustMaxTargets(1);
        });

        // Target remove button handlers
        this._targetListElement.querySelectorAll('.target-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tokenId = btn.dataset.tokenId;
                const token = canvas?.tokens?.get(tokenId);
                if (token) {
                    this.manager.toggleTarget(token);
                }
            });
        });

        // Re-enable dragging since DOM was replaced
        this._enableDragging();
    }

    /**
     * Get display info for a target token.
     * @param {Token} token - The target token
     * @param {Object} adapter - The system adapter
     * @returns {Promise<Object>} Target display info
     * @private
     */
    async _getTargetDisplayInfo(token, adapter) {
        const info = {
            name: token.name,
            img: token.document.texture.src,
            distance: null,
            inRange: true,
            details: []
        };

        // Calculate distance
        if (this.manager.sourceToken) {
            const { TargetSelectorMath } = await import('./TargetSelectorMath.js');
            info.distance = TargetSelectorMath.calculateTokenDistance(this.manager.sourceToken, token);

            if (this.manager.requirements.range) {
                info.inRange = info.distance <= this.manager.requirements.range;
                if (!info.inRange) {
                    info.details.push(game.i18n.localize('bg3-hud-core.TargetSelector.OutOfRange'));
                }
            }
        }

        // Get adapter-provided info (cover, flanking, etc.)
        if (adapter?.targetingRules?.getTargetInfo) {
            try {
                const adapterInfo = adapter.targetingRules.getTargetInfo({
                    sourceToken: this.manager.sourceToken,
                    targetToken: token,
                    item: this.manager.item,
                    activity: this.manager.activity
                });

                if (adapterInfo.coverStatus && adapterInfo.coverStatus !== 'none') {
                    info.details.push(adapterInfo.coverStatus);
                }
                if (adapterInfo.isFlanked) {
                    info.details.push(game.i18n.localize('bg3-hud-core.TargetSelector.Flanked'));
                }
            } catch (err) {
                console.warn('BG3 HUD Core | Error getting adapter target info:', err);
            }
        }

        return info;
    }

    /**
     * Render a single target item for the list.
     * @param {Token} token - The target token
     * @param {Object} info - Target display info
     * @returns {string} HTML string
     * @private
     */
    _renderTargetItem(token, info) {
        const gridDistance = canvas?.scene?.grid?.distance || 5;
        const gridUnits = canvas?.scene?.grid?.units || 'ft';

        // info.distance is in Grid Squares
        let distanceText = '';
        if (info.distance !== null) {
            // For now, default to Scene Units (e.g. 5 ft, 10 ft) unless specified otherwise
            // Could add a setting: game.settings.get('bg3-hud-core', 'showDistanceInSquares')
            const distanceInUnits = Math.round(info.distance * gridDistance);
            distanceText = `${distanceInUnits} ${gridUnits}`;

            // Debug: Show squares as well if needed, or if units are weird
            // distanceText += ` (${Math.round(info.distance)} sq)`; 
        }

        const rangeClass = info.inRange ? 'in-range' : 'out-of-range';
        const detailsText = info.details.length > 0 ? info.details.join(' | ') : '';

        return `
            <div class="bg3-target-item ${rangeClass}" data-token-id="${token.id}">
                <img src="${info.img}" alt="${info.name}" class="target-img" />
                <div class="target-info">
                    <span class="target-name">${info.name}</span>
                    ${distanceText ? `<span class="target-distance">${distanceText}</span>` : ''}
                    ${detailsText ? `<span class="target-details">${detailsText}</span>` : ''}
                </div>
                <button type="button" class="target-remove" data-token-id="${token.id}" title="${game.i18n.localize('bg3-hud-core.TargetSelector.RemoveTarget')}">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    }

    /**
     * Get position for the target list dialog.
     * @returns {{left: number, top: number}} Position
     * @private
     */
    _getTargetListPosition() {
        // Check for saved position
        const savedPos = game.user.getFlag('bg3-hud-core', 'targetSelectorPos');
        if (savedPos && typeof savedPos.left === 'number' && typeof savedPos.top === 'number') {
            return savedPos;
        }

        // Default to top-right
        const width = 300;
        const margin = 20;

        return {
            left: window.innerWidth - width - margin - (ui.sidebar?.element?.clientWidth || 0),
            top: margin
        };
    }

    /**
     * Show range indicator on canvas.
     * Public method to allow external usage (e.g. for AoE templates).
     * @param {Token} sourceToken - The source token
     * @param {number} range - Range in scene units
     */
    showRangeIndicator(sourceToken, range) {
        this.removeRangeIndicator();

        if (!canvas?.grid || !range || range <= 0) {
            return;
        }

        // Check if range indicators are enabled
        const showRangeIndicators = game.settings.get('bg3-hud-core', 'showRangeIndicators');
        // console.warn('BG3 HUD Core | Range Indicator Check:', { showRangeIndicators, range, sourceToken: sourceToken?.name });
        if (!showRangeIndicators) {
            // console.warn('BG3 HUD Core | Range indicator disabled in settings');
            return;
        }

        // Get settings
        const colorHex = game.settings.get('bg3-hud-core', 'rangeIndicatorColor') || '#00ff00';
        const color = parseInt(colorHex.replace('#', ''), 16);
        const lineWidth = game.settings.get('bg3-hud-core', 'rangeIndicatorLineWidth') || 2;
        const shape = game.settings.get('bg3-hud-core', 'rangeIndicatorShape') || 'circle';
        const animation = game.settings.get('bg3-hud-core', 'rangeIndicatorAnimation') || 'pulse';

        const gridSize = canvas.grid.size;

        // Range is now in GRID SQUARES (adapter converts feet/meters to squares)
        // So we just multiply by gridSize to get pixels
        const baseRangeInPixels = range * gridSize;

        // Get token size (width and height are in grid units)
        const tokenWidth = sourceToken.document.width || 1;
        const tokenHeight = sourceToken.document.height || 1;

        // Use the larger dimension, but never smaller than 1x1 (Medium creature minimum)
        const tokenSizeMultiplier = Math.max(1, Math.max(tokenWidth, tokenHeight));

        // Add half the token size to the range (since range is measured from edge, not center)
        const tokenSizeOffset = (tokenSizeMultiplier * gridSize) / 2;
        const rangeInPixels = baseRangeInPixels + tokenSizeOffset;

        // Create PIXI graphics
        this._rangeIndicator = new PIXI.Graphics();
        const indicatorColor = color || 0x00ff00;
        this._rangeIndicator.lineStyle(lineWidth || 2, indicatorColor, 0.8);
        // No fill - outline only

        // Draw shape based on setting (outline only)
        if (shape === 'square') {
            this._rangeIndicator.drawRect(-rangeInPixels, -rangeInPixels, rangeInPixels * 2, rangeInPixels * 2);
        } else {
            this._rangeIndicator.drawCircle(0, 0, rangeInPixels);
        }

        // Position at token center
        this._rangeIndicator.position.set(sourceToken.center.x, sourceToken.center.y);

        // Debug logging
        console.warn('BG3 HUD Core | Creating PIXI Graphics:', {
            radius: rangeInPixels,
            x: sourceToken.center.x,
            y: sourceToken.center.y,
            parent: canvas.interface ? 'canvas.interface' : 'canvas.stage',
            tokenSizeOffset,
            baseRangeInPixels,
            color: indicatorColor.toString(16)
        });

        // Add to canvas
        if (canvas.interface) {
            canvas.interface.addChild(this._rangeIndicator);
        } else {
            canvas.app.stage.addChild(this._rangeIndicator);
        }
        this._rangeIndicator.zIndex = 1000;

        // Start animation if enabled
        if (animation === 'pulse') {
            this._startRangeAnimation();
        }
    }

    /**
     * Start pulse animation for range indicator.
     * Uses subtle scaling animation like bg3-inspired-hotbar.
     * @private
     */
    _startRangeAnimation() {
        if (!this._rangeIndicator) {
            return;
        }

        const minScale = 0.97;
        const maxScale = 1.02;
        let currentScale = 1.0;
        let direction = 1;

        const animate = () => {
            if (!this._rangeIndicator?.parent) {
                return; // Stop if removed from canvas
            }

            currentScale += direction * 0.0005;

            if (currentScale <= minScale) {
                direction = 1;
            } else if (currentScale >= maxScale) {
                direction = -1;
            }

            this._rangeIndicator.scale.set(currentScale);
            this._animationFrame = requestAnimationFrame(animate);
        };

        animate();
    }

    /**
     * Remove range indicator from canvas.
     * Public method to allow external usage.
     */
    removeRangeIndicator() {
        if (this._rangeIndicator) {
            if (this._rangeIndicator.parent) {
                this._rangeIndicator.parent.removeChild(this._rangeIndicator);
            }
            this._rangeIndicator.destroy();
            this._rangeIndicator = null;
        }
    }

    /**
     * Set targeting cursor.
     * @private
     */
    _setTargetingCursor() {
        this._originalCursor = document.body.style.cursor;
        document.body.style.cursor = 'crosshair';
    }

    /**
     * Restore original cursor.
     * @private
     */
    _restoreOriginalCursor() {
        if (this._originalCursor !== null) {
            document.body.style.cursor = this._originalCursor;
            this._originalCursor = null;
        } else {
            document.body.style.cursor = '';
        }
    }

    /**
     * Get display string for confirm keybind.
     * @returns {string} Keybind display
     * @private
     */
    _getConfirmKeybindDisplay() {
        // Could check game.keybindings for a custom binding
        return 'Enter';
    }

    /**
     * Get display string for adjust keybinds.
     * @returns {string} Keybind display
     * @private
     */
    _getAdjustKeybindDisplay() {
        return game.i18n.format('bg3-hud-core.TargetSelector.AdjustTargets', { plus: '+', minus: '-' });
    }

    /**
     * Clean up resources.
     */
    destroy() {
        this.deactivate();
    }
}

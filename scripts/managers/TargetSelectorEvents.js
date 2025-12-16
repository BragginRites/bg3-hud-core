/**
 * Target Selector Event Handler
 * Manages all event handling for the target selector.
 * Handles canvas clicks, keyboard input, mouse movement, and Foundry targeting hooks.
 */
export class TargetSelectorEvents {
    /**
     * @param {TargetSelectorManager} manager - The parent manager instance
     */
    constructor(manager) {
        this.manager = manager;

        // Bind event handlers to preserve context
        this._onPointerDown = this._onPointerDown.bind(this);
        this._onClick = this._onClick.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onTargetToken = this._onTargetToken.bind(this);

        // Track registered state
        this._registered = false;
        this._hookId = null;
    }

    /**
     * Register all event listeners.
     * Should be called when target selector activates.
     */
    registerEvents() {
        if (this._registered) {
            return;
        }

        // Window events - Use Capture Phase (true) to intercept before PIXI/Foundry
        window.addEventListener('pointerdown', this._onPointerDown, true);
        window.addEventListener('click', this._onClick, true);
        window.addEventListener('dblclick', this._onClick, true);

        // Document events
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('mousemove', this._onMouseMove);

        // Foundry targeting hook - syncs with native targeting
        this._hookId = Hooks.on('targetToken', this._onTargetToken);

        this._registered = true;
    }

    /**
     * Unregister all event listeners.
     * Should be called when target selector deactivates.
     */
    unregisterEvents() {
        if (!this._registered) {
            return;
        }

        // Window events - remove capture listeners
        window.removeEventListener('pointerdown', this._onPointerDown, true);
        window.removeEventListener('click', this._onClick, true);
        window.removeEventListener('dblclick', this._onClick, true);

        // Document events
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('mousemove', this._onMouseMove);

        // Foundry hook
        if (this._hookId !== null) {
            Hooks.off('targetToken', this._hookId);
            this._hookId = null;
        }

        this._registered = false;
    }

    /**
     * Handle keyboard events.
     * @param {KeyboardEvent} event - The keyboard event
     * @private
     */
    _onKeyDown(event) {
        if (!this.manager.isActive) {
            return;
        }

        switch (event.key) {
            case 'Escape':
                event.preventDefault();
                event.stopPropagation();
                this.manager.cancel();
                break;

            case 'Enter':
                event.preventDefault();
                event.stopPropagation();
                this.manager.confirmSelection();
                break;

            case '+':
            case '=':
                // Increase max targets
                event.preventDefault();
                this.manager.adjustMaxTargets(1);
                break;

            case '-':
            case '_':
                // Decrease max targets
                event.preventDefault();
                this.manager.adjustMaxTargets(-1);
                break;
        }
    }

    /**
     * Handle pointer down events (capture phase).
     * Intercepts clicks on tokens to prevent selection/control while allowing panning (right click).
     * @param {PointerEvent} event - The pointer event
     * @private
     */
    _onPointerDown(event) {
        if (!this.manager.isActive) {
            return;
        }

        // Allow right clicks (panning) and other buttons (middle click)
        if (event.button !== 0) {
            return;
        }

        // Allow interacting with the target selector UI itself
        if (event.target.closest('#bg3-target-list')) {
            return;
        }

        // Check if we hit a token
        // Using worldTransform to account for pan and zoom
        const t = canvas.stage.worldTransform;
        const worldX = (event.clientX - t.tx) / t.a;
        const worldY = (event.clientY - t.ty) / t.d;

        const token = this._getTokenAtPosition({ x: worldX, y: worldY });

        if (token) {
            // We hit a valid token!
            // Stop the event from reaching Foundry (prevent selection)
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            // Toggle target
            const validation = this.manager.validateTarget(token);
            if (validation.valid) {
                this.manager.toggleTarget(token);
            } else {
                ui.notifications.warn(validation.reason || game.i18n.localize('bg3-hud-core.TargetSelector.InvalidTarget'));
            }
        }
        // If no token, allow event to propagate (allows selecting nothing, dragging map, etc.)
    }

    /**
     * Handle click events (capture phase).
     * Clean up any clicks that might slip through if pointerdown wasn't enough.
     * @param {MouseEvent} event - The click event
     * @private
     */
    _onClick(event) {
        if (!this.manager.isActive) {
            return;
        }

        // Allow right clicks
        if (event.button !== 0) return;

        // Allow UI interaction
        if (event.target.closest('#bg3-target-list')) return;

        // Geometric check again
        const t = canvas.stage.worldTransform;
        const worldX = (event.clientX - t.tx) / t.a;
        const worldY = (event.clientY - t.ty) / t.d;

        if (this._getTokenAtPosition({ x: worldX, y: worldY })) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        }
    }

    /**
     * Get token at a canvas position (geometric check).
     * @param {{x: number, y: number}} position - Canvas world coordinates
     * @returns {Token|null} The token at the position
     * @private
     */
    _getTokenAtPosition(position) {
        if (!canvas?.tokens?.quadtree) {
            return this._getTokenAtPositionLegacy(position);
        }

        // Create a small rect for the point query
        const r = new PIXI.Rectangle(position.x, position.y, 1, 1);

        // Get candidates from Quadtree
        const candidates = canvas.tokens.quadtree.getObjects(r);

        if (!candidates.size) return null;

        // Sort by Z-index (highest first)
        const tokens = Array.from(candidates).sort((a, b) => b.zIndex - a.zIndex);

        return tokens.find(token => {
            if (!token.visible) return false;

            // Allow targeting hidden tokens if user is GM, otherwise skip
            if (token.document.hidden && !game.user.isGM) return false;

            // Account for hit area if available (better precision)
            if (token.hitArea) {
                // hitArea is relative to token position
                const localX = position.x - token.x;
                const localY = position.y - token.y;
                return token.hitArea.contains(localX, localY);
            }

            // Fallback to strict bounds check
            const bounds = {
                x: token.x,
                y: token.y,
                width: token.w,
                height: token.h
            };

            return position.x >= bounds.x &&
                position.x <= bounds.x + bounds.width &&
                position.y >= bounds.y &&
                position.y <= bounds.y + bounds.height;
        }) || null;
    }

    /**
     * Legacy linear scan fallback.
     * @param {{x: number, y: number}} position 
     * @returns {Token|null}
     * @private
     */
    _getTokenAtPositionLegacy(position) {
        if (!canvas?.tokens?.placeables) return null;

        const tokens = [...canvas.tokens.placeables].sort((a, b) => b.zIndex - a.zIndex);

        return tokens.find(token => {
            if (!token.visible) return false;
            if (token.document.hidden && !game.user.isGM) return false;

            if (token.hitArea) {
                const localX = position.x - token.x;
                const localY = position.y - token.y;
                return token.hitArea.contains(localX, localY);
            }

            const bounds = { x: token.x, y: token.y, width: token.w, height: token.h };
            return position.x >= bounds.x &&
                position.x <= bounds.x + bounds.width &&
                position.y >= bounds.y &&
                position.y <= bounds.y + bounds.height;
        }) || null;
    }

    /**
     * Handle mouse move events for UI updates.
     * @param {MouseEvent} event - The mouse event
     * @private
     */
    _onMouseMove(event) {
        if (!this.manager.isActive || !this.manager.ui) {
            return;
        }

        // Throttle updates using requestAnimationFrame
        if (this._mouseMoveFrame) {
            cancelAnimationFrame(this._mouseMoveFrame);
        }

        this._mouseMoveFrame = requestAnimationFrame(() => {
            this.manager.ui.updateMousePosition(event.clientX, event.clientY);
        });
    }

    /**
     * Handle Foundry's targetToken hook for sync with native targeting.
     * @param {User} user - The user who targeted
     * @param {Token} token - The token that was targeted
     * @param {boolean} targeted - Whether the token was targeted or untargeted
     * @private
     */
    _onTargetToken(user, token, targeted) {
        if (!this.manager.isActive) {
            return;
        }

        // Only handle current user's targeting
        if (user !== game.user) {
            return;
        }

        // Sync our internal state with Foundry's targeting
        // This handles cases where targeting happens outside our selector
        this.manager.syncWithFoundryTargets();
    }

    /**
     * Clean up resources.
     */
    destroy() {
        this.unregisterEvents();

        if (this._mouseMoveFrame) {
            cancelAnimationFrame(this._mouseMoveFrame);
            this._mouseMoveFrame = null;
        }
    }
}

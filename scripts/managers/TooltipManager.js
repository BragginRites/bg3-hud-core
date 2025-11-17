/**
 * BG3 HUD Tooltip Manager
 * System-agnostic tooltip rendering and management
 * 
 * Handles:
 * - Simple tooltips (data-tooltip attributes)
 * - Rich tooltips (items, spells, etc.) via registered renderers
 * - Tooltip positioning and viewport bounds
 * - Pin/unpin functionality
 * - Tooltip lifecycle (show/hide/dismiss)
 */

export class TooltipManager {
    /**
     * Create a new TooltipManager
     * @param {Object} options - Configuration options
     * @param {number} options.delay - Hover delay in milliseconds (default: 500)
     */
    constructor(options = {}) {
        this.delay = options.delay || 500;
        this.tooltipElement = null;
        this.lockedTooltips = new Set();
        this.pinnedTooltipsByUuid = new Map(); // uuid -> tooltip element
        this.hoverTimeout = null;
        this.pendingTarget = null; // Element waiting for tooltip delay
        this.currentTarget = null;
        this.currentUuid = null;
        this.renderers = new Map(); // systemId -> renderer function
        this._zCounter = 10000; // base z-index for tooltips
        
        // Bind methods
        this._handleMouseEnter = this._handleMouseEnter.bind(this);
        this._handleMouseLeave = this._handleMouseLeave.bind(this);
        this._handleMouseMove = this._handleMouseMove.bind(this);
        this._handleContextMenu = this._handleContextMenu.bind(this);
        this._handleMouseDown = this._handleMouseDown.bind(this);
        this._handleMiddleClick = this._handleMiddleClick.bind(this);
        
        this._init();
    }

    /**
     * Initialize the tooltip system
     * @private
     */
    _init() {
        // Create tooltip container
        // Use our own ID to avoid interfering with system tooltips
        // System adapters can override this ID if needed (e.g., dnd5e adapter changes to #tooltip)
        this.tooltipElement = document.createElement('div');
        this.tooltipElement.id = 'bg3-tooltip';
        this.tooltipElement.classList.add('bg3-tooltip');
        document.body.appendChild(this.tooltipElement);

        // Listen for data-tooltip attributes
        this._observeTooltipAttributes();
        
        // Prevent system tooltips (dnd5e2, etc.) from showing on UI elements
        // This must run BEFORE system tooltip handlers, so use capture phase with high priority
        this._preventSystemTooltips = this._preventSystemTooltips.bind(this);
        document.addEventListener('mouseenter', this._preventSystemTooltips, true);
        document.addEventListener('mouseleave', this._preventSystemTooltips, true);
        
        // Handle mouse events globally using event delegation
        // Use mouseover/mouseout instead of mouseenter/mouseleave because they bubble
        // This allows us to detect movement between cells within the same container
        document.addEventListener('mouseover', this._handleMouseEnter, true);
        document.addEventListener('mouseout', this._handleMouseLeave, true);
        document.addEventListener('mousemove', this._handleMouseMove);
        document.addEventListener('contextmenu', this._handleContextMenu);
        document.addEventListener('mousedown', this._handleMouseDown);
        document.addEventListener('auxclick', this._handleMiddleClick, true); // Middle click - use capture phase
        
        // Bring-to-front on click for pinned tooltips
        document.addEventListener('click', (e) => {
            const tt = e.target?.closest?.('.locked-tooltip.bg3-tooltip');
            if (tt && this.lockedTooltips.has(tt)) {
                this._bringToFront(tt);
            }
        }, true);
        
        // Also listen for mouseleave on window to catch when mouse leaves window entirely
        window.addEventListener('mouseleave', (event) => {
            if (!this.lockedTooltips.has(this.tooltipElement)) {
                this.hideTooltip();
            }
        });
        
        // Listen for blur events (e.g., when window loses focus) to hide tooltips
        this._handleBlur = () => {
            if (!this.lockedTooltips.has(this.tooltipElement)) {
                this.hideTooltip();
            }
        };
        window.addEventListener('blur', this._handleBlur);
    }

    /**
     * Register a tooltip renderer for a system
     * @param {string} systemId - System ID (e.g., 'dnd5e', 'pf2e')
     * @param {Function} renderer - Renderer function that returns tooltip content
     * @param {Object} renderer.data - Data object (item, spell, etc.)
     * @param {Object} renderer.options - Rendering options
     * @returns {Promise<Object>} Object with { content: string|HTMLElement, classes?: string[] }
     */
    registerRenderer(systemId, renderer) {
        if (typeof renderer !== 'function') {
            console.error('BG3 HUD Core | Tooltip renderer must be a function');
            return;
        }
        this.renderers.set(systemId, renderer);
        console.log(`BG3 HUD Core | Registered tooltip renderer for system: ${systemId}`);
    }

    /**
     * Show a simple tooltip
     * @param {HTMLElement} target - Target element
     * @param {string} content - Tooltip content (HTML string)
     * @param {string} direction - Tooltip direction (UP, DOWN, LEFT, RIGHT)
     * @param {string[]} classes - Additional CSS classes
     * @param {string} uuid - Optional UUID to track pinned tooltips
     */
    showSimpleTooltip(target, content, direction = 'UP', classes = [], uuid = null) {
        if (!target || !content) return;

        // Check if this UUID already has a pinned tooltip
        if (uuid && this.pinnedTooltipsByUuid.has(uuid)) {
            return; // Don't show duplicate tooltip
        }

        this.currentTarget = target;
        this.currentUuid = uuid;
        this.tooltipElement.innerHTML = content;
        this.tooltipElement.className = 'bg3-tooltip simple-tooltip';
        classes.forEach(cls => this.tooltipElement.classList.add(cls));
        
        // Store UUID on tooltip element for tracking
        if (uuid) {
            this.tooltipElement.dataset.uuid = uuid;
        }
        
        // Position tooltip relative to target element (not mouse)
        // Setup for accurate measurement: remove any offsets that could skew measurement
        this.tooltipElement.style.display = 'block';
        this.tooltipElement.style.visibility = 'hidden'; // Hidden until positioned
        this.tooltipElement.style.position = 'fixed';
        this.tooltipElement.style.transform = 'none';
        this.tooltipElement.style.margin = '0';
        
        // Force layout/reflow to ensure tooltip dimensions are available
        this.tooltipElement.getBoundingClientRect();
        
        // Position and show tooltip
        this._positionTooltip(target, direction);
        this.tooltipElement.style.visibility = 'visible';
        this.tooltipElement.classList.add('visible');
    }

    /**
     * Show a rich tooltip (from registered renderer)
     * @param {HTMLElement} target - Target element
     * @param {Object} data - Data object (item, spell, etc.)
     * @param {string} systemId - System ID to use for rendering
     * @param {Object} options - Rendering options
     * @param {string} uuid - Optional UUID to track pinned tooltips
     */
    async showRichTooltip(target, data, systemId, options = {}, uuid = null) {
        if (!target || !data) return;

        // Check if this UUID already has a pinned tooltip
        if (uuid && this.pinnedTooltipsByUuid.has(uuid)) {
            return; // Don't show duplicate tooltip
        }

        const renderer = this.renderers.get(systemId);
        if (!renderer) {
            console.warn(`BG3 HUD Core | No tooltip renderer registered for system: ${systemId}`);
            return;
        }

        try {
            const result = await renderer(data, options);
            if (!result) {
                console.warn('BG3 HUD Core | Tooltip renderer returned null/undefined');
                return;
            }

            this.currentTarget = target;
            this.currentUuid = uuid;
            this.tooltipElement.innerHTML = '';
            
            // Handle content (string or HTMLElement)
            if (typeof result.content === 'string') {
                this.tooltipElement.innerHTML = result.content;
            } else if (result.content instanceof HTMLElement) {
                this.tooltipElement.appendChild(result.content);
            } else {
                console.error('BG3 HUD Core | Tooltip renderer must return content as string or HTMLElement, got:', typeof result.content);
                return;
            }

            // Apply classes - start with base classes
            this.tooltipElement.className = 'bg3-tooltip rich-tooltip';
            if (result.classes && Array.isArray(result.classes)) {
                result.classes.forEach(cls => this.tooltipElement.classList.add(cls));
            }
            
            // Ensure tooltip has proper display (but keep hidden until positioned)
            // Setup for accurate measurement: remove any offsets that could skew measurement
            this.tooltipElement.style.display = 'block';
            this.tooltipElement.style.visibility = 'hidden'; // Hidden until positioned
            this.tooltipElement.style.position = 'fixed';
            this.tooltipElement.style.transform = 'none';
            this.tooltipElement.style.margin = '0';
            this.tooltipElement.style.opacity = '1';
            this.tooltipElement.style.zIndex = '10000';

            // Store UUID on tooltip element for tracking
            if (uuid) {
                this.tooltipElement.dataset.uuid = uuid;
            }

            const direction = result.direction || 'UP';
            
            // Position tooltip relative to target element (not mouse)
            // Force layout/reflow to ensure tooltip dimensions are available
            this.tooltipElement.getBoundingClientRect();
            
            // Position and show tooltip
            this._positionTooltip(target, direction);
            this.tooltipElement.style.visibility = 'visible';
            this.tooltipElement.classList.add('visible');
        } catch (error) {
            console.error('BG3 HUD Core | Error rendering tooltip:', error);
            console.error('BG3 HUD Core | Error stack:', error.stack);
        }
    }

    /**
     * Hide the tooltip
     * @param {boolean} force - Force hide even if locked
     */
    hideTooltip(force = false) {
        if (!force && this.lockedTooltips.has(this.tooltipElement)) {
            return; // Don't hide locked tooltips
        }

        // Clear any pending hover timeout
        if (this.hoverTimeout) {
            clearTimeout(this.hoverTimeout);
            this.hoverTimeout = null;
        }

        // Clear pending target
        this.pendingTarget = null;

        // Hide the tooltip element
        this.tooltipElement.classList.remove('visible');
        this.tooltipElement.style.display = 'none';
        this.tooltipElement.style.visibility = 'hidden';
        this.tooltipElement.style.opacity = '0';
        
        // Clear current target and UUID
        this.currentTarget = null;
        this.currentUuid = null;
        
        // Clear tooltip content to ensure no stale content remains
        // Only clear if not locked (locked tooltips keep their content)
        if (!this.lockedTooltips.has(this.tooltipElement)) {
            this.tooltipElement.innerHTML = '';
        }
    }

    /**
     * Pin/lock the current tooltip
     * @param {HTMLElement} tooltip - Tooltip element to pin (defaults to current tooltip)
     */
    pinTooltip(tooltip = null) {
        const tooltipToPin = tooltip || this.tooltipElement;
        if (!tooltipToPin || !tooltipToPin.classList.contains('visible')) return;
        
        // If pinning the main tooltipElement, clone it so the main one can be reused
        // This allows showing tooltips for different items even when one is locked
        let pinnedTooltip = tooltipToPin;
        if (tooltipToPin === this.tooltipElement) {
            // Clone the tooltip element
            pinnedTooltip = tooltipToPin.cloneNode(true);
            pinnedTooltip.id = `bg3-tooltip-pinned-${Date.now()}`;
            document.body.appendChild(pinnedTooltip);
            
            // Copy all computed styles to ensure visual consistency
            const computedStyle = window.getComputedStyle(tooltipToPin);
            const styleProps = ['position', 'left', 'top', 'width', 'height', 'zIndex', 'opacity', 'transform'];
            styleProps.forEach(prop => {
                const value = computedStyle.getPropertyValue(prop) || tooltipToPin.style[prop];
                if (value) {
                    pinnedTooltip.style[prop] = value;
                }
            });
            
            // Hide the main tooltipElement so it can be reused
            this.hideTooltip(true);
        }
        
        pinnedTooltip.classList.add('locked-tooltip');
        this.lockedTooltips.add(pinnedTooltip);
        
        // Track by UUID if available
        const uuid = pinnedTooltip.dataset.uuid;
        if (uuid) {
            this.pinnedTooltipsByUuid.set(uuid, pinnedTooltip);
        }
        
        // Raise z-index when pinning
        this._bringToFront(pinnedTooltip);
        
        this._makeTooltipDraggable(pinnedTooltip);
    }

    /**
     * Unpin/dismiss a locked tooltip
     * @param {HTMLElement} tooltip - Tooltip element to dismiss
     */
    dismissLockedTooltip(tooltip) {
        if (!this.lockedTooltips.has(tooltip)) return;
        
        // Remove draggable handlers first to prevent any drag operations
        if (tooltip._bg3DragHandlers) {
            tooltip.removeEventListener('mousedown', tooltip._bg3DragHandlers.mouseDown, true);
            tooltip._bg3DragHandlers = null;
        }
        
        // Remove from locked set before clearing styles
        this.lockedTooltips.delete(tooltip);
        
        // Remove from UUID tracking
        const uuid = tooltip.dataset.uuid;
        if (uuid) {
            this.pinnedTooltipsByUuid.delete(uuid);
        }
        
        // Hide the tooltip completely
        tooltip.classList.remove('locked-tooltip', 'visible');
        tooltip.style.display = 'none';
        tooltip.style.visibility = 'hidden';
        tooltip.style.opacity = '0';
        
        // Clear position and interaction styles
        tooltip.style.cursor = '';
        tooltip.style.pointerEvents = '';
        tooltip.style.position = '';
        tooltip.style.left = '';
        tooltip.style.top = '';
        tooltip.style.bottom = '';
        
        // Clear content if this is the main tooltip element
        if (tooltip === this.tooltipElement) {
            tooltip.innerHTML = '';
            tooltip.className = 'bg3-tooltip';
            this.currentTarget = null;
            this.currentUuid = null;
        } else {
            // If it's a cloned pinned tooltip, remove it from the DOM
            if (tooltip.parentNode) {
                tooltip.parentNode.removeChild(tooltip);
            }
        }
    }

    /**
     * Raise a tooltip above others
     * @private
     * @param {HTMLElement} tooltipEl - Tooltip element to bring to front
     */
    _bringToFront(tooltipEl) {
        if (!tooltipEl) return;
        this._zCounter += 1;
        tooltipEl.style.zIndex = String(this._zCounter);
    }

    /**
     * Position tooltip relative to target element's bounding box
     * Always anchors to the source element, never to mouse position
     * Enforces strict 20px gap with no size-dependent drift
     * @private
     * @param {HTMLElement} target - Target element (source of tooltip)
     * @param {string} direction - Preferred direction (UP, DOWN, LEFT, RIGHT)
     */
    _positionTooltip(target, direction = 'UP') {
        if (!target || !this.tooltipElement) return;

        const el = target.getBoundingClientRect();
        // Ensure the tooltip has final layout metrics (transform none for measurement)
        const tt = this.tooltipElement;
        const prevTransform = tt.style.transform;
        tt.style.transform = 'none';
        const ttr = tt.getBoundingClientRect();
        const gap = 10;

        // Center to center horizontally
        let left = Math.round(el.left + el.width / 2 - ttr.width / 2);

        // Default: strict 20px gap above
        let top = Math.round(el.top - ttr.height - gap);

        // Flip below if not enough space above
        if (top < 8) top = Math.round(el.bottom + gap);

        // Clamp horizontally to viewport
        left = Math.max(8, Math.min(left, window.innerWidth - ttr.width - 8));

        // Apply final position
        tt.style.position = 'fixed';
        tt.style.left = `${left}px`;
        tt.style.top = `${top}px`;
        // restore prior transform if any
        tt.style.transform = prevTransform;
    }


    /**
     * Prevent system tooltips (dnd5e2, etc.) from showing on BG3 HUD UI elements only
     * Only blocks tooltips within .bg3-hud or #bg3-hotbar-container scope
     * System tooltips work normally everywhere else (character sheets, inventory, etc.)
     * @private
     * @param {MouseEvent} event - Mouse event
     */
    _preventSystemTooltips(event) {
        if (!event.target || typeof event.target.closest !== 'function') return;
        
        // Only prevent system tooltips within BG3 HUD scope
        // Let system tooltips work normally everywhere else
        const isWithinBG3HUD = event.target.closest('.bg3-hud, #bg3-hotbar-container') !== null;
        if (!isWithinBG3HUD) {
            return; // Allow system tooltips outside BG3 HUD
        }
        
        // Within BG3 HUD scope: check if this is a UI element (button, control, etc.)
        const target = event.target.closest('[data-bg3-ui]');
        if (!target) {
            // Also check for elements with data-tooltipClass containing dnd5e classes but no data-uuid
            // These are UI elements incorrectly trying to use dnd5e tooltips
            let elementWithTooltipClass = event.target;
            while (elementWithTooltipClass && elementWithTooltipClass !== document.body) {
                if (elementWithTooltipClass.dataset?.tooltipClass) {
                    const tooltipClass = elementWithTooltipClass.dataset.tooltipClass || '';
                    const hasDnd5eClasses = tooltipClass.includes('dnd5e2') || tooltipClass.includes('dnd5e-tooltip');
                    const hasUuid = elementWithTooltipClass.hasAttribute('data-uuid') || 
                                 elementWithTooltipClass.closest('[data-uuid]') !== null;
                    
                    // If it has dnd5e classes but no uuid, it's a UI element - prevent system tooltips
                    if (hasDnd5eClasses && !hasUuid) {
                        event.stopPropagation();
                        event.stopImmediatePropagation();
                        return;
                    }
                }
                elementWithTooltipClass = elementWithTooltipClass.parentElement;
            }
            return;
        }
        
        // Check if this UI element is part of a game item (has data-uuid)
        // Game items should still show tooltips (custom BG3 HUD ones)
        const isGameItem = target.hasAttribute('data-uuid') || 
                          target.closest('[data-uuid]') !== null;
        
        // Also check if element has data-tooltipClass with dnd5e classes but no data-uuid
        const tooltipClass = target.dataset.tooltipClass || '';
        const hasDnd5eClasses = tooltipClass.includes('dnd5e2') || tooltipClass.includes('dnd5e-tooltip');
        const hasIncorrectDnd5eTooltip = hasDnd5eClasses && !isGameItem;
        
        // Only prevent system tooltips on pure UI elements within BG3 HUD scope
        if (!isGameItem || hasIncorrectDnd5eTooltip) {
            event.stopPropagation();
            event.stopImmediatePropagation();
        }
    }

    /**
     * Handle mouse over on elements with data-tooltip or data-uuid
     * Using mouseover instead of mouseenter because it bubbles, allowing detection of movement between cells
     * @private
     */
    _handleMouseEnter(event) {
        // Check if event.target is an Element (not Text, Document, Window, etc.)
        if (!event.target || typeof event.target.closest !== 'function') return;
        
        // Only handle tooltips within BG3 HUD scope to avoid processing every element in Foundry
        const isWithinBG3HUD = event.target.closest('.bg3-hud, #bg3-hotbar-container') !== null;
        if (!isWithinBG3HUD) {
            return; // Let system tooltips handle everything outside BG3 HUD
        }
        
        // Check for elements with data-tooltip attribute
        let target = event.target.closest('[data-tooltip]');
        
        // Also check for elements with data-uuid (for rich tooltips)
        if (!target) {
            target = event.target.closest('[data-uuid]');
        }
        
        if (!target) {
            return;
        }
        
        // Check if we're already showing/pending a tooltip for this exact target
        // If so, don't restart the process
        if (this.currentTarget === target || this.pendingTarget === target) {
            return;
        }

        // Get UUID if available
        const uuid = target.dataset.uuid;
        
        // Check if this UUID already has a pinned tooltip - don't show another
        // This ensures only 1 instance per item (UUID)
        if (uuid && this.pinnedTooltipsByUuid.has(uuid)) {
            return;
        }

        // Only prevent showing tooltip if the main tooltipElement is locked AND showing the same UUID
        // Allow showing tooltips for different items even if other tooltips are locked
        if (this.lockedTooltips.has(this.tooltipElement)) {
            const lockedUuid = this.tooltipElement.dataset.uuid;
            // If the locked tooltip is for the same UUID, don't show another
            if (uuid && lockedUuid === uuid) {
                return;
            }
            // If no UUID but same target, don't show
            if (!uuid && this.currentTarget === target) {
                return;
            }
        }

        // Handle rich tooltip (has UUID and system renderer available)
        if (uuid && game.system?.id) {
            const systemId = game.system.id;
            const renderer = this.renderers.get(systemId);
            
            if (renderer) {
                // Clear any existing pending timeout
                if (this.hoverTimeout) {
                    clearTimeout(this.hoverTimeout);
                    this.hoverTimeout = null;
                }
                
                // Set pending target
                this.pendingTarget = target;
                
                // Rich tooltip - load item and render
                this.hoverTimeout = setTimeout(async () => {
                    // Only show if we're still on the same target
                    if (this.pendingTarget === target) {
                        try {
                            const item = await fromUuid(uuid);
                            if (item) {
                                await this.showRichTooltip(target, item, systemId, {}, uuid);
                            }
                        } catch (error) {
                            console.error('BG3 HUD Core | Error loading item for tooltip:', error);
                        }
                    }
                    // Clear pending target after timeout
                    if (this.pendingTarget === target) {
                        this.pendingTarget = null;
                    }
                }, this.delay);
                return;
            }
        }

        // Handle simple tooltip (data-tooltip attribute)
        const content = target.dataset.tooltip;
        if (content) {
            // Clear any existing pending timeout
            if (this.hoverTimeout) {
                clearTimeout(this.hoverTimeout);
                this.hoverTimeout = null;
            }
            
            // Set pending target
            this.pendingTarget = target;
            
            const direction = target.dataset.tooltipDirection || 'UP';
            let tooltipClass = target.dataset.tooltipClass || '';
            
            // Only allow dnd5e classes (dnd5e2, dnd5e-tooltip) if element has data-uuid
            // UI elements (filters, buttons, controls) should not use dnd5e tooltip classes
            if (tooltipClass && !uuid) {
                const classes = tooltipClass.split(' ').filter(Boolean);
                // Filter out dnd5e classes for non-game items
                const filteredClasses = classes.filter(cls => 
                    cls !== 'dnd5e2' && cls !== 'dnd5e-tooltip' && cls !== 'item-tooltip'
                );
                tooltipClass = filteredClasses.join(' ');
            }
            
            this.hoverTimeout = setTimeout(() => {
                // Only show if we're still on the same target
                if (this.pendingTarget === target) {
                    this.showSimpleTooltip(target, content, direction, tooltipClass.split(' ').filter(Boolean), uuid);
                }
                // Clear pending target after timeout
                if (this.pendingTarget === target) {
                    this.pendingTarget = null;
                }
            }, this.delay);
        }
    }

    /**
     * Handle mouse out
     * Using mouseout instead of mouseleave because it bubbles, allowing detection of movement between cells
     * @private
     */
    _handleMouseLeave(event) {
        // Check if event.target is an Element (not Text, Document, Window, etc.)
        if (!event.target || typeof event.target.closest !== 'function') {
            // Mouse left the window entirely - hide tooltip if not locked
            if (!this.lockedTooltips.has(this.tooltipElement)) {
                this.hideTooltip();
            }
            return;
        }
        
        // Only handle tooltips within BG3 HUD scope
        const isWithinBG3HUD = event.target.closest('.bg3-hud, #bg3-hotbar-container') !== null;
        if (!isWithinBG3HUD) {
            return; // Let system tooltips handle everything outside BG3 HUD
        }
        
        // Check if mouse is entering the tooltip itself - don't hide
        if (this.tooltipElement.contains(event.target)) {
            return;
        }
        
        // Check if we're moving to another tooltip target (relatedTarget)
        // If so, let the mouseover handler deal with it
        if (event.relatedTarget && typeof event.relatedTarget.closest === 'function') {
            const nextTarget = event.relatedTarget.closest('[data-tooltip], [data-uuid]');
            if (nextTarget) {
                return; // Moving to another tooltip target, let mouseover handle it
            }
        }
        
        // Check for elements with data-tooltip or data-uuid
        const target = event.target.closest('[data-tooltip], [data-uuid]');
        
        if (!target) {
            // Mouse left BG3 HUD element but we're not over another tooltip target
            // Cancel any pending timeout
            if (this.hoverTimeout) {
                clearTimeout(this.hoverTimeout);
                this.hoverTimeout = null;
                this.pendingTarget = null;
            }
            // Hide tooltip if not locked
            if (!this.lockedTooltips.has(this.tooltipElement)) {
                this.hideTooltip();
            }
            return;
        }

        // Don't hide if tooltip is locked
        if (this.lockedTooltips.has(this.tooltipElement)) return;

        // Clear any pending hover timeout if we're leaving the pending target
        if (this.hoverTimeout && this.pendingTarget === target) {
            clearTimeout(this.hoverTimeout);
            this.hoverTimeout = null;
            this.pendingTarget = null;
        }

        // Hide if we're leaving the current target element
        if (this.currentTarget === target) {
            this.hideTooltip();
        }
    }

    /**
     * Handle mouse move for tooltip tracking
     * Only reposition if target element has moved (not on every mouse move)
     * @private
     */
    _handleMouseMove(event) {
        if (!this.tooltipElement.classList.contains('visible')) return;
        if (this.lockedTooltips.has(this.tooltipElement)) return;
        
        // Don't reposition on mouse move - tooltip is anchored to source element
        // Only reposition if the target element itself moves (e.g., during animations)
        // This prevents jitter and ensures tooltip stays anchored to the source element
    }

    /**
     * Handle context menu (right-click) for dismissing pinned tooltips
     * @private
     */
    _handleContextMenu(event) {
        // Check if clicking on a pinned tooltip
        const pinnedTooltip = event.target.closest('.locked-tooltip.bg3-tooltip');
        if (pinnedTooltip && this.lockedTooltips.has(pinnedTooltip)) {
            event.preventDefault();
            this.dismissLockedTooltip(pinnedTooltip);
        }
    }

    /**
     * Handle middle-click (auxclick) for pinning/unpinning tooltips
     * @private
     */
    _handleMiddleClick(event) {
        if (event.button !== 1) return; // Only middle mouse button
        
        // Check if clicking on a pinned tooltip - dismiss it
        // Use capture phase check to catch it before drag handler
        const pinnedTooltip = event.target.closest('.locked-tooltip.bg3-tooltip');
        if (pinnedTooltip && this.lockedTooltips.has(pinnedTooltip)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation(); // Prevent any other handlers
            this.dismissLockedTooltip(pinnedTooltip);
            return;
        }

        // Check if clicking on an element that should show a tooltip
        if (!event.target || typeof event.target.closest !== 'function') return;
        
        const target = event.target.closest('[data-tooltip], [data-uuid]');
        if (!target) return;

        // If tooltip is visible, pin it
        if (this.tooltipElement.classList.contains('visible') && 
            !this.lockedTooltips.has(this.tooltipElement)) {
            event.preventDefault();
            event.stopPropagation();
            this.pinTooltip();
        }
    }

    /**
     * Handle mouse down for dragging pinned tooltips
     * @private
     */
    _handleMouseDown(event) {
        // Only handle dragging for pinned tooltips
        const pinnedTooltip = event.target.closest('.locked-tooltip.bg3-tooltip');
        if (!pinnedTooltip || !this.lockedTooltips.has(pinnedTooltip)) return;
        
        // Don't interfere with the draggable handler - let it handle the drag
        // This handler is mainly here to prevent other handlers from interfering
        // The actual dragging is handled by _makeTooltipDraggable's event listener
    }

    /**
     * Make tooltip draggable when locked
     * @private
     * @param {HTMLElement} tooltip - Tooltip element to make draggable
     */
    _makeTooltipDraggable(tooltip) {
        // Remove any existing draggable handlers first
        if (tooltip._bg3DragHandlers) {
            tooltip.removeEventListener('mousedown', tooltip._bg3DragHandlers.mouseDown);
            tooltip._bg3DragHandlers = null;
        }

        let isDragging = false;
        let startX, startY, startLeft, startTop;

        const handleMouseDown = (e) => {
            // Don't start drag on middle-click (that's for dismissing)
            if (e.button === 1) return;
            
            if (!this.lockedTooltips.has(tooltip)) return;
            
            // Focus / raise before drag
            this._bringToFront(tooltip);
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = tooltip.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            const handleMouseMove = (e) => {
                if (!isDragging) return;
                
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                
                tooltip.style.left = `${startLeft + deltaX}px`;
                tooltip.style.top = `${startTop + deltaY}px`;
                tooltip.style.bottom = 'auto';
            };

            const handleMouseUp = () => {
                isDragging = false;
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            e.preventDefault();
            e.stopPropagation();
        };

        // Store handler reference for cleanup
        tooltip._bg3DragHandlers = { mouseDown: handleMouseDown };
        tooltip.addEventListener('mousedown', handleMouseDown, true); // Use capture phase
        tooltip.style.cursor = 'move';
        tooltip.style.pointerEvents = 'auto';
    }

    /**
     * Observe DOM for data-tooltip attributes (for dynamically added elements)
     * Note: Event delegation via mouseenter/mouseleave handles all tooltips automatically,
     * so this observer is not needed. Kept as placeholder for potential future enhancements.
     * @private
     */
    _observeTooltipAttributes() {
        // Tooltips are handled automatically via event delegation on document
        // No MutationObserver needed - event delegation works for dynamically added elements
    }

    /**
     * Destroy the tooltip manager and clean up
     */
    destroy() {
        // Remove event listeners
        document.removeEventListener('mouseenter', this._preventSystemTooltips, true);
        document.removeEventListener('mouseleave', this._preventSystemTooltips, true);
        document.removeEventListener('mouseover', this._handleMouseEnter, true);
        document.removeEventListener('mouseout', this._handleMouseLeave, true);
        document.removeEventListener('mousemove', this._handleMouseMove);
        document.removeEventListener('contextmenu', this._handleContextMenu);
        document.removeEventListener('mousedown', this._handleMouseDown);
        document.removeEventListener('auxclick', this._handleMiddleClick, true);
        window.removeEventListener('blur', this._handleBlur);

        // Clear timeouts
        if (this.hoverTimeout) {
            clearTimeout(this.hoverTimeout);
        }

        // Remove tooltip element
        if (this.tooltipElement && this.tooltipElement.parentNode) {
            this.tooltipElement.parentNode.removeChild(this.tooltipElement);
        }

        // Clear state
        this.lockedTooltips.clear();
        this.pinnedTooltipsByUuid.clear();
        this.renderers.clear();
    }
}



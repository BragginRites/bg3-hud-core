import { BG3Component } from '../BG3Component.js';

/**
 * Drag Bar Component
 * Draggable handle for resizing grid containers
 * System-agnostic - just handles the drag interaction
 */
export class DragBar extends BG3Component {
    /**
     * Create a new drag bar
     * @param {Object} options - Drag bar configuration
     * @param {number} options.index - Index between containers
     * @param {Function} options.onDrag - Callback for drag movement
     * @param {Function} options.onDragEnd - Callback for drag end
     */
    constructor(options = {}) {
        super(options);
        this.index = options.index || 0;
        this.isDragging = false;
        this.startX = 0;
        this.deltaX = 0;

        // Bound handlers for add/remove symmetry
        this._onMouseMove = this._handleMouseMove.bind(this);
        this._onMouseUp = this._handleMouseUp.bind(this);
    }

    /**
     * Render the drag bar
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        // Create drag bar element
        this.element = this.createElement('div', ['bg3-drag-bar']);
        this.element.dataset.index = this.index;

        // Create drag indicator (visual feedback line)
        const indicator = this.createElement('div', ['drag-indicator']);
        this.element.appendChild(indicator);

        // Add drag icon
        const icon = this.createElement('i', ['fas', 'fa-grip-vertical']);
        this.element.appendChild(icon);

        // Register mouse down event
        this.addEventListener(this.element, 'mousedown', this._handleMouseDown.bind(this));

        return this.element;
    }

    /**
     * Handle mouse down - start dragging
     * @param {MouseEvent} event
     * @private
     */
    _handleMouseDown(event) {
        event.preventDefault();

        // Initialize drag state
        this.isDragging = true;
        this.startX = event.clientX;
        this.deltaX = 0;

        // Add visual feedback
        this.element.classList.add('dragging');
        this.element.querySelector('.drag-indicator').classList.add('visible');
        document.body.classList.add('dragging-active');

        // Add document-level listeners
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);

        // Call callback if provided
        if (this.options.onDragStart) {
            this.options.onDragStart(this, event);
        }
    }

    /**
     * Handle mouse move - update drag position
     * @param {MouseEvent} event
     * @private
     */
    _handleMouseMove(event) {
        if (!this.isDragging) return;

        // Calculate delta
        this.deltaX = event.clientX - this.startX;

        // Update indicator position
        const indicator = this.element.querySelector('.drag-indicator');
        indicator.style.transform = `translateX(${this.deltaX}px)`;

        // Call callback if provided
        if (this.options.onDrag) {
            this.options.onDrag(this, this.deltaX, event);
        }
    }

    /**
     * Handle mouse up - end dragging
     * @param {MouseEvent} event
     * @private
     */
    _handleMouseUp(event) {
        if (!this.isDragging) return;

        // Clean up drag state
        this.isDragging = false;
        
        // Remove visual feedback
        this.element.classList.remove('dragging');
        const indicator = this.element.querySelector('.drag-indicator');
        indicator.classList.remove('visible');
        indicator.style.transform = '';
        document.body.classList.remove('dragging-active');

        // Remove document-level listeners
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);

        // Call callback if provided
        if (this.options.onDragEnd) {
            this.options.onDragEnd(this, this.deltaX, event);
        }

        // Reset delta
        this.deltaX = 0;
    }

    /**
     * Get the current drag delta
     * @returns {number}
     */
    getDelta() {
        return this.deltaX;
    }
}

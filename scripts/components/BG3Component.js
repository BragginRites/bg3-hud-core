/**
 * Base Component Class for BG3 HUD
 * All UI components should extend this class
 * 
 * Key principle: Elements are created once in constructor and reused.
 * render() updates the element's content, not recreates it.
 * This prevents UI flashing on re-render.
 * 
 * @abstract
 */
export class BG3Component {
    /**
     * Create a new component
     * @param {Object} options - Component configuration options
     */
    constructor(options = {}) {
        this.options = options;
        this.element = null;
        this._eventListeners = [];
        this._isFirstRender = true;
    }

    /**
     * Render the component
     * Subclasses should override this method
     * 
     * For first render: create element and populate
     * For subsequent renders: update element content only
     * 
     * @abstract
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        throw new Error('BG3Component.render() must be implemented by subclass');
    }

    /**
     * Create the component's DOM element
     * Should only be called once per component (usually in first render or constructor)
     * @param {string} tagName - HTML tag name
     * @param {string[]} classes - CSS classes to add
     * @returns {HTMLElement}
     */
    createElement(tagName = 'div', classes = []) {
        const element = document.createElement(tagName);
        if (classes.length > 0) {
            element.classList.add(...classes);
        }
        return element;
    }

    /**
     * Add an event listener and track it for cleanup
     * @param {HTMLElement} element - Element to attach listener to
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     * @param {Object} options - Event listener options
     */
    addEventListener(element, event, handler, options = {}) {
        element.addEventListener(event, handler, options);
        this._eventListeners.push({ element, event, handler, options });
    }

    /**
     * Destroy the component and clean up resources
     */
    destroy() {
        // Remove all event listeners
        for (const { element, event, handler, options } of this._eventListeners) {
            element.removeEventListener(event, handler, options);
        }
        this._eventListeners = [];

        // Remove DOM element
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.element = null;
    }

    /**
     * Get the component's DOM element
     * @returns {HTMLElement|null}
     */
    get domElement() {
        return this.element;
    }
}

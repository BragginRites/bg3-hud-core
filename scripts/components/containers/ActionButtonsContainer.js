import { BG3Component } from '../BG3Component.js';

/**
 * Action Buttons Container
 * Rest / End Turn column + dock caret toggle.
 * DOM and interaction match bg3-inspired-hotbar RestTurnContainer 1:1.
 */
export class ActionButtonsContainer extends BG3Component {
    /**
     * @param {Object} options
     * @param {Actor} options.actor
     * @param {Token} options.token
     * @param {import('../../BG3Hotbar.js').BG3Hotbar} [options.hotbarApp]
     * @param {Function} options.getButtons
     */
    constructor(options = {}) {
        super(options);
        this.actor = options.actor;
        this.token = options.token;
        this.hotbarApp = options.hotbarApp || ui.BG3HUD_APP || null;
        this.getButtons = options.getButtons || (() => []);
        this.buttonElements = [];
        this._dockToggle = null;
    }

    /**
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        if (!this.element) {
            this.element = this.createElement('div', ['bg3-restturn-container']);
        }

        this.element.innerHTML = '';
        this.buttonElements = [];
        this._dockToggle = null;

        const buttonDefs = this.getButtons() || [];

        for (const buttonDef of buttonDefs) {
            const el = this._createRestTurnButton(buttonDef);
            this.buttonElements.push({ element: el, def: buttonDef });
            this.element.appendChild(el);
        }

        // Legacy: label.btn-toggle.fas.fa-caret-down
        this._dockToggle = this._createDockToggle();
        this.element.appendChild(this._dockToggle);

        return this.element;
    }

    /**
     * Build a rest/turn control as a div (legacy BaseButton path).
     * @param {Object} buttonDef
     * @returns {HTMLElement}
     * @private
     */
    _createRestTurnButton(buttonDef) {
        const el = document.createElement('div');
        const classes = this._legacyButtonClasses(buttonDef);
        el.classList.add(...classes);
        el.dataset.bg3Ui = 'true';
        if (buttonDef.key) el.dataset.key = buttonDef.key;

        if (buttonDef.tooltip || buttonDef.label) {
            el.dataset.tooltip = buttonDef.tooltip || buttonDef.label;
            el.dataset.tooltipDirection = buttonDef.tooltipDirection || 'LEFT';
        }

        // Legacy order: label span first, then icon (column-reverse shows icon above label)
        if (buttonDef.label) {
            const label = document.createElement('span');
            label.classList.add('rest-turn-label');
            label.innerText = buttonDef.label;
            el.appendChild(label);
        }

        if (buttonDef.icon) {
            const icon = document.createElement('i');
            const iconClasses = String(buttonDef.icon).split(/\s+/).filter(Boolean);
            if (!iconClasses.some((c) => c === 'fas' || c === 'fa-solid' || c === 'far' || c === 'fab')) {
                icon.classList.add('fas');
            }
            icon.classList.add(...iconClasses);
            el.appendChild(icon);
        }

        const visible = typeof buttonDef.visible === 'function' ? buttonDef.visible() : true;
        if (!visible) el.classList.add('hidden');

        if (typeof buttonDef.onClick === 'function') {
            this.addEventListener(el, 'click', (event) => buttonDef.onClick(event));
        }

        return el;
    }

    /**
     * Map adapter button defs onto legacy restturn class names.
     * @param {Object} buttonDef
     * @returns {string[]}
     * @private
     */
    _legacyButtonClasses(buttonDef) {
        const incoming = new Set(buttonDef.classes || []);
        const classes = new Set(['rest-turn-button']);

        const isEndTurn = buttonDef.key === 'end-turn'
            || incoming.has('end-turn-button')
            || incoming.has('turn-button')
            || incoming.has('end-turn');

        if (isEndTurn) {
            classes.add('turn-button');
            classes.add('end-turn');
        }

        // Keep any extra adapter classes that aren't the old icon-only aliases
        for (const cls of incoming) {
            if (cls === 'end-turn-button' || cls === 'rest-button' || cls === 'bg3-action-button') continue;
            classes.add(cls);
        }

        return [...classes];
    }

    /**
     * Legacy caret dock toggle.
     * @returns {HTMLElement}
     * @private
     */
    _createDockToggle() {
        const toggle = document.createElement('label');
        toggle.className = 'btn-toggle fas fa-caret-down';
        toggle.title = 'Show/Hide HotBar UI';
        toggle.setAttribute('for', 'toggle-input');
        toggle.dataset.bg3Ui = 'true';

        this.addEventListener(toggle, 'click', (event) => {
            const app = this.hotbarApp || ui.BG3HUD_APP;
            if (app && typeof app._onToggleMinimize === 'function') {
                app._onToggleMinimize(event);
            }
        });

        return toggle;
    }

    /**
     * Update button visibility based on context (combat state, etc.)
     */
    updateVisibility() {
        for (const { element, def } of this.buttonElements) {
            if (typeof def.visible === 'function') {
                element.classList.toggle('hidden', !def.visible());
            }
        }
    }

    /**
     * Destroy the container
     */
    destroy() {
        this.buttonElements = [];
        this._dockToggle = null;
        super.destroy();
    }
}

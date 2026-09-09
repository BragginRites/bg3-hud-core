import { Logger } from './logger.js';

/**
 * BG3 HUD Component Registry
 * Central storage for system adapter registrations
 */
/** Named HUD parts an Adapter may fill. Core-filled parts (Hotbar, Quick Access, End turn, Views) are not in this set. */
export const NAMED_HUD_PART_KEYS = Object.freeze([
    'portrait',
    'passives',
    'weaponSet',
    'filter',
    'characterInfo',
    'activeEffects',
    'rest'
]);

const NAMED_PART_CLASS_SLOT = Object.freeze({
    portrait: 'portraitContainer',
    passives: 'passivesContainer',
    weaponSet: 'weaponSetContainer',
    filter: 'filterContainer',
    characterInfo: 'infoContainer',
    activeEffects: 'activeEffectsContainer'
});

export const BG3HUD_REGISTRY = {
    // Fills from registerNamedHudParts (and the old per-part wrappers)
    namedHudParts: {},

    // Class slots mirrored from named fills (internal; extras stay on containers)
    portraitContainer: null,
    passivesContainer: null,
    actionButtonsContainer: null,
    filterContainer: null,
    weaponSetContainer: null,
    infoContainer: null,
    activeEffectsContainer: null,

    // Additional containers registered by adapters (id → { ContainerClass, region, order })
    containers: {},

    // System adapters
    adapters: [],

    // Active adapter (based on current game system)
    activeAdapter: null,

    // Tooltip manager instance
    tooltipManager: null,

    // Target selector manager instance
    targetSelectorManager: null,

    // Menu builders registered by adapters
    menuBuilders: {}
};

/**
 * Optional methods system adapters MAY implement beyond MODULE_ID/systemId/registerAdapter config.
 *
 * @typedef {Object} BG3HudAdapterHooks
 * @property {Function} [resolveExternalDragData] Parsed drag payload from `JSON.parse(transfer)`. Return a
 *   result to consume the drop; return `null` to let core handle Item/Macro/Activity only.
 *   @returns {Promise<null|BG3HudDragResolution>}
 * @property {Function} [resolveNotice] Map an `updateActor` changes object to a play-sheet notice.
 *   Core unions this with a system-agnostic default. Do not walk the HUD tree.
 *   @param {Object} changes
 *   @param {Actor} [actor]
 *   @returns {{ fills?: string[], extras?: string[], cells?: 'all' | { parked: string[] } }}
 * @property {Function} [resolveHotbarMembershipOnItemUpdate] Decide whether an item update should add/remove
 *   the item from hotbar membership. System-specific (e.g. spell preparation). Return `'add'`, `'remove'`,
 *   or `null` for no membership change (core still refreshes cell data when present).
 *   @param {Item} item
 *   @param {Actor} actor
 *   @returns {Promise<'add'|'remove'|null>|'add'|'remove'|null}
 * @property {Function} [isPlayerCharacter] Whether actor should get PC-only HUD chrome (views, etc.).
 *   @param {Actor} actor
 *   @returns {boolean}
 */

/**
 * @typedef {Object} BG3HudDragResolution
 * Return EITHER a `document` (core transforms it) OR pre-built `cellData` (core persists it directly).
 * @property {foundry.abstract.Document} [document]
 * @property {'Item'|'Macro'|'Activity'} [type]
 * @property {Record<string, unknown>} [augment] Merged onto cell data after adapter `transform*` (e.g. strike metadata).
 * @property {Object} [cellData] Pre-built cell data for entries with no backing document (e.g. system actions).
 *   Include `actorUuid` for ownership validation and a stable `uuid` for duplicate detection.
 */

/**
 * BG3 HUD API
 * Methods for system adapters to register components
 */
export const BG3HUD_API = {
    /**
     * Fill named HUD parts for this game. One call; omit a key when the game has no such concept.
     * Class swap stays inside. Adapter extras use registerContainer (second list).
     * @param {Object} fills
     * @param {Class} [fills.portrait]
     * @param {Class} [fills.passives]
     * @param {Class} [fills.weaponSet]
     * @param {Class} [fills.filter]
     * @param {Class} [fills.characterInfo]
     * @param {Class} [fills.activeEffects]
     * @param {Function} [fills.rest] `({ actor, token }) => rest button defs[]`
     */
    registerNamedHudParts(fills = {}) {
        if (!fills || typeof fills !== 'object') {
            Logger.error('registerNamedHudParts requires an object of fills');
            return;
        }

        for (const [key, fill] of Object.entries(fills)) {
            if (!NAMED_HUD_PART_KEYS.includes(key)) {
                Logger.warn(`registerNamedHudParts: ignoring unknown named HUD part '${key}'`);
                continue;
            }
            if (fill == null) continue;

            if (key === 'rest') {
                if (typeof fill !== 'function') {
                    Logger.error('registerNamedHudParts: rest fill must be a function ({ actor, token }) => defs');
                    continue;
                }
                BG3HUD_REGISTRY.namedHudParts.rest = fill;
                Logger.info('Registered rest fill');
                continue;
            }

            if (typeof fill !== 'function') {
                Logger.error(`registerNamedHudParts: '${key}' fill must be a class`);
                continue;
            }
            BG3HUD_REGISTRY.namedHudParts[key] = fill;
            const slot = NAMED_PART_CLASS_SLOT[key];
            if (slot) BG3HUD_REGISTRY[slot] = fill;
            Logger.info(`Registered named HUD part '${key}':`, fill.name);
        }
    },

    /**
     * Fill for a named HUD part, or null if the Adapter omitted it.
     * @param {string} key
     * @returns {Class|Function|null}
     */
    getNamedHudPart(key) {
        return BG3HUD_REGISTRY.namedHudParts[key] ?? null;
    },

    /**
     * @deprecated Use registerNamedHudParts({ portrait })
     */
    registerPortraitContainer(containerClass) {
        this.registerNamedHudParts({ portrait: containerClass });
    },

    /**
     * @deprecated Use registerNamedHudParts({ passives })
     */
    registerPassivesContainer(containerClass) {
        this.registerNamedHudParts({ passives: containerClass });
    },

    /**
     * @deprecated Use registerNamedHudParts({ rest }). Core owns End turn housing.
     */
    registerActionButtonsContainer() {
        Logger.warn('registerActionButtonsContainer is ignored. Use registerNamedHudParts({ rest }).');
    },

    /**
     * @deprecated Use registerNamedHudParts({ filter })
     */
    registerFilterContainer(containerClass) {
        this.registerNamedHudParts({ filter: containerClass });
    },

    /**
     * @deprecated Use registerNamedHudParts({ weaponSet })
     */
    registerWeaponSetContainer(containerClass) {
        this.registerNamedHudParts({ weaponSet: containerClass });
    },

    /**
     * @deprecated Use registerNamedHudParts({ characterInfo })
     */
    registerInfoContainer(containerClass) {
        this.registerNamedHudParts({ characterInfo: containerClass });
    },

    /**
     * Register an optional docked container class (adapter-owned UI chrome).
     * Core lays these out by region + order; it does not interpret container ids.
     * @param {string} id - Stable container id (used as `hotbarApp.components[id]`)
     * @param {Class} containerClass - Container class
     * @param {Object} [options]
     * @param {'left'|'center'} [options.region='left'] - Layout region
     * @param {number} [options.order] - Sort order within the region (lower first). Defaults to registration order.
     */
    registerContainer(id, containerClass, options = {}) {
        if (!id || !containerClass) {
            Logger.error('registerContainer requires id and containerClass');
            return;
        }
        const region = options.region === 'center' ? 'center' : 'left';
        const existingCount = Object.keys(BG3HUD_REGISTRY.containers).length;
        const order = Number.isFinite(options.order) ? options.order : existingCount * 10;
        Logger.info(`Registering container '${id}' (${region}, order ${order}):`, containerClass.name);
        BG3HUD_REGISTRY.containers[id] = {
            ContainerClass: containerClass,
            region,
            order
        };
    },

    /**
     * Registered optional containers for a layout region, sorted by order.
     * @param {'left'|'center'} [region='left']
     * @returns {Array<{ id: string, ContainerClass: Class, region: string, order: number }>}
     */
    getRegisteredContainers(region = 'left') {
        return Object.entries(BG3HUD_REGISTRY.containers)
            .map(([id, entry]) => {
                // Back-compat: plain class registrations from older adapters
                if (typeof entry === 'function') {
                    return { id, ContainerClass: entry, region: 'left', order: 0 };
                }
                return {
                    id,
                    ContainerClass: entry?.ContainerClass,
                    region: entry?.region || 'left',
                    order: Number.isFinite(entry?.order) ? entry.order : 0
                };
            })
            .filter((e) => e.ContainerClass && e.region === region)
            .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    },

    /**
     * Register a system adapter
     * @param {Object} adapter - System adapter instance
     * @param {string} adapter.MODULE_ID - Required: The adapter package ID (must match manifest `id`)
     * @param {string} adapter.systemId - Required: Foundry system id (`game.system.id`) this adapter targets
     * @param {string} [adapter.name] - Optional: Display name for the adapter
     * @param {Object} [config] - Optional: Adapter configuration
     * @param {string[]} [config.tooltipClassBlacklist] - CSS classes to filter from UI tooltips
     */
    registerAdapter(adapter, config = {}) {
        // Validate required properties
        if (!adapter.MODULE_ID) {
            Logger.error('Adapter missing required MODULE_ID property:', adapter);
            return;
        }
        if (!adapter.systemId) {
            Logger.error('Adapter missing required systemId property:', adapter);
            return;
        }

        // Store config on adapter for later access
        adapter._bg3Config = {
            tooltipClassBlacklist: config.tooltipClassBlacklist || [],
            ...config
        };

        Logger.info('Registering adapter:', adapter.constructor.name);
        BG3HUD_REGISTRY.adapters.push(adapter);

        // Set as active if it matches current system
        if (adapter.systemId === game.system.id) {
            BG3HUD_REGISTRY.activeAdapter = adapter;
            Logger.info('Active adapter set:', adapter.constructor.name);

            // Connect adapter to target selector manager
            if (BG3HUD_REGISTRY.targetSelectorManager) {
                BG3HUD_REGISTRY.targetSelectorManager.setAdapter(adapter);
                Logger.info('Target selector connected to adapter');
            }
        }
    },

    /**
     * Get the component registry
     * @returns {Object} The registry object
     */
    getRegistry() {
        return BG3HUD_REGISTRY;
    },

    /**
     * Get the active system adapter
     * @returns {Object|null} The active adapter or null
     */
    getActiveAdapter() {
        return BG3HUD_REGISTRY.activeAdapter;
    },

    /**
     * Whether an actor is treated as a player character for HUD chrome / auto-populate gates.
     * Prefers adapter.isPlayerCharacter; falls back to hasPlayerOwner || type === 'character'.
     * @param {Actor} actor
     * @returns {boolean}
     */
    isPlayerCharacter(actor) {
        if (!actor) return false;
        const adapter = BG3HUD_REGISTRY.activeAdapter;
        if (adapter && typeof adapter.isPlayerCharacter === 'function') {
            try {
                return !!adapter.isPlayerCharacter(actor);
            } catch (e) {
                Logger.error('adapter.isPlayerCharacter failed:', e);
            }
        }
        return !!(actor.hasPlayerOwner || actor.type === 'character');
    },

    /**
     * Register a tooltip renderer for the current game system
     * @param {string} systemId - System ID matching `game.system.id`
     * @param {Function} renderer - Renderer function that returns tooltip content
     * @param {Object} renderer.data - Data object (item, spell, etc.)
     * @param {Object} renderer.options - Rendering options
     * @returns {Promise<Object>} Object with { content: string|HTMLElement, classes?: string[], direction?: string }
     * 
     * @example
     * BG3HUD_API.registerTooltipRenderer(game.system.id, async (data, options) => {
     *   const html = await renderTemplate('path/to/template.hbs', data);
     *   return {
     *     content: html,
     *     classes: ['item-tooltip', 'spell-tooltip'],
     *     direction: 'UP'
     *   };
     * });
     */
    registerTooltipRenderer(systemId, renderer) {
        if (!BG3HUD_REGISTRY.tooltipManager) {
            Logger.error('TooltipManager not initialized. Call BG3HUD_API.setTooltipManager() first.');
            return;
        }
        BG3HUD_REGISTRY.tooltipManager.registerRenderer(systemId, renderer);
    },

    /**
     * Set the tooltip manager instance
     * @param {TooltipManager} tooltipManager - TooltipManager instance
     */
    setTooltipManager(tooltipManager) {
        BG3HUD_REGISTRY.tooltipManager = tooltipManager;
        Logger.info('TooltipManager registered');
    },

    /**
     * Get the tooltip manager instance
     * @returns {TooltipManager|null} The tooltip manager or null
     */
    getTooltipManager() {
        return BG3HUD_REGISTRY.tooltipManager;
    },

    /**
     * Register a menu builder for the current game system
     * @param {string} systemId - System ID matching `game.system.id`
     * @param {Class} builderClass - MenuBuilder class (or subclass)
     * @param {Object} [options] - Options for the menu builder
     * @param {Object} [options.adapter] - Adapter instance to pass to builder
     * 
     * @example
     * import { MenuBuilder } from './components/menus/MyMenuBuilder.js';
     * BG3HUD_API.registerMenuBuilder(game.system.id, MenuBuilder, { adapter: this });
     */
    registerMenuBuilder(systemId, builderClass, options = {}) {
        Logger.info(`Registering menu builder for system '${systemId}':`, builderClass.name);

        // Create builder instance with adapter if provided
        const builder = new builderClass({ adapter: options.adapter || null });
        BG3HUD_REGISTRY.menuBuilders[systemId] = builder;
    },

    /**
     * Get the menu builder for a system
     * @param {string} [systemId] - System ID (defaults to current game system)
     * @returns {MenuBuilder|null} The menu builder or null
     */
    getMenuBuilder(systemId = null) {
        const targetSystemId = systemId || game.system.id;
        return BG3HUD_REGISTRY.menuBuilders[targetSystemId] || null;
    },

    /**
     * Set the target selector manager instance
     * @param {TargetSelectorManager} manager - TargetSelectorManager instance
     */
    setTargetSelectorManager(manager) {
        BG3HUD_REGISTRY.targetSelectorManager = manager;
        Logger.info('TargetSelectorManager registered');
    },

    /**
     * Get the target selector manager instance
     * @returns {TargetSelectorManager|null} The target selector manager or null
     */
    getTargetSelectorManager() {
        return BG3HUD_REGISTRY.targetSelectorManager;
    },

    /**
     * Start target selection for an item use
     * @param {Object} options
     * @param {Token} options.token - The source token (caster/attacker)
     * @param {Item} options.item - The item being used
     * @param {Object} [options.activity] - Optional activity for multi-activity items
     * @returns {Promise<Token[]>} Promise that resolves with selected targets
     */
    async startTargetSelection({ token, item, activity = null }) {
        const manager = BG3HUD_REGISTRY.targetSelectorManager;
        if (!manager) {
            Logger.warn('Target selector manager not initialized');
            return Array.from(game.user.targets);
        }
        return manager.select({ token, item, activity });
    },

    /**
     * Check if an item needs targeting
     * @param {Item} item - The item to check
     * @param {Object} [activity] - Optional activity
     * @returns {boolean} True if targeting is required
     */
    needsTargeting(item, activity = null) {
        const manager = BG3HUD_REGISTRY.targetSelectorManager;
        if (!manager) {
            return false;
        }
        return manager.needsTargeting(item, activity);
    },

    /**
     * Show range indicator for an item
     * @param {Object} options
     * @param {Token} options.token - The source token
     * @param {Item} options.item - The item
     * @param {Object} [options.activity] - Optional activity
     */
    showRangeIndicator({ token, item, activity = null }) {
        const manager = BG3HUD_REGISTRY.targetSelectorManager;
        if (!manager) return;
        manager.showRangeIndicator({ token, item, activity });
    },

    /**
     * Hide range indicator
     */
    hideRangeIndicator() {
        const manager = BG3HUD_REGISTRY.targetSelectorManager;
        if (!manager) return;
        manager.hideRangeIndicator();
    }
};

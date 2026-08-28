import { Logger } from './logger.js';

/**
 * BG3 HUD Component Registry
 * Central storage for system adapter registrations
 */
export const BG3HUD_REGISTRY = {
    // Main container classes registered by adapters
    portraitContainer: null,
    passivesContainer: null,
    actionContainer: null,
    abilityContainer: null,
    actionButtonsContainer: null,
    filterContainer: null,
    weaponSetContainer: null,
    infoContainer: null,

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
 * @property {Function} [onAdapterFlagsChanged] Respond to Foundry deltas under `changes.flags[MODULE_ID]` for the active actor.
 *   @returns {Promise<boolean>} `true` if the adapter handled targeted UI updates for this delta.
 * @property {Function} [resolveHotbarMembershipOnItemUpdate] Decide whether an item update should add/remove
 *   the item from hotbar membership. System-specific (e.g. spell preparation). Return `'add'`, `'remove'`,
 *   or `null` for no membership change (core still refreshes cell data when present).
 *   @param {Item} item
 *   @param {Actor} actor
 *   @returns {Promise<'add'|'remove'|null>|'add'|'remove'|null}
 * @property {Function} [isPlayerCharacter] Whether actor should get PC-only HUD chrome (views, etc.).
 *   @param {Actor} actor
 *   @returns {boolean}
 * @property {Function} [resolveActorUpdatePlan] Map an `updateActor` changes object to targeted HUD refresh
 *   actions. Core executes the plan; adapters own system document paths (e.g. `system.spells`).
 *   @param {Object} changes
 *   @returns {BG3HudActorUpdatePlan}
 */

/**
 * @typedef {Object} BG3HudActorUpdatePlan
 * @property {boolean} [health] Refresh portrait health / death UI
 * @property {boolean} [attributes] Refresh portrait data badges (AC, speed, etc.)
 * @property {boolean} [resources] Refresh filter / resource strip
 * @property {boolean} [abilities] Refresh info panel (abilities / skills)
 * @property {boolean} [items] Handle shallow `changes.items` indicator
 * @property {boolean} [depletion] Run adapter.updateCellDepletionStates after handlers
 * @property {boolean} [stop] Stop after applying this plan (no further default fallthrough)
 * @property {boolean} [lateDepletion] Run depletion at end when stop was not set
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
     * Register a portrait container class
     * @param {Class} containerClass - Class that extends PortraitContainer
     */
    registerPortraitContainer(containerClass) {
        Logger.info('Registering portrait container:', containerClass.name);
        BG3HUD_REGISTRY.portraitContainer = containerClass;
    },

    /**
     * Register a passives container class
     * @param {Class} containerClass - Class that extends PassivesContainer
     */
    registerPassivesContainer(containerClass) {
        Logger.info('Registering passives container:', containerClass.name);
        BG3HUD_REGISTRY.passivesContainer = containerClass;
    },

    /**
     * Register an action container class
     * @param {Class} containerClass - Class that extends ActionContainer
     */
    registerActionContainer(containerClass) {
        Logger.info('Registering action container:', containerClass.name);
        BG3HUD_REGISTRY.actionContainer = containerClass;
    },

    /**
     * Register an ability container class
     * @param {Class} containerClass - Class that extends AbilityContainer
     */
    registerAbilityContainer(containerClass) {
        Logger.info('Registering ability container:', containerClass.name);
        BG3HUD_REGISTRY.abilityContainer = containerClass;
    },

    /**
     * Register an action buttons container class
     * @param {Class} containerClass - Class that extends ActionButtonsContainer
     */
    registerActionButtonsContainer(containerClass) {
        Logger.info('Registering action buttons container:', containerClass.name);
        BG3HUD_REGISTRY.actionButtonsContainer = containerClass;
    },

    /**
     * Register a filter container class
     * @param {Class} containerClass - Class that extends FilterContainer
     */
    registerFilterContainer(containerClass) {
        Logger.info('Registering filter container:', containerClass.name);
        BG3HUD_REGISTRY.filterContainer = containerClass;
    },

    /**
     * Register a weapon set container class
     * @param {Class} containerClass - Class that extends WeaponSetContainer
     */
    registerWeaponSetContainer(containerClass) {
        Logger.info('Registering weapon set container:', containerClass.name);
        BG3HUD_REGISTRY.weaponSetContainer = containerClass;
    },

    /**
     * Register an info container class
     * @param {Class} containerClass - Class that extends InfoContainer
     */
    registerInfoContainer(containerClass) {
        Logger.info('Registering info container:', containerClass.name);
        BG3HUD_REGISTRY.infoContainer = containerClass;
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

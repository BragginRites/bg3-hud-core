import { BG3Component } from '../BG3Component.js';
import { GridContainer } from './GridContainer.js';
import { Logger } from '../../utils/logger.js';

/**
 * Weapon Set Container - System-Agnostic Base
 * Displays multiple weapon sets that can be swapped between
 * Visual 3D carousel effect with active set in focus
 * 
 * System adapters should override:
 * - getActiveSet() - Where to store/retrieve active set index
 * - onSetSwitch() - What happens when switching sets (equipping items, etc.)
 */
export class WeaponSetContainer extends BG3Component {
    /**
     * Create a new weapon set container
     * @param {Object} options - Container options
     * @param {Actor} options.actor - The actor
     * @param {Token} options.token - The token
     * @param {Array} options.weaponSets - Array of weapon set grid data [{rows, cols, items}, ...]
     * @param {Function} options.onCellClick - Cell click handler
     * @param {Function} options.onCellRightClick - Cell right-click handler
     * @param {Function} options.onCellDragStart - Cell drag start handler
     * @param {Function} options.onCellDragEnd - Cell drag end handler
     * @param {Function} options.onCellDrop - Cell drop handler
     */
    constructor(options = {}) {
        super(options);
        this.actor = options.actor;
        this.token = options.token;
        this.weaponSets = options.weaponSets || this._getDefaultWeaponSets();
        this.persistenceManager = options.persistenceManager;
        this.onCellClick = options.onCellClick;
        this.onCellRightClick = options.onCellRightClick;
        this.onCellDragStart = options.onCellDragStart;
        this.onCellDragEnd = options.onCellDragEnd;
        this.onCellDrop = options.onCellDrop;
        
        this.gridContainers = [];
        this._setClickListeners = new Map();
    }

    /**
     * Get default weapon sets if none provided
     * @returns {Array}
     * @private
     */
    _getDefaultWeaponSets() {
        return [
            { rows: 1, cols: 2, items: {} },
            { rows: 1, cols: 2, items: {} },
            { rows: 1, cols: 2, items: {} }
        ];
    }

    /**
     * Get active weapon set index from unified state
     * @returns {number}
     */
    getActiveSet() {
        // Get from unified state if available
        const state = this.persistenceManager?.getState();
        return state?.weaponSets?.activeSet ?? 0;
    }

    /**
     * Set active weapon set index using unified persistence
     * @param {number} index - Set index (0, 1, 2)
     * @param {boolean} skipSave - If true, don't save to actor flags (for visual updates only)
     */
    async setActiveSet(index, skipSave = false) {
        // Update visual state immediately for smooth transition
        this.element.dataset.activeSet = index;
        
        // Update tooltips
        this._updateSetTooltips(index);
        
        // Save using unified persistence manager
        if (!skipSave && this.persistenceManager) {
            await this.persistenceManager.setActiveWeaponSet(index);
        }
    }

    /**
     * Update set tooltips based on active set
     * @param {number} activeIndex - Currently active set index
     * @private
     */
    _updateSetTooltips(activeIndex) {
        for (let i = 0; i < this.gridContainers.length; i++) {
            const container = this.gridContainers[i];
            if (i === activeIndex) {
                // Active set - no tooltip
                delete container.element.dataset.tooltip;
            } else {
                // Inactive set - show tooltip
                container.element.dataset.tooltip = game.i18n.format(
                  'bg3-hud-core.Tooltips.SwitchWeaponSet',
                  { number: i + 1 },
                );
                // Tooltip direction based on position relative to active set
                const isAbove = (i === activeIndex + 1) || (activeIndex === this.gridContainers.length - 1 && i === 0);
                container.element.dataset.tooltipDirection = isAbove ? 'UP' : 'DOWN';
                // Ensure UI flag is set for tooltip setting control
                container.element.dataset.bg3Ui = 'true';
            }
        }
    }

    /**
     * Handle weapon set switch
     * Override in subclass to implement equip/unequip logic
     * @param {number} setIndex - Index of set to switch to
     * @param {GridContainer} setContainer - The set container being switched to
     * @returns {Promise<void>}
     */
    async onSetSwitch(setIndex, setContainer) {
        // Base implementation: just update the active set
        // System adapters should override to handle equipping/unequipping
    }

    /**
     * Whether this item should occupy both carousel slots (two-handed weapon).
     * Override in subclass with system-specific detection.
     * @param {Item} item
     * @returns {boolean}
     * @private
     */
    _itemOccupiesBothSlots(item) {
        return false;
    }

    /**
     * Check if cell data points at an item that should fill both slots
     * @param {Object} cellData - Cell data object with uuid
     * @returns {Promise<boolean>}
     * @private
     */
    async _isTwoHandedWeapon(cellData) {
        if (!cellData?.uuid) return false;

        try {
            const item = await fromUuid(cellData.uuid);
            return this._itemOccupiesBothSlots(item);
        } catch (error) {
            Logger.warn('WeaponSetContainer | Error checking two-handed weapon:', error);
            return false;
        }
    }

    /**
     * i18n key used by shouldPreventDrop() when warning about a locked slot.
     * Override in subclass to use the adapter's existing translated key.
     * @returns {string}
     * @private
     */
    _lockedSlotWarningKey() {
        return 'bg3-hud-core.Notifications.SlotOccupiedByTwoHandedWeapon';
    }

    /**
     * Wrap GridContainer render methods to ensure two-handed weapon display
     * is updated after any render (including those triggered by UpdateCoordinator).
     * This fixes the bug where offhand slot disappears after attacking with
     * two-handed weapons, due to actor updates triggering GridContainer.render()
     * which bypasses our _updateTwoHandedWeapons() override.
     * @private
     */
    _wrapGridContainerRenders() {
        for (let setIndex = 0; setIndex < this.gridContainers.length; setIndex++) {
            const gridContainer = this.gridContainers[setIndex];

            // Skip if already wrapped
            if (gridContainer._bg3TwoHandedWrapped) continue;

            // Store reference to this WeaponSetContainer and the original render
            const weaponSetContainer = this;
            const index = setIndex;
            const originalRender = gridContainer.render.bind(gridContainer);

            // Wrap the render method
            gridContainer.render = async function () {
                const result = await originalRender();
                // After render completes, update two-handed weapon display for this set
                await weaponSetContainer._updateSetTwoHandedWeapons(this, index);
                return result;
            };

            // Mark as wrapped to prevent re-wrapping
            gridContainer._bg3TwoHandedWrapped = true;
        }
    }

    /**
     * Update all weapon sets to show two-handed weapon duplicates
     * @private
     */
    async _updateTwoHandedWeapons() {
        for (let setIndex = 0; setIndex < this.gridContainers.length; setIndex++) {
            await this._updateSetTwoHandedWeapons(this.gridContainers[setIndex], setIndex);
        }
    }

    /**
     * Update a single weapon set for two-handed weapons.
     * Base default: left-slot-only duplicate+lock. Override in subclass for
     * richer behavior (e.g. grip memory, stash, bidirectional checks).
     * @param {GridContainer} gridContainer
     * @param {number} [setIndex]
     * @private
     */
    async _updateSetTwoHandedWeapons(gridContainer, setIndex = null) {
        // Only process if this is a 2-slot weapon set (1 row, 2 cols)
        if (gridContainer.rows !== 1 || gridContainer.cols !== 2) return;

        const leftCell = gridContainer.getCell(0, 0);  // Left slot (col 0, row 0)
        const rightCell = gridContainer.getCell(1, 0); // Right slot (col 1, row 0)

        if (!leftCell || !rightCell) return;

        // Check left slot for two-handed weapon
        if (leftCell.data && await this._isTwoHandedWeapon(leftCell.data)) {
            // Duplicate to right slot with special marker
            const duplicateData = {
                ...leftCell.data,
                isTwoHandedDuplicate: true,
                sourceSlot: '0-0'
            };
            await rightCell.setData(duplicateData, { skipSave: true });
            rightCell.element.classList.add('two-handed-duplicate');
            rightCell.element.dataset.locked = 'true';
        } else {
            // Clear duplicate marker if right cell was previously a duplicate
            if (rightCell.data?.isTwoHandedDuplicate) {
                await rightCell.setData(null, { skipSave: true });
            }
            rightCell.element.classList.remove('two-handed-duplicate');
            delete rightCell.element.dataset.locked;
        }
    }

    /**
     * Check if a cell is locked (occupied by two-handed weapon duplicate)
     * @param {GridCell} cell
     * @returns {boolean}
     */
    isCellLocked(cell) {
        return cell.element?.dataset?.locked === 'true';
    }

    /**
     * Handle drop on a cell - prevent drops on locked cells
     * This method is called by the interaction coordinator
     * @param {GridCell} targetCell
     * @returns {boolean} - true if drop should be prevented
     */
    shouldPreventDrop(targetCell) {
        // Prevent drop on locked cells (two-handed duplicates)
        if (this.isCellLocked(targetCell)) {
            ui.notifications.warn(game.i18n.localize(this._lockedSlotWarningKey()));
            return true;
        }
        return false;
    }

    /**
     * After a cell is updated, check if we need to update two-handed weapon display
     * @param {number} setIndex
     * @param {string} slotKey
     */
    async onCellUpdated(setIndex, slotKey) {
        const gridContainer = this.gridContainers[setIndex];
        if (gridContainer) {
            await this._updateSetTwoHandedWeapons(gridContainer, setIndex);
        }
    }

    /**
     * Render the weapon set container
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        // Create container element
        if (!this.element) {
            this.element = this.createElement('div', ['bg3-weapon-container']);
        }

        // Rebuild only if weapon set count changed.
        const needsRebuild = this.gridContainers.length !== this.weaponSets.length;
        if (needsRebuild) {
            this.element.innerHTML = '';
            this.gridContainers = [];
            this._setClickListeners.clear();
        }

        for (let i = 0; i < this.weaponSets.length; i++) {
            const setData = this.weaponSets[i];
            let gridContainer = this.gridContainers[i];
            if (!gridContainer) {
                gridContainer = new GridContainer({
                    rows: setData.rows,
                    cols: setData.cols,
                    items: setData.items || {},
                    id: 'weapon',
                    index: i,
                    containerType: 'weaponSet',
                    containerIndex: i,
                    persistenceManager: this.persistenceManager,
                    actor: this.actor,
                    token: this.token,
                    onCellClick: this.onCellClick,
                    onCellRightClick: this.onCellRightClick,
                    onCellDragStart: this.onCellDragStart,
                    onCellDragEnd: this.onCellDragEnd,
                    onCellDrop: this.onCellDrop,
                    decorateCellElement: this.options?.hotbarApp?.adapter?.decorateCellElement || this.options?.decorateCellElement
                });
                this.gridContainers[i] = gridContainer;
            } else {
                gridContainer.rows = setData.rows;
                gridContainer.cols = setData.cols;
                gridContainer.items = setData.items || {};
            }
        }

        await Promise.all(this.gridContainers.map((gridContainer) => gridContainer.render()));

        for (let i = 0; i < this.weaponSets.length; i++) {
            const gridContainer = this.gridContainers[i];
            gridContainer.element.classList.add('bg3-weapon-set');
            gridContainer.element.dataset.containerIndex = i;
            gridContainer.element.dataset.setId = i;
            // Mark as HUD UI - native/system rich tooltips are suppressed here
            gridContainer.element.dataset.bg3Ui = 'true';

            if (!this._setClickListeners.has(i)) {
                const listener = async (event) => {
                    const activeIndex = this.getActiveSet();
                    if (i === activeIndex) return;
                    event.preventDefault();
                    event.stopPropagation();
                    await this._handleSetClick(i, gridContainer);
                };
                this.addEventListener(gridContainer.element, 'click', listener);
                this._setClickListeners.set(i, listener);
            }

            if (gridContainer.element.parentElement !== this.element) {
                this.element.appendChild(gridContainer.element);
            }
        }

        // Set initial active set
        const activeIndex = this.getActiveSet();
        this.element.dataset.activeSet = activeIndex;
        this._updateSetTooltips(activeIndex);

        // Wrap grid container render methods to ensure two-handed weapons update,
        // then process each weapon set for two-handed weapons
        this._wrapGridContainerRenders();
        await this._updateTwoHandedWeapons();

        return this.element;
    }

    /**
     * Handle weapon set click
     * @param {number} setIndex - Index of clicked set
     * @param {GridContainer} setContainer - The set container
     * @private
     */
    async _handleSetClick(setIndex, setContainer) {
        const currentActiveSet = this.getActiveSet();
        
        // Don't switch if already active
        if (setIndex === currentActiveSet) return;
        
        // Call system-specific switch logic
        await this.onSetSwitch(setIndex, setContainer);
        
        // Update active set
        await this.setActiveSet(setIndex);
    }

    /**
     * Get a grid container by index
     * @param {number} index - Grid index
     * @returns {GridContainer|null}
     */
    getGrid(index) {
        return this.gridContainers[index] || null;
    }

    /**
     * Update a specific weapon set's data
     * @param {number} setIndex - Index of set to update
     * @param {Object} newData - New grid data
     */
    async updateSet(setIndex, newData) {
        if (setIndex < 0 || setIndex >= this.gridContainers.length) {
            Logger.warn('WeaponSetContainer | Invalid set index:', setIndex);
            return;
        }
        
        this.weaponSets[setIndex] = newData;
        const gridContainer = this.gridContainers[setIndex];
        gridContainer.rows = newData.rows;
        gridContainer.cols = newData.cols;
        gridContainer.items = newData.items || {};
        await gridContainer.render();
        await this._updateSetTwoHandedWeapons(gridContainer, setIndex);
    }

    /**
     * Destroy the container
     */
    destroy() {
        // Destroy grid containers
        for (const container of this.gridContainers) {
            if (container && typeof container.destroy === 'function') {
                container.destroy();
            }
        }
        
        this.gridContainers = [];
        
        super.destroy();
    }
}


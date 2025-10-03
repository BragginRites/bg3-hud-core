/**
 * Container Type Detector
 * Single source of truth for detecting which container a cell belongs to
 * Eliminates duplicate container detection logic throughout the codebase
 */
export class ContainerTypeDetector {
    /**
     * Container types enum
     */
    static TYPES = {
        HOTBAR: 'hotbar',
        WEAPON_SET: 'weaponSet',
        QUICK_ACCESS: 'quickAccess'
    };

    /**
     * Detect container type from a cell element
     * @param {GridCell} cell - Cell to check
     * @returns {Object} {type: 'hotbar'|'weaponSet'|'quickAccess', index: number}
     */
    static detectContainer(cell) {
        if (!cell?.element) {
            return { type: this.TYPES.HOTBAR, index: 0 };
        }
        
        // Check weapon set first (most specific)
        const weaponSet = cell.element.closest('.bg3-weapon-set');
        if (weaponSet) {
            const index = parseInt(weaponSet.dataset.setId ?? weaponSet.dataset.containerIndex ?? '0');
            return { type: this.TYPES.WEAPON_SET, index };
        }
        
        // Check quick access
        const quickAccess = cell.element.closest('.bg3-quick-access-grid');
        if (quickAccess) {
            return { type: this.TYPES.QUICK_ACCESS, index: 0 };
        }
        
        // Default: hotbar grid
        const gridIndex = cell.gridIndex ?? 0;
        return { type: this.TYPES.HOTBAR, index: gridIndex };
    }

    /**
     * Check if cell is in weapon set container
     * @param {GridCell} cell
     * @returns {boolean}
     */
    static isWeaponSet(cell) {
        return this.detectContainer(cell).type === this.TYPES.WEAPON_SET;
    }

    /**
     * Check if cell is in quick access container
     * @param {GridCell} cell
     * @returns {boolean}
     */
    static isQuickAccess(cell) {
        return this.detectContainer(cell).type === this.TYPES.QUICK_ACCESS;
    }

    /**
     * Check if cell is in hotbar container
     * @param {GridCell} cell
     * @returns {boolean}
     */
    static isHotbar(cell) {
        return this.detectContainer(cell).type === this.TYPES.HOTBAR;
    }

    /**
     * Check if cell is in active weapon set
     * Requires the weapon set container to determine active set
     * @param {GridCell} cell
     * @param {number} activeSetIndex - Currently active weapon set index
     * @returns {boolean}
     */
    static isActiveWeaponSet(cell, activeSetIndex) {
        const container = this.detectContainer(cell);
        if (container.type !== this.TYPES.WEAPON_SET) return false;
        return container.index === activeSetIndex;
    }

    /**
     * Get the slot key for a cell (format: "col-row")
     * @param {GridCell} cell
     * @returns {string}
     */
    static getSlotKey(cell) {
        return `${cell.col}-${cell.row}`;
    }

    /**
     * Check if two cells are in the same container
     * @param {GridCell} cell1
     * @param {GridCell} cell2
     * @returns {boolean}
     */
    static areSameContainer(cell1, cell2) {
        const container1 = this.detectContainer(cell1);
        const container2 = this.detectContainer(cell2);
        return container1.type === container2.type && container1.index === container2.index;
    }

    /**
     * Check if this is a cross-container operation
     * @param {GridCell} sourceCell
     * @param {GridCell} targetCell
     * @returns {boolean}
     */
    static isCrossContainer(sourceCell, targetCell) {
        return !this.areSameContainer(sourceCell, targetCell);
    }
}


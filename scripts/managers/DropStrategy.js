import { ContainerTypeDetector } from './ContainerTypeDetector.js';

/**
 * Base Drop Strategy
 * All strategies now use the same updateCell API
 * Simplifies persistence by removing container-specific logic
 */
export class DropStrategy {
    constructor(persistenceManager, containerType) {
        this.persistenceManager = persistenceManager;
        this.containerType = containerType;
    }

    /**
     * Handle external drop (from character sheet, compendium, etc.)
     * @param {GridCell} targetCell - Cell being dropped on
     * @param {Object} cellData - Transformed cell data
     * @returns {Promise<void>}
     */
    async handleExternalDrop(targetCell, cellData) {
        await targetCell.setData(cellData);
        await this.persistCell(targetCell);
    }

    /**
     * Handle same-container swap
     * @param {GridCell} sourceCell
     * @param {GridCell} targetCell
     * @returns {Promise<void>}
     */
    async handleSwap(sourceCell, targetCell) {
        // Swap data
        const sourceData = sourceCell.data;
        const targetData = targetCell.data;
        
        await sourceCell.setData(targetData);
        await targetCell.setData(sourceData);
        
        // Persist both cells
        await this.persistBoth(sourceCell, targetCell);
    }

    /**
     * Persist both cells after swap/move
     * Uses unified updateCell API for both cells
     * @param {GridCell} cell1
     * @param {GridCell} cell2
     * @returns {Promise<void>}
     */
    async persistBoth(cell1, cell2) {
        await this.persistCell(cell1);
        await this.persistCell(cell2);
    }

    /**
     * Persist single cell using unified API
     * @param {GridCell} cell
     * @returns {Promise<void>}
     */
    async persistCell(cell) {
        const container = ContainerTypeDetector.detectContainer(cell);
        const slotKey = ContainerTypeDetector.getSlotKey(cell);
        await this.persistenceManager.updateCell({
            container: container.type,
            containerIndex: container.index,
            slotKey: slotKey,
            data: cell.data || null
        });
    }
}

/**
 * Hotbar Drop Strategy
 * Handles drops on hotbar grid cells
 */
export class HotbarDropStrategy extends DropStrategy {
    constructor(persistenceManager) {
        super(persistenceManager, 'hotbar');
    }
}

/**
 * Weapon Set Drop Strategy
 * Handles drops on weapon set cells
 */
export class WeaponSetDropStrategy extends DropStrategy {
    constructor(persistenceManager) {
        super(persistenceManager, 'weaponSet');
    }
}

/**
 * Quick Access Drop Strategy
 * Handles drops on quick access grid cells
 */
export class QuickAccessDropStrategy extends DropStrategy {
    constructor(persistenceManager) {
        super(persistenceManager, 'quickAccess');
    }
}

/**
 * Drop Strategy Factory
 * Creates appropriate strategy based on container type
 */
export class DropStrategyFactory {
    constructor(persistenceManager) {
        this.strategies = {
            [ContainerTypeDetector.TYPES.HOTBAR]: new HotbarDropStrategy(persistenceManager),
            [ContainerTypeDetector.TYPES.WEAPON_SET]: new WeaponSetDropStrategy(persistenceManager),
            [ContainerTypeDetector.TYPES.QUICK_ACCESS]: new QuickAccessDropStrategy(persistenceManager)
        };
    }

    /**
     * Get strategy for a cell
     * @param {GridCell} cell
     * @returns {DropStrategy}
     */
    getStrategy(cell) {
        const container = ContainerTypeDetector.detectContainer(cell);
        return this.strategies[container.type];
    }

    /**
     * Get strategy by type
     * @param {string} type - Container type
     * @returns {DropStrategy}
     */
    getStrategyByType(type) {
        return this.strategies[type];
    }
}


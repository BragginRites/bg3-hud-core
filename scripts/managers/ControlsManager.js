/**
 * ControlsManager - Manages lock settings for the BG3 HUD
 * Handles master lock state and individual lock toggles
 */
export class ControlsManager {
    static MODULE_ID = 'bg3-hud-core';

    /**
     * Get the master lock state
     * @returns {boolean} Whether the master lock is enabled
     */
    static getMasterLock() {
        return game.settings.get(this.MODULE_ID, 'masterLockEnabled');
    }

    /**
     * Get a specific lock setting value
     * @param {string} key - The lock setting key (deselect, opacity, dragDrop)
     * @returns {boolean} Whether the specific lock is enabled
     */
    static getLockSetting(key) {
        const settings = game.settings.get(this.MODULE_ID, 'lockSettings');
        return settings[key] ?? false;
    }

    /**
     * Check if a specific setting is locked (master lock enabled AND individual setting enabled)
     * @param {string} key - The lock setting key
     * @returns {boolean} Whether the setting is actively locked
     */
    static isSettingLocked(key) {
        return this.getMasterLock() && this.getLockSetting(key);
    }

    /**
     * Toggle or set the master lock state
     * @param {boolean} [value] - Optional explicit value, toggles if not provided
     */
    static async updateMasterLock(value) {
        const currentValue = game.settings.get(this.MODULE_ID, 'masterLockEnabled');
        const newValue = value !== undefined ? value : !currentValue;
        
        await game.settings.set(this.MODULE_ID, 'masterLockEnabled', newValue);
        
        // Update the lock button UI
        this.updateLockButtonUI(newValue);
        
        // Update the UI dataset for CSS-based lock styling
        this.updateUIDataset();
    }

    /**
     * Update the lock button appearance
     * @param {boolean} isLocked - Whether the lock is enabled
     */
    static updateLockButtonUI(isLocked) {
        const lockBtn = document.querySelector('[data-key="control-lock"]');
        if (lockBtn) {
            lockBtn.classList.toggle('locked', isLocked);
            const icon = lockBtn.querySelector('i.fas, i.fa-solid');
            if (icon) {
                icon.classList.remove('fa-lock', 'fa-unlock');
                icon.classList.add(isLocked ? 'fa-lock' : 'fa-unlock');
            }
        }
    }

    /**
     * Update the UI dataset with current lock settings for CSS-based styling
     * @param {HTMLElement} [el] - Optional element to update, defaults to hotbar container
     */
    static updateUIDataset(el) {
        const element = el ?? ui.BG3HUD_APP?.element?.querySelector('#bg3-hotbar-container');
        if (!element) return;

        const settings = game.settings.get(this.MODULE_ID, 'lockSettings');
        const lockedSettings = Object.entries(settings)
            .filter(([key, value]) => value === true)
            .map(([key]) => key);
        
        element.dataset.lockSettings = lockedSettings.join(',');
        element.dataset.masterLock = this.getMasterLock() ? 'true' : 'false';
    }

    /**
     * Toggle a specific lock setting
     * @param {string} key - The lock setting key (deselect, opacity, dragDrop)
     */
    static async updateLockSetting(key) {
        const settings = game.settings.get(this.MODULE_ID, 'lockSettings');
        const masterLock = game.settings.get(this.MODULE_ID, 'masterLockEnabled');
        
        // Toggle the setting
        settings[key] = !settings[key];
        
        await game.settings.set(this.MODULE_ID, 'lockSettings', settings);
        
        // If enabling a setting and master lock is off, enable master lock
        if (settings[key] && !masterLock) {
            await this.updateMasterLock(true);
        }
        // If disabling and no settings are enabled, disable master lock
        else if (!Object.values(settings).some(v => v === true)) {
            await this.updateMasterLock(false);
        }
        
        this.updateUIDataset();
    }

    /**
     * Check if any lock settings are enabled
     * @returns {boolean} Whether any lock settings are enabled
     */
    static hasAnyLockEnabled() {
        const settings = game.settings.get(this.MODULE_ID, 'lockSettings');
        return Object.values(settings).some(v => v === true);
    }

    /**
     * Initialize lock state on UI render
     * Call this after the hotbar renders to set initial state
     */
    static initializeLockState() {
        const isLocked = this.getMasterLock();
        this.updateLockButtonUI(isLocked);
        this.updateUIDataset();
    }
}


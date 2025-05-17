import { BG3CONFIG } from "../utils/config.js";

export class ControlsManager {
    static getMasterLock() {
        return game.settings.get(BG3CONFIG.MODULE_NAME, 'masterLockEnabled');
    }

    static getLockSetting(key) {
        return game.settings.get(BG3CONFIG.MODULE_NAME, 'lockSettings')[key];
    }

    static isSettingLocked(key) {
        return ControlsManager.getMasterLock() && ControlsManager.getLockSetting(key);
    }

    static updateMasterLock(value) {
        const newValue = value !== undefined ? value : !game.settings.get(BG3CONFIG.MODULE_NAME, 'masterLockEnabled');
        game.settings.set(BG3CONFIG.MODULE_NAME, 'masterLockEnabled', newValue);
        document.querySelector('[data-key="controlLock"]').classList.toggle('locked', newValue)
    }

    static updateUIDataset(el) {
        const element = el ?? ui.BG3HOTBAR.element[0];
        element.dataset.lockSettings = Object.entries(game.settings.get(BG3CONFIG.MODULE_NAME, 'lockSettings')).filter(([key, value]) => value === true).flatMap(s => s[0]).join(',');
    }

    static updateLockSetting(key) {
        const el = document.querySelector(`[data-key="${key}"`),
            settings = game.settings.get(BG3CONFIG.MODULE_NAME, 'lockSettings'),
            masterLock = game.settings.get(BG3CONFIG.MODULE_NAME, 'masterLockEnabled');
        settings[key] = !settings[key];
        el.classList.toggle('checked', settings[key]);
        game.settings.set(BG3CONFIG.MODULE_NAME, 'lockSettings', settings);
        if(settings[key] && !masterLock) ControlsManager.updateMasterLock(true);
        else if(!Object.values(settings).filter(s => s === true).length) ControlsManager.updateMasterLock(false);
        ControlsManager.updateUIDataset();
    }
}
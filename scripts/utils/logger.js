/**
 * BG3 HUD - Lightweight logging helper
 *
 * Wraps console.* with a consistent module prefix and gates the low-severity
 * levels (debug/info) behind a client "debug logging" setting so a normal
 * session stays quiet while diagnostics remain one toggle away.
 *
 * warn/error always print — they indicate real problems.
 *
 * Usage:
 *   import { Logger } from './utils/logger.js';           // core
 *   Logger.debug('token swap', token.name);
 *
 *   import { createLogger } from '/modules/bg3-hud-core/scripts/utils/logger.js'; // adapters
 *   const log = createLogger('bg3-hud-dnd5e');
 *   log.warn('activity shape unexpected', item);
 */

const CORE_MODULE_ID = 'bg3-hud-core';
const DEBUG_SETTING = 'debugLogging';

/**
 * Whether verbose (debug/info) logging is enabled.
 * Reads the core client setting; defaults to false when settings are not yet
 * registered (e.g. very early init) so we never throw during bootstrap.
 * @returns {boolean}
 */
function isVerbose() {
    try {
        return game.settings.get(CORE_MODULE_ID, DEBUG_SETTING) === true;
    } catch {
        return false;
    }
}

/**
 * Build a logger bound to a given module id.
 * @param {string} [moduleId] Prefix shown in the console, e.g. 'bg3-hud-dnd5e'
 * @returns {{debug: Function, info: Function, warn: Function, error: Function}}
 */
export function createLogger(moduleId = CORE_MODULE_ID) {
    const prefix = `[${moduleId}]`;
    return {
        /** Verbose trace — only prints when debug logging is enabled. */
        debug(...args) {
            if (isVerbose()) console.debug(prefix, ...args);
        },
        /** Informational milestone — only prints when debug logging is enabled. */
        info(...args) {
            if (isVerbose()) console.info(prefix, ...args);
        },
        /** Warning — always prints. */
        warn(...args) {
            console.warn(prefix, ...args);
        },
        /** Error — always prints. */
        error(...args) {
            console.error(prefix, ...args);
        }
    };
}

/** Shared core logger instance. */
export const Logger = createLogger(CORE_MODULE_ID);

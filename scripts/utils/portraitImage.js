/**
 * BG3 HUD - Portrait image source resolution
 *
 * Shared helper so every system adapter resolves "token art vs. portrait art"
 * the same way: a per-actor flag overrides the client default setting.
 */

/**
 * Resolve whether an actor's portrait should use token art.
 * The actor's `useTokenImage` flag (if set) overrides the module's
 * `defaultPortraitImageSource` client setting.
 * @param {Actor} actor - The actor whose preference to resolve
 * @param {string} moduleId - The adapter module id owning the flag/setting
 * @returns {boolean} True to use token art, false to use the actor's portrait art
 */
export function resolveUseTokenImage(actor, moduleId) {
    const actorPreference = actor?.getFlag(moduleId, 'useTokenImage');
    if (actorPreference !== undefined) return actorPreference;
    return game.settings.get(moduleId, 'defaultPortraitImageSource') !== 'portrait';
}

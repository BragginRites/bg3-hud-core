/**
 * Utility functions for Foundry VTT compatibility
 */

/**
 * Wrapper for Foundry's fromUuid function to ensure compatibility across versions
 * @param {string} uuid - The UUID to resolve
 * @returns {Promise<Document|null>} The document with the given UUID
 */
export async function fromUuid(uuid) {
    // In Foundry v12, fromUuid is a global function
    if (typeof globalThis.fromUuid === 'function') {
        return globalThis.fromUuid(uuid);
    }
    
    // In some versions, it might be under foundry.utils
    if (foundry?.utils?.fromUuid) {
        return foundry.utils.fromUuid(uuid);
    }
    
    // Fallback to the game.documents API
    return game.documents.fromUuid(uuid);
} 
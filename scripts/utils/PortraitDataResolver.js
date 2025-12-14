/**
 * Portrait Data Resolver
 * Utility for resolving actor data paths into displayable values
 * 
 * Supports multiple resolution formats:
 * - Direct paths: "system.attributes.ac.value"
 * - Template syntax: "{{path.to.value}}/{{path.to.max}}"
 * - Item by name: "itemName:Healing Potion:system.uses.value"
 * - Item by UUID: "itemUuid:UUID:system.uses.value"
 * - Flags: "flags.namespace.key"
 * - Literal values: "=15"
 */
export class PortraitDataResolver {
    /**
     * Resolve a path configuration to a display value
     * @param {Actor} actor - The actor to resolve data from
     * @param {Object} config - Configuration object
     * @param {string} config.path - The path expression to resolve
     * @param {string} [config.icon] - Font Awesome icon class
     * @param {string} [config.color] - CSS color value
     * @returns {Promise<{value: string|null, icon: string, color: string}>}
     */
    static async resolve(actor, config) {
        if (!actor || !config?.path) {
            return { value: null, icon: config?.icon || '', color: config?.color || '' };
        }

        const path = config.path.trim();
        let value = null;

        try {
            // Template mode: resolve {{...}} tokens
            if (path.includes('{{')) {
                value = await this._resolveTemplate(actor, path);
            }
            // Literal value: prefix with '=' to render as-is
            else if (path.startsWith('=')) {
                value = path.slice(1);
            }
            // Single token/path resolution
            else {
                value = await this._resolveToken(actor, path);
            }
        } catch (error) {
            console.warn('PortraitDataResolver | Failed to resolve path:', path, error);
        }

        // Convert to string, handle empty/null
        const displayValue = (value !== undefined && value !== null && value !== '')
            ? String(value)
            : null;

        return {
            value: displayValue,
            icon: config.icon || '',
            color: config.color || ''
        };
    }

    /**
     * Resolve template syntax with multiple {{tokens}}
     * @param {Actor} actor
     * @param {string} template
     * @returns {Promise<string|null>}
     * @private
     */
    static async _resolveTemplate(actor, template) {
        const tokenRegex = /\{\{([^}]+)\}\}/g;
        let result = template;
        let match;
        const resolvedValues = [];

        // Find all {{token}} expressions and resolve them
        const matches = [...template.matchAll(tokenRegex)];
        for (const m of matches) {
            const token = m[1].trim();
            const resolved = await this._resolveToken(actor, token);
            resolvedValues.push(resolved);
            result = result.replace(m[0], (resolved ?? '').toString());
        }

        // Trim stray separators if values are empty
        result = result.replace(/^[\s*/:|\\-]+/, '').replace(/[\s*/:|\\-]+$/, '');

        // If all resolved values are empty, return null
        const anyValue = resolvedValues.some(v => v !== undefined && v !== null && v !== '');
        return anyValue ? result : null;
    }

    /**
     * Resolve a single token/path to a value
     * @param {Actor} actor
     * @param {string} token
     * @returns {Promise<*>}
     * @private
     */
    static async _resolveToken(actor, token) {
        let value = null;

        // Item by name: itemName:Name:path
        if (token.startsWith('itemName:')) {
            value = await this._resolveItemByName(actor, token);
        }
        // Item by UUID: itemUuid:UUID:path
        else if (token.startsWith('itemUuid:')) {
            value = await this._resolveItemByUuid(actor, token);
        }

        // Try direct actor path
        if (value === undefined || value === null) {
            value = foundry.utils.getProperty(actor, token);
        }

        // Try system path
        if (value === undefined || value === null) {
            value = foundry.utils.getProperty(actor.system, token);
        }

        // Try system path with .value suffix
        if (value === undefined || value === null) {
            value = foundry.utils.getProperty(actor.system, `${token}.value`);
        }

        // Try flags.namespace.key format
        if ((value === undefined || value === null) && token.startsWith('flags.')) {
            value = this._resolveFlag(actor, token);
        }

        return value;
    }

    /**
     * Resolve item by name
     * Format: itemName:ItemName:path.to.property
     * @private
     */
    static async _resolveItemByName(actor, token) {
        const parts = token.split(':');
        parts.shift(); // Remove 'itemName'
        const itemName = parts.shift();
        const path = parts.join(':') || 'system.uses.value';

        const item = actor.items.find(it => (it.name || '').trim() === itemName?.trim());
        return item ? foundry.utils.getProperty(item, path) : null;
    }

    /**
     * Resolve item by UUID
     * Format: itemUuid:UUID:path.to.property
     * @private
     */
    static async _resolveItemByUuid(actor, token) {
        const parts = token.split(':');
        parts.shift(); // Remove 'itemUuid'
        const uuid = parts.shift();
        const path = parts.join(':') || 'system.uses.value';

        try {
            let item = await fromUuid(uuid);
            // Fallback: try as item ID within actor
            if (!item && uuid?.includes('.')) {
                item = actor.items.get(uuid.split('.').pop());
            }
            return item ? foundry.utils.getProperty(item, path) : null;
        } catch {
            return null;
        }
    }

    /**
     * Resolve actor flag
     * Format: flags.namespace.key
     * @private
     */
    static _resolveFlag(actor, token) {
        const parts = token.split('.');
        if (parts.length >= 3) {
            const namespace = parts[1];
            const flagKey = parts.slice(2).join('.');
            return actor.getFlag(namespace, flagKey);
        }
        return null;
    }
}

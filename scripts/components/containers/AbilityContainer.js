import { BG3Component } from '../BG3Component.js';

/**
 * Ability Container - Abstract Base Class
 * Displays character abilities (stats, skills, etc.)
 * 
 * System adapters should extend this class to provide:
 * - Ability scores (STR, DEX, etc.)
 * - Skills
 * - Roll logic
 * - Popover menus
 * 
 * @abstract
 */
export class AbilityContainer extends BG3Component {
    /**
     * Create a new ability panel
     * @param {Object} options - Panel configuration
     * @param {Actor} options.actor - The actor whose abilities to display
     * @param {Token} options.token - The token
     */
    constructor(options = {}) {
        super(options);
        this.actor = options.actor;
        this.token = options.token;
    }

    /**
     * Render the ability panel
     * Base implementation provides structure only
     * System adapters should override to add abilities
     * 
     * @returns {Promise<HTMLElement>}
     */
    async render() {
        // Create ability panel container
        this.element = this.createElement('div', ['bg3-ability-panel']);

        // System adapters will populate this with:
        // - Ability buttons (STR, DEX, CON, etc.)
        // - Skill popovers
        // - Roll handlers

        return this.element;
    }

    /**
     * Get abilities for the actor
     * Override in subclass to provide system-specific abilities
     * 
     * @abstract
     * @returns {Object}
     */
    getAbilities() {
        return {};
    }

    /**
     * Get skills for the actor
     * Override in subclass to provide system-specific skills
     * 
     * @abstract
     * @returns {Object}
     */
    getSkills() {
        return {};
    }

    /**
     * Roll an ability check
     * Override in subclass to implement system-specific roll logic
     * 
     * @abstract
     * @param {string} abilityKey - The ability to roll
     * @param {Object} options - Roll options
     */
    async rollAbility(abilityKey, options = {}) {
        console.warn('AbilityContainer.rollAbility() not implemented');
    }

    /**
     * Roll a skill check
     * Override in subclass to implement system-specific roll logic
     * 
     * @abstract
     * @param {string} skillKey - The skill to roll
     * @param {Object} options - Roll options
     */
    async rollSkill(skillKey, options = {}) {
        console.warn('AbilityContainer.rollSkill() not implemented');
    }
}

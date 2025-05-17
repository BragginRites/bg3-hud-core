
import { AbilityContainer } from '../components/containers/AbilityContainer.js';
import { RestTurnContainer } from '../components/containers/RestTurnContainer.js';
import { BG3CONFIG } from '../utils/config.js';

export class SystemManager {
    constructor() {
        AbilityContainer.prototype.getSaveMod = function(key) {
            let oMod = {},
                mod = 0,
                modString = '';
            switch (game.system.id) {
                case 'pf2e':
                    const save = ui.BG3HOTBAR.manager.actor.saves[key];
                    mod = save?.mod ?? 0;
                    modString = mod >= 0 ? `+${mod}` : mod.toString();
                    oMod = {value: modString, style: save?.proficient ?  'color: #3498db' : ''}
                    break;
                default:
                    const abilityScore = this.actor.system.abilities?.[key] || { value: 10, proficient: false, save: {value: 0} };
                    mod = abilityScore?.save?.value ?? abilityScore?.save ?? 0;
                    modString = mod >= 0 ? `+${mod}` : mod.toString();
                    oMod = {value: modString, style: abilityScore?.proficient === 1 ?  'color: #3498db' : ''  };
                    break;
            }
            return oMod;
        }
        AbilityContainer.prototype.getAbilityMod = function(key) {
            let oMod = {},
                mod = 0,
                modString = '';
            switch (game.system.id) {
                case 'pf2e':
                    break;
                default:
                    const abilityScore = this.actor.system.abilities?.[key] || { value: 10, proficient: false };
                    mod = abilityScore?.mod ?? 0;
                    modString = mod >= 0 ? `+${mod}` : mod.toString();
                    oMod = {value: modString, style: abilityScore?.proficient === 1 ?  'color: #3498db' : ''  };
                    break;
            }
            return oMod;
        };

        AbilityContainer.prototype.getMenuBtns = function() {
            let btns = {};
            switch (game.system.id) {
                case 'pf2e':
                    btns = (() => {
                        const btns = {};
                        for(const save in ui.BG3HOTBAR.manager.actor.saves) {
                            const saveMod = this.getSaveMod(save);
                            btns[save] = {
                                label: game.i18n.localize(CONFIG.PF2E.saves[save]),
                                class: 'ability-container',
                                ...saveMod,
                            }
                        }
                        for(const skill in ui.BG3HOTBAR.manager.actor.abilities) {

                        }
                        /* for(const skill in ui.BG3HOTBAR.manager.actor.skills) {
                            const skillMod = this.getSaveMod(skill);
                            btns[skill] = {
                                label: game.i18n.localize(CONFIG.PF2E.skills[skill].label),
                                class: 'ability-container',
                                ...skillMod,
                            }
                        } */
                        return btns;
                    })();
                    break;
                default:
                    const saveRoll = (event) => {
                        event.stopPropagation();
                        const parent = event.target.closest('.ability-container');
                        try {
                            this.actor.rollSavingThrow({
                                ability: parent.dataset.key,
                                event: event,
                                advantage: event.altKey,
                                disadvantage: event.ctrlKey,
                                fastForward: event.shiftKey
                            });
                        } catch (error) {
                            ui.notifications.error(`Error rolling ${parent.dataset.key.toUpperCase()} save. See console for details.`);
                        }
                    };

                    const checkRoll = (event) => {
                        event.stopPropagation();
                        const parent = event.target.closest('.ability-container');
                        try {
                            ui.BG3HOTBAR.systemmanager.getMethod(this.actor, 'ability')({
                                ability: parent.dataset.key,
                                event: event,
                                advantage: event.altKey,
                                disadvantage: event.ctrlKey,
                                fastForward: event.shiftKey
                            });
                        } catch (error) {
                            ui.notifications.error(`Error rolling ${parent.dataset.key.toUpperCase()} save. See console for details.`);
                        }
                    };

                    btns = (() => {
                        const btns = {};
                        for(const abl in this.abilities) {
                            const abilityMod = this.getAbilityMod(abl);
                            btns[abl] = {
                                ...{
                                    label: this.abilities[abl].label,
                                    class: 'ability-container'
                                },
                                ...abilityMod,
                                subMenu: [
                                    {
                                        position: 'topright', name: 'saveMenu', event: 'click', 
                                        buttons: {
                                            [`check${abl.toUpperCase()}`]: {...{label: 'Check', icon: 'fas fa-dice-d20', click: checkRoll}, ...abilityMod},
                                            [`save${abl.toUpperCase()}`]: {...{label: 'Save', icon: 'fas fa-dice-d20', click: saveRoll}, ...this.getSaveMod(abl)}
                                        }
                                    },
                                    {
                                        position: 'topleft', name: 'skillMenu', event: 'click',
                                        buttons: this.getSkillMod(abl)
                                    }
                                ]
                            }
                        };
                        return btns;
                    })()
                    break;
            }
            return btns;
        };

        RestTurnContainer.prototype.getSystemBtnData = () => {
            const btnData = [];
            switch (game.system.id) {
                case 'pf2e':
                    if(ui.BG3HOTBAR.manager.actor) {
                        btnData.push(
                            {
                                type: 'div',
                                class: ["rest-turn-button"],
                                label: 'Rest for the Night',
                                icon: "fa-tent",
                                visible: () => !game.combat?.started,
                                events: {
                                    'click': () => game.pf2e.actions.restForTheNight({actors: this.actor})
                                }
                            }
                        );
                    }
                    break;
                default:
                    if(this.actor) {
                        btnData.push({
                            type: 'div',
                            class: ["rest-turn-button"],
                            label: 'Short Rest',
                            icon: "fa-campfire",
                            visible: () => !game.combat?.started,
                            events: {
                                'click': this.actor.shortRest.bind(this.actor)
                            }
                        },
                        {
                            type: 'div',
                            class: ["rest-turn-button"],
                            label: 'Long Rest',
                            icon: "fa-tent",
                            visible: () => !game.combat?.started,
                            events: {
                                'click': this.actor.longRest.bind(this.actor)
                            }
                        });
                    }
                    break;
            }
            return btnData;
        };
    }

    get system() {
        return game.system.id;
    }

    get config() {
        switch (this.system) {
            case "pf2e":
                return CONFIG.PF2E;
            default:
                return CONFIG.DND5E;
        }
    }

    get roll() {
        return null;
    }

    getMethod(...args) {
        const [parent, check, event, check2] = args;
        switch (this.system) {
            case "pf2e":
                switch (check) {
                    case 'rest':
                        return () => game.pf2e.actions.restForTheNight({actors: parent})
                    case 'initiative':
                        return parent.rollInitiative
                    case 'skill':
                        return () => parent.skills[check2].check.roll({event: event})
                    case 'save':
                        return () => parent.saves[check2].check.roll({event : event})
                    default:
                        return false;
                }
            default:
                switch (check) {
                    case 'rest':
                        return parent.shortRest.bind(parent)
                    case 'longrest':
                        return parent.longRest.bind(parent)
                    case 'initiative':
                        return parent.rollInitiativeDialog;
                    case 'skill':
                        const parent = event.target.closest('.ability-container');
                        return () => this.actor.rollSkill({
                            skill: parent.dataset.key,
                            event: event,
                            advantage: event.altKey,
                            disadvantage: event.ctrlKey,
                            fastForward: event.shiftKey
                        })
                    case 'ability':
                        return parent.rollAbilityCheck
                    case 'save':
                        return parent.rollSavingThrow
                    default:
                        return false;
                }
        }
    }
}
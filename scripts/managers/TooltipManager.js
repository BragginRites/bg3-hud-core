import { BG3CONFIG, patchFunc } from "../utils/config.js";

export class BG3TooltipManager {
    constructor() {
        this.savedEnrichers = {};
        this._saveEnrichers();
        this._init();
        // game.dnd5e.dataModels.ItemDataModel.ITEM_TOOLTIP_TEMPLATE = `modules/${BG3CONFIG.MODULE_NAME}/templates/tooltips/item-tooltip.hbs`;
    }

    get enrichers() {
        return CONFIG.TextEditor.enrichers ?? CONFIG.TextEditor
    }

    _init() {
        /*if(game.settings.get(BG3CONFIG.MODULE_NAME, 'showDamageRanges')) this._tooltipRangeDamage();
        
        // Add Tooltip to Activity
        game.dnd5e.dataModels.activity.BaseActivityData.ACTIVITY_TOOLTIP_TEMPLATE = `modules/${BG3CONFIG.MODULE_NAME}/templates/tooltips/activity-tooltip.hbs`;
        game.dnd5e.dataModels.activity.BaseActivityData.prototype.richTooltip = async function (enrichmentOptions={}) {
            return {
                content: await renderTemplate(
                this.constructor.ACTIVITY_TOOLTIP_TEMPLATE, await this.getCardData(enrichmentOptions)
                ),
                classes: ["dnd5e2", "dnd5e-tooltip", "item-tooltip"]
            };
        }    
        game.dnd5e.dataModels.activity.BaseActivityData.prototype.getDataParent = function (property) {
            return this[property] ?? this.parent?.parent[property] ?? this.parent[property];
        }        
        game.dnd5e.dataModels.activity.BaseActivityData.prototype.getCardData = async function ({ activity, ...enrichmentOptions }={}) {
            const { name, type, img } = this;
            const isIdentified = this.identified !== false || this.parent?.parent.identified !== false || this.parent.identified !== false;
            const context = {
                name, type, img,
                labels: foundry.utils.deepClone(this.getDataParent('labels')),
                config: CONFIG.DND5E,
                controlHints: game.settings.get("dnd5e", "controlHints"),
                description: {
                    value: await TextEditor.enrichHTML(this.description?.chatFlavor ?? "", {
                        rollData: this.getRollData(), relativeTo: this, ...enrichmentOptions
                    })
                },
                uses: (this.hasLimitedUses || this.parent?.parent.hasLimitedUses || this.parent.hasLimitedUses) && (game.user.isGM || this.parent?.parent.identified || this.parent.identified) ? this.getDataParent('uses') : null,
                materials: this.getDataParent('materials'),
                tags: this.labels?.components?.tags ?? this.parent?.parent?.labels?.components?.tags ?? this.parent.labels?.components?.tags,
                isSpell : this.getDataParent('isSpell'),
                parentType: this.parent?.parent.type ?? this.parent.type
            }
            if(context.isSpell && !context.labels.components) {
                context.labels.components = this.parent?.parent.labels.components ?? this.parent.labels.components;
            }
            if(context.labels?.damage?.length) {
                let textDamage = '';
                const rollData = (activity ?? this.parent).getRollData();
                for(let i = 0; i < context.labels.damage.length; i++) {
                    // [[/damage {{damage.formula}}{{#if damage.damageType}} type={{damage.damageType}}{{/if}}]]
                    textDamage += `[[/damage ${context.labels.damage[i].formula}${context.labels.damage[i].damageType ? ` type=${context.labels.damage[i].damageType}` : ''}]]`;
                    if(i < context.labels.damage.length - 1) textDamage += ' | ';
                }
                context.enrichDamage = {
                    value: await TextEditor.enrichHTML(textDamage ?? "", {
                        rollData, relativeTo: this.parent, ...enrichmentOptions
                    })
                }
            }
            context.properties = [];
            if ( game.user.isGM || isIdentified ) {
                context.properties.push(
                    ...Object.values((this.activationLabels ? this.activationLabels : (this.parent?.parent.labels?.activations?.[0] ? this.parent?.parent.labels?.activations?.[0] : this.parent.labels?.activations?.[0])) ?? {})
                );
            }
            context.properties = context.properties.filter(_ => _);
            context.hasProperties = context.tags?.length || context.properties.length;
            
            return context;
        }
        */
        // Add Tooltip to Macro
        Macro.MACRO_TOOLTIP_TEMPLATE = `modules/${BG3CONFIG.MODULE_NAME}/templates/tooltips/macro-tooltip.hbs`;
        Macro.prototype.richTooltip = async function (enrichmentOptions={}) {
            return {
                content: await renderTemplate(
                this.constructor.MACRO_TOOLTIP_TEMPLATE, await this.getCardData(enrichmentOptions)
                ),
                classes: ["dnd5e2", "dnd5e-tooltip", "item-tooltip"]
            };
        }
        Macro.prototype.getCardData = async function ({ activity, ...enrichmentOptions }={}) {
            const { name, type, img } = this;
            const context = {
                name, type, img,
                config: CONFIG.DND5E,
                controlHints: game.settings.get("dnd5e", "controlHints")
            }
            return context;
        }

        const oldDismiss = TooltipManager.prototype.dismissLockedTooltips;
        TooltipManager.prototype.dismissLockedTooltips = function() {
            if(!this.tooltip.classList.contains('bg3-tooltip')) oldDismiss.bind(this)();
        }
        
        function handle_mousedown(e){
            e.preventDefault();
            const tooltip = {};
            tooltip.pageX0 = e.pageX;
            tooltip.pageY0 = e.pageY;
            tooltip.elem = this;
            tooltip.offset0 = $(this).offset();
            tooltip.moved = false;
        
            function handle_dragging(e){
                e.preventDefault();
                var left = tooltip.offset0.left + (e.pageX - tooltip.pageX0);
                var top = tooltip.offset0.top + (e.pageY - tooltip.pageY0);
                if(!tooltip.moved) {
                    tooltip.elem.style.removeProperty('bottom');
                    tooltip.moved = true;
                }
                $(tooltip.elem)
                .offset({top: top, left: left});
            }
        
            function handle_mouseup(e){
                e.preventDefault();
                $(this)
                .off('mousemove', handle_dragging)
                .off('mouseup', handle_mouseup);
            }
        
            $(this)
            .on('mouseup', handle_mouseup)
            .on('mousemove', handle_dragging);
        }
        
        $('body').on('mousedown', '.locked-tooltip.bg3-tooltip', handle_mousedown);
    }

    _saveEnrichers() {
        const stringNames = [
            "attack", "award", "check", "concentration", "damage", "heal", "healing", "item", "save", "skill", "tool"
        ],
        pattern = new RegExp(`\\[\\[/(?<type>${stringNames.join("|")})(?<config> .*?)?]](?!])(?:{(?<label>[^}]+)})?`, "gi");
        const enricher = this.enrichers.find(e => e.pattern.toString() == pattern.toString());
        if(enricher) this.savedEnrichers.damage = enricher.enricher;
    }
    
    _tooltipRangeDamage() {        
        const stringNames = [
            "attack", "award", "check", "concentration", "damage", "heal", "healing", "item", "save", "skill", "tool"
        ],
        pattern = new RegExp(`\\[\\[/(?<type>${stringNames.join("|")})(?<config> .*?)?]](?!])(?:{(?<label>[^}]+)})?`, "gi"),
        damageEnricher = this.enrichers.find(e => e.pattern.toString() == pattern.toString());
        if(damageEnricher) {
            const prevEnricher = damageEnricher.enricher;
            damageEnricher.id = 'damageEnricher';
            damageEnricher.enricher = async function(match, options) {
                const formatted = await prevEnricher(match, options);
                let { type, config, label } = match.groups;
                if(['damage', 'heal', 'healing'].includes(type)) {
                    const rollLink = formatted.querySelector('.roll-link');
                    if(rollLink) {
                        const dataFormulas = formatted.dataset.formulas;
                        if(dataFormulas) {
                            const minRoll = Roll.create(dataFormulas).evaluate({ minimize: true }),
                                maxRoll = Roll.create(dataFormulas).evaluate({ maximize: true }),
                                textContent = `${Math.floor((await minRoll).total)}-${Math.ceil((await maxRoll).total)}`;
                            rollLink.innerHTML = rollLink.innerHTML.replace(dataFormulas, textContent)
                        }
                    }
                }
                return formatted;
            }
        }
    }

    _resetEnrichers(enrichers) {
        for(const enricher of enrichers) {
            if(this.savedEnrichers[enricher]) {
                const enr = this.enrichers.find(e => e.id == `${enricher}Enricher`);
                if(enr) enr.enricher = this.savedEnrichers[enricher];
            }
        }
    }
}
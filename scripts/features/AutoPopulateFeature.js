// Auto Populate Feature

import { BG3CONFIG, shouldEnforceSpellPreparation } from '../utils/config.js';
import { HotbarManager } from '../managers/HotbarManager.js';
import { AutoSort } from './AutoSort.js';

export class AutoPopulateFeature {
    static async populateUnlinkedToken(token, force = false) {
        if (!token?.actor) return;

        try {
            // Check if user has permission to modify this token
            if (!token.actor.canUserModify(game.user, "update")) {
                console.debug("BG3 Inspired Hotbar | User lacks permission to modify token actor");
                return;
            }

            // Create a temporary hotbar manager for this token
            const tempManager = new HotbarManager();
            tempManager.currentTokenId = token.id;
            await tempManager._loadTokenData();
            
            // Auto-populate combat container if setting on true
            if(!(!tempManager.containers.combat[0]?.items || Object.values(tempManager.containers.combat[0].items).length > 0)) {
                if((game.settings.get(BG3CONFIG.MODULE_NAME, 'autoPopulateCombatContainer') || force) && token.actor.type !== 'vehicle') {
                    if(force) tempManager.containers.combat[0].items = {};
                    await this._populateCommonActions(token.actor, tempManager);
                }
            }

            if(token.actor.type !== 'character' && ((!token.actorLink && (game.settings.get(BG3CONFIG.MODULE_NAME, 'autoPopulateUnlinkedTokens') || force)) || (token.actorLink && (game.settings.get(BG3CONFIG.MODULE_NAME, 'autoPopulateLinkedTokens') || force)))) {
                // Get settings for each container
                const container1Setting = game.settings.get(BG3CONFIG.MODULE_NAME, 'container1AutoPopulate');
                const container2Setting = game.settings.get(BG3CONFIG.MODULE_NAME, 'container2AutoPopulate');
                const container3Setting = game.settings.get(BG3CONFIG.MODULE_NAME, 'container3AutoPopulate');
      
                // Process each weapon & combat containers
                if(force) {
                    tempManager.containers.weapon[0].items = {};
                    tempManager.containers.weapon[1].items = {};
                    tempManager.containers.weapon[2].items = {};
                }
                await this._populateWeaponsToken(token.actor, tempManager);
    
                // Process each container
                if(force) {
                    tempManager.containers.hotbar[0].items = {};
                    tempManager.containers.hotbar[1].items = {};
                    tempManager.containers.hotbar[2].items = {};
                }
                await this._populateContainerWithSettings(token.actor, tempManager, 0, container1Setting);
                await this._populateContainerWithSettings(token.actor, tempManager, 1, container2Setting);
                await this._populateContainerWithSettings(token.actor, tempManager, 2, container3Setting);
            }

            // Save the changes only if we still have permission
            if (token.actor.canUserModify(game.user, "update")) await tempManager.persist();

        } catch (error) {
            console.error("BG3 Inspired Hotbar | Error auto-populating unlinked token hotbar:", error);
        }
    }

    static checkExtraConditions(item) {
      return true;
    }

    static checkPreparedSpell(item) {
        /* const prep = item.system?.preparation;
        // Skip if it's an unprepared "prepared" spell
        if (!prep?.prepared && prep?.mode === "prepared") return false;;
        // Include if it's prepared or has a valid casting mode
        if (!prep?.prepared && !["pact", "apothecary", "atwill", "innate", "ritual", "always"].includes(prep?.mode)) return false; */
        return true;
    }

    static getItemsList(actor, itemTypes, prepared) {
        return actor.items.filter(i => itemTypes.includes(i.type));
    }

    static constructItemData(item) {
        return {uuid: item.uuid}
    }

    static async _populateContainerWithSettings(actor, manager, containerIndex, itemTypes) {
        if (!actor?.items || !manager?.containers?.hotbar || !itemTypes?.length) return;
        
        const container = manager.containers.hotbar[containerIndex];
        if (!container) return;

        try {
            // Get all items from the actor that match the selected types
            const itemsWithActivities = [];

            const itemList = AutoPopulateFeature.getItemsList(actor, itemTypes, shouldEnforceSpellPreparation(actor, manager.currentTokenId));
            // Process all items from the actor
            for (const item of itemList) {
                // Skip if item type is not in the selected types
                // if (!itemTypes.includes(item.type)
                //     || Object.values(manager.containers.combat[0].items).find(d => d.uuid === item.uuid)
                //     || manager.containers.weapon.reduce((acc, curr) => acc.concat(Object.values(curr.items)), []).find(i => i.uuid === item.uuid)
                // ) continue;
                
                // For spells, check preparation state unless bypassed by setting
                /* if (item.type === "spell") {
                    const enforcePreparation = shouldEnforceSpellPreparation(actor, manager.currentTokenId);
                        
                    if (enforcePreparation && !AutoPopulateFeature.checkPreparedSpell(item)) continue;
                } */
                
                // Check if the item has activities or is usable
                const hasActivities = this.checkExtraConditions(item);
                
                if (hasActivities || game.settings.get(BG3CONFIG.MODULE_NAME, 'noActivityAutoPopulate')) {
                    const itemData = AutoPopulateFeature.constructItemData(item);

                    itemsWithActivities.push(itemData);
                }
            }
            
            if (itemsWithActivities.length === 0) {
                ui.notifications.warn("No items found matching the selected criteria.");
                return;
            }

            // Sort items
            AutoSort._sortItems(itemsWithActivities);
            
            // Get existing UUIDs to prevent duplicates
            const existingUuids = AutoPopulateFeature._getExistingUuids();
            
            // Filter out items that already exist in the hotbar
            const newItems = itemsWithActivities.filter(item => !existingUuids.has(item.uuid));
            
            if (newItems.length === 0) {
                ui.notifications.warn("All matching items are already in the hotbar.");
                return;
            }

            // Place items in grid format (rows first: left to right, then down)
            let x = 0;
            let y = 0;

            for (const item of newItems) {
                if (y >= container.rows) break; // Stop if we exceed container rows

                const gridKey = `${x}-${y}`;
                container.items[gridKey] = item;
                // container.data.items[gridKey] = item;

                // Move right first, then down (rows first)
                x++;
                if (x >= container.cols) {
                    x = 0;
                    y++;
                }
            }

            if (newItems.length > 0) ui.notifications.info(`Added ${newItems.length} items to the hotbar.`);
            else ui.notifications.warn("No items could be added to the hotbar.");
            
        } catch (error) {
            console.error("BG3 Inspired Hotbar | Error auto-populating container:", error);
        }
    }

    static async _populateWeaponsToken(actor, manager) {
      if (!actor?.items || !manager?.containers?.weapon) return;

      try {
        // Process each container
        let weaponsList = actor.items.filter(w => w.type == 'weapon'),
          toUpdate = [];
        if(weaponsList.length) {
          for(let i = 0; i < weaponsList.length; i++) {
            const gridKey = `0-0`,
              item = weaponsList[i];
            if(i < 3) {
              manager.containers.weapon[i].items = {};
              const itemData = {uuid: item.uuid};
              manager.containers.weapon[i].items[gridKey] = itemData;
            }
            if((i === 0 && !item.system.equipped) || (i > 0 && item.system.equipped)) toUpdate.push({_id: item.uuid.split('.').pop(), "system.equipped": (i === 0 ? 1 : 0)})
          }
          actor.updateEmbeddedDocuments("Item", toUpdate);
        }     
      } catch (error) {
          console.error("BG3 Inspired Hotbar | Error auto-populating weapons token hotbar:", error);
      }
    }

    static async _getCombatActionsList(actor) {
        let ids = [];
        if(game.modules.get("chris-premades")?.active && game.packs.get("chris-premades.CPRActions")?.index?.size) {
            const pack = game.packs.get("chris-premades.CPRActions"),
                promises = [];
            for(const id of game.settings.get(BG3CONFIG.MODULE_NAME, 'choosenCPRActions')) {
                const item = actor.items.find(i => i.system.identifier === pack.index.get(id)?.system?.identifier);
                if(item) ids.push(item.uuid);
                else {
                    const cprItem = pack.index.get(id);
                    if(cprItem) {
                        promises.push(new Promise(async (resolve, reject) => {
                            let item = await pack.getDocument(cprItem._id);
                            resolve(item);
                        }))
                    }
                }
            }
            if(promises.length) {
                await Promise.all(promises).then(async (values) => {
                    let tmpDoc = await actor.createEmbeddedDocuments('Item', values);
                    ids = tmpDoc.map(i => i.uuid);
                })
            }
        } else {
            const compendium = await game.packs.get("bg3-inspired-hotbar.bg3-inspired-hud");
            if(!compendium) return ids;
            ids = compendium.folders.find(f => f.name === 'Common Actions').contents.map(m => m.uuid);
        }
        return ids;
    }

    static async _populateCommonActions(actor, manager) {
        if(actor.type == 'vehicule') return;
        try {
            const ids = await this._getCombatActionsList(actor);
            let count = 0;
            console.log(ids)
            for(let i = 0; i < 3; i++) {
                for(let j = 0; j < 3; j++) {
                    if(ids[count]) manager.containers.combat[0].items[`${i}-${j}`] = $.isPlainObject(ids[count]) ? ids[count] : {uuid: ids[count]};
                    count++;
                }
            }
        } catch (error) {
            console.error("BG3 Inspired Hotbar | Error auto-populating common actions token hotbar:", error);
        }
    }

    static _getExistingUuids() {
        const existingUuids = new Set();
        if (!ui.BG3HOTBAR?.components?.container?.components?.hotbar) return existingUuids;
        
        for (const gridContainer of ui.BG3HOTBAR.components.container.components.hotbar) {
        for (const slotKey in gridContainer.data.items) {
            const item = gridContainer.data.items[slotKey];
            if (item && item.uuid) {
            existingUuids.add(item.uuid);
            }
        }
        }
        return existingUuids;
    }
}

export class AutoPopulateSettings extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "bg3-hotbar-auto-populate-defaults",
            title: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.DefaultsTitle"),
            template: `modules/${BG3CONFIG.MODULE_NAME}/templates/dialog/auto-populate-defaults.html`,
            width: 800,
            height: "auto",
            closeOnSubmit: true,
            submitOnClose: false
        });
    }

    getData() {
        // Get current settings for each container
        const containerSettings = {
            container1: game.settings.get(BG3CONFIG.MODULE_NAME, 'container1AutoPopulate'),
            container2: game.settings.get(BG3CONFIG.MODULE_NAME, 'container2AutoPopulate'),
            container3: game.settings.get(BG3CONFIG.MODULE_NAME, 'container3AutoPopulate'),
            allowPassive: game.settings.get(BG3CONFIG.MODULE_NAME, 'noActivityAutoPopulate')
        };

        // Register the includes helper if it doesn't exist
        if (!Handlebars.helpers.includes) {
            Handlebars.registerHelper('includes', function(array, value) {
                return array?.includes(value) ?? false;
            });
        }

        return {
            containerSettings,
            choices: BG3CONFIG.ITEM_TYPES
        };
    }

    async _updateObject(event, formData) {
        try {
            // Update all container settings
            const containers = ['container1', 'container2', 'container3'];
            for (const container of containers) {
                const selectedTypes = Array.from(this.element[0].querySelectorAll(`.container-chips[data-container="${container}"] .chip.active`))
                    .map(chip => chip.dataset.value);
                
                await game.settings.set(BG3CONFIG.MODULE_NAME, `${container}AutoPopulate`, selectedTypes);
            }
            await game.settings.set(BG3CONFIG.MODULE_NAME, `noActivityAutoPopulate`, this.element[0].querySelector("#passive-populate-checkbox").checked);
            ui.notifications.info(game.i18n.localize("BG3.Settings.ContainerAutoPopulate.SaveSuccess"));
        } catch (error) {
            console.error("Error saving container settings:", error);
            ui.notifications.error("Error saving container settings");
        }
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Handle chip clicks
        html.find('.chip').on('click', event => {
            event.preventDefault();
            const chip = event.currentTarget;
            chip.classList.toggle('active');
        });
    }
}


export class AutoPopulateDialog extends Dialog {
    constructor(container) {
        const dialogData = {
            title: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.DialogTitle"),
            content: "",
            buttons: {
            submit: {
                icon: '<i class="fas fa-save"></i>',
                label: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Populate"),
                callback: async (html) => {
                const selectedTypes = Array.from(html.find('.chip.active')).map(chip => chip.dataset.value);
                
                if (selectedTypes.length === 0) {
                    ui.notifications.warn("Please select at least one item type to populate.");
                    return;
                }
    
                try {
                    ui.notifications.info("Populating container...");
                    await AutoPopulateFeature._populateContainerWithSettings(this.actor, ui.BG3HOTBAR.manager, container.index, selectedTypes);
                    ui.BG3HOTBAR.manager.persist();
                    container.render();
                    ui.notifications.info("Container populated successfully.");
                } catch (error) {
                    console.error("Error populating container:", error);
                    ui.notifications.error("Failed to populate container. See console for details.");
                }
                }
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize("BG3.Settings.ContainerAutoPopulate.Cancel")
            }
            },
            default: "submit"
        };
    
        const options = {
            classes: ["bg3-hotbar-dialog", "auto-populate-dialog"],
            width: 800,
            height: "auto",
            jQuery: true,
            template: `modules/${BG3CONFIG.MODULE_NAME}/templates/dialog/auto-populate-container.html`
        };

        super(dialogData, options);
        this.actor = ui.BG3HOTBAR.manager.actor;
        this.container = container;
    }

    getData(options={}) {
        const data = super.getData(options);
        data.containerSettings = game.settings.get(BG3CONFIG.MODULE_NAME, `container${this.container.index + 1}AutoPopulate`);
        data.itemTypes = BG3CONFIG.ITEM_TYPES;
        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        // Handle chip clicks
        html.find('.chip').on('click', function() {
            $(this).toggleClass('active');
        });
    }
}
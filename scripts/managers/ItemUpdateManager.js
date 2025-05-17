import { BG3CONFIG } from "../utils/config.js";
import { fromUuid } from "../utils/foundryUtils.js";

export class ItemUpdateManager {
    constructor() {
        this._registerHooks();
    }

    _registerHooks() {
        // Item updates
        Hooks.on("updateItem", this._handleItemUpdate.bind(this));
        
        // Item creation
        Hooks.on("createItem", this._handleItemCreate.bind(this));
        
        // Item deletion
        Hooks.on("deleteItem", this._handleItemDelete.bind(this));
    }

    /**
     * Find the next available slot in a container
     * @param {Object} container - The container to search
     * @returns {string|null} - The slot key (e.g., "0-0") or null if no slots available
     */
    _findNextAvailableSlot(container) {
        const rows = container.data.rows;
        const cols = container.data.cols;
        
        // Check each position in the container
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const slotKey = `${col}-${row}`;
                if (!container.data.items[slotKey]) {
                    return slotKey;
                }
            }
        }
        return null;
    }
    
    async retrieveNewItem(data, cell) {
        return [{uuid: data.uuid}, true];
    }
    
    /**
     * Find the appropriate container for an item based on its type
     * @param {Item} item - The item to place
     * @returns {number} - The index of the container (0, 1, or 2)
     */
    _findAppropriateContainer(item) {
        // Get container auto-populate settings
        const container1Types = game.settings.get(BG3CONFIG.MODULE_NAME, 'container1AutoPopulate');
        const container2Types = game.settings.get(BG3CONFIG.MODULE_NAME, 'container2AutoPopulate');
        const container3Types = game.settings.get(BG3CONFIG.MODULE_NAME, 'container3AutoPopulate');

        // Check each container's preferred types
        if (container1Types.includes(item.type)) return 0;
        if (container2Types.includes(item.type)) return 1;
        if (container3Types.includes(item.type)) return 2;

        // If no preference found, return the first container with space
        for (let i = 0; i < ui.BG3HOTBAR.components.container.length; i++) {
            if (this._findNextAvailableSlot(ui.BG3HOTBAR.components.container.components.hotbar[i])) {
                return i;
            }
        }

        // Default to first container if all else fails
        return 0;
    }
    
    async _handleItemUpdate(item, changes, options, userId) {
        
        const token = ui.BG3HOTBAR.manager.token;
        if (!token || token.actor?.items.get(item.id) !== item) return;
        let needSave = false;
        
        // Check if this is a spell and its preparation state changed
        if (item.type === "spell" && changes.system?.preparation !== undefined) {
            const prep = item.system.preparation;
            // Remove if unprepared and not at-will/innate/etc
            if (!prep.prepared && prep.mode === "prepared") {
                for (const container of ui.BG3HOTBAR.components.container.components.hotbar) {
                    let removed = false;
                    for (const [slotKey, slotItem] of Object.entries(container.data.items)) {
                        const itemId = slotItem?.uuid?.split('.').pop();
                        if (itemId === item.id) {
                            delete container.data.items[slotKey];
                            removed = true;
                            needSave = true;
                        }
                    }
                    if(removed) container.render();
                }
                for (const container of ui.BG3HOTBAR.components.weapon.components.weapon) {
                    let removed = false;
                    for (const [slotKey, slotItem] of Object.entries(container.data.items)) {
                        const itemId = slotItem?.uuid?.split('.').pop();
                        if (itemId === item.id) {
                            delete container.data.items[slotKey];
                            removed = true;
                            needSave = true;
                        }
                    }
                    if(removed) container.render();
                }
                await ui.BG3HOTBAR.manager.persist();
                return;
            }
            // Add if newly prepared or has other valid casting mode
            else if (prep.prepared || ["pact", "apothecary", "atwill", "innate"].includes(prep.mode)) {
                // Check if it's already in any container
                let exists = false;
                for (const container of ui.BG3HOTBAR.components.container.components.hotbar) {
                    if (Object.values(container.data.items).some(i => i && i.uuid === item.uuid)) {
                        exists = true;
                        break;
                    }
                }

                if (!exists) {
                    // Find the appropriate container (likely container 2 for spells)
                    const containerIndex = this._findAppropriateContainer(item);
                    const container = ui.BG3HOTBAR.components.container.components.hotbar[containerIndex];
                    
                    // Find an available slot
                    const slotKey = this._findNextAvailableSlot(container);
                    
                    if (slotKey) {
                        // Add the spell to the hotbar
                        container.data.items[slotKey] = {
                            uuid: item.uuid,
                            // name: item.name,
                            // icon: item.img,
                            // type: item.type,
                            // activation: item.system.activation?.type || "action",
                            // sortData: {
                            //     spellLevel: item.system.level,
                            //     featureType: ""
                            // }
                        };
                        
                        container.render();
                        needSave = true;
                        ui.notifications.info(`Added ${item.name} to hotbar as it is now prepared.`);
                        return;
                    }
                }
            }
        }
        
        // Find and update the item in all containers
        for (const container of ui.BG3HOTBAR.components.container.components.hotbar) {
            let updated = false;
            for (const [slotKey, slotItem] of Object.entries(container.data.items)) {
                // Extract the item ID from the UUID
                const itemId = slotItem?.uuid?.split('.').pop();
                
                if (slotItem && itemId === item.id) {
                    // Get the latest item data
                    const updatedItemData = await fromUuid(slotItem.uuid);
                    if (!updatedItemData) continue;

                    // For spells, check if it's prepared or has valid casting mode
                    if (updatedItemData.type === "spell") {
                        const prep = updatedItemData.system?.preparation;
                        if (!prep?.prepared && prep?.mode === "prepared") {
                            delete container.data.items[slotKey];
                            updated = true;
                            needSave = true;
                            continue;
                        }
                    }

                    // Update all properties from the source item
                    container.data.items[slotKey] = {
                        uuid: slotItem.uuid,
                        // name: updatedItemData.name,
                        // icon: updatedItemData.img,
                        // type: updatedItemData.type,
                        // activation: updatedItemData.system?.activation?.type,
                        // sortData: slotItem.sortData // Preserve sort data
                    };
                    updated = true;
                    needSave = true;
                }
            }
            if(updated) container.render();
        }        
            
        // Find and update the item in all weapons containers
        for (const container of ui.BG3HOTBAR.components.weapon.components.weapon) {
            let updated = false;
            for (const [slotKey, slotItem] of Object.entries(container.data.items)) {
                // Extract the item ID from the UUID
                const itemId = slotItem?.uuid?.split('.').pop();
                
                if (slotItem && itemId === item.id) {
                    // Get the latest item data
                    const updatedItemData = await fromUuid(slotItem.uuid);
                    if (!updatedItemData) continue;

                    // For spells, check if it's prepared or has valid casting mode
                    if (updatedItemData.type === "spell") {
                        const prep = updatedItemData.system?.preparation;
                        if (!prep?.prepared && prep?.mode === "prepared") {
                            delete container.data.items[slotKey];
                            updated = true;
                            needSave = true;
                            continue;
                        }
                    }

                    // Update all properties from the source item
                    /* container.data.items[slotKey] = {
                        uuid: slotItem.uuid
                        // name: updatedItemData.name,
                        // icon: updatedItemData.img,
                        // type: updatedItemData.type,
                        // activation: updatedItemData.system?.activation?.type,
                        // sortData: slotItem.sortData // Preserve sort data
                    }; */
                    updated = true;
                    needSave = true;
                }
            }
            if(updated) container.render();
        }
        
        if (needSave) {
            // Save the changes
            await ui.BG3HOTBAR.manager.persist();
            await ui.BG3HOTBAR.components.container.components.filterContainer.updateExtendedFilter();
        }
    }
    
    async _handleItemCreate(item, options, userId) {
        if (!ui.BG3HOTBAR.manager || game.user.id !== userId) return;
        
        const token = ui.BG3HOTBAR.manager.token;
        if (!token) return;

        // Check if the created item is on the actor's sheet
        if (token.actor?.items.get(item.id) !== item) return;

        // Check if not already in combat container
        if(Object.values(ui.BG3HOTBAR.manager.containers.combat[0].items).find(d => d.uuid === item.uuid)) return;
        
        // Determine if the item should be added to the hotbar
        // Check for activation type or other activity indicators
        if (item.system?.activation?.type) {
            // Check if the item already exists in any container
            let exists = false;
            for (const container of ui.BG3HOTBAR.components.container.components.hotbar) {
                if (Object.values(container.data.items).some(i => i && i.uuid === item.uuid)) {
                    exists = true;
                    break;
                }
            }

            if (!exists) {
                // Find the appropriate container for this item type
                const containerIndex = this._findAppropriateContainer(item);
                const container = ui.BG3HOTBAR.components.container.components.hotbar[containerIndex];
                
                // Find an available slot
                const slotKey = this._findNextAvailableSlot(container);
                
                if (slotKey) {
                    // Add the item to the hotbar
                    container.data.items[slotKey] = {
                        uuid: item.uuid,
                        // name: item.name,
                        // icon: item.img,
                        // type: item.type,
                        // activation: item.system.activation.type,
                        // sortData: {
                        //     spellLevel: item.type === "spell" ? item.system.level : 99,
                        //     featureType: item.type === "feat" ? item.system.type?.value || "" : ""
                        // }
                    };

                    container.render();
                    
                    // Save changes
                    await ui.BG3HOTBAR.manager.persist();
                    
                    // Notify the user
                    ui.notifications.info(`Added ${item.name} to hotbar container ${containerIndex + 1}`);
                } else {
                    ui.notifications.warn(`No available slots in container ${containerIndex + 1} for ${item.name}`);
                }
            }
        }
    }

    async _handleItemDelete(item, options, userId) {
        if (!ui.BG3HOTBAR.manager || game.user.id !== userId) return;
        
        const token = ui.BG3HOTBAR.manager.token;;
        if (!token) return;
        
        // Clean up invalid items and re-render
        await this.cleanupInvalidItems(token.actor);
    }
    
    async cleanupInvalidItems(actor) {
        
        // Check each container's items
        for (const container of ui.BG3HOTBAR.components.container.components.hotbar) {
            let hasChanges = false;
            for (const [slot, item] of Object.entries(container.data.items)) {
                if(!item?.uuid) continue;
                const itemData = await fromUuid(item.uuid);
                if(itemData?.documentName == 'Macro' || itemData?.documentName == 'Activity') continue;
                
                if (!itemData || !actor.items.has(itemData.id)) {
                    // Removing invalid item
                    delete container.data.items[slot];
                    hasChanges = true;
                }
            }
            if(hasChanges) container.render();
        }
            
        // Check each weapons container's items
        for (const container of ui.BG3HOTBAR.components.weapon.components.weapon) {
            let hasChanges = false;
            for (const [slot, item] of Object.entries(container.data.items)) {
                const itemData = await fromUuid(item.uuid);
                if(itemData?.documentName == 'Macro' || itemData?.documentName == 'Activity') continue;
                
                if (!itemData || !actor.items.has(itemData.id)) {
                    // Removing invalid item
                    delete container.data.items[slot];
                    hasChanges = true;
                }
            }
            if(hasChanges) {
                container.render();
                await ui.BG3HOTBAR.manager.persist();
            }
        }
    }
}
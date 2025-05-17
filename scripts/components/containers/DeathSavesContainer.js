import { BG3CONFIG } from "../../utils/config.js";
import { BG3Component } from "../component.js";

export class DeathSavesContainer extends BG3Component {
    constructor(data) {
        super(data);
        
        this.lastHpValue = null;  // Track HP changes
        
        this.stabilizationTimer = null;  // Add timer reference
        this.isStabilizing = false;      // Add stabilization state

        // this.datas = this.setDatas();
    }

    get classes() {
        return [...["bg3-death-saves-container"], ...(game.settings.get(BG3CONFIG.MODULE_NAME, 'showDeathSavingThrow') === 'only' ? ['death-only-skull'] : [])]
    }

    /* setDatas() {
        return {data1: null, data2: null}
    } */

    getData() {
        return {display: false};
        // return {display: game.settings.get(BG3CONFIG.MODULE_NAME, 'showDeathSavingThrow'), success: this.actor.system.attributes.death.success || 0, failure: this.actor.system.attributes.death.failure || 0};
    }

    isVisible() {
        return true;
    }

    get visible() {
        return this.isVisible();
        /* if (!this.actor || this.actor.type !== 'character' || game.settings.get(BG3CONFIG.MODULE_NAME, 'showDeathSavingThrow') === 'hide') return false;
        // Get current HP and death saves state
        const currentHP = this.actor.system.attributes?.hp?.value || 0;

        return currentHP <= 0 */
    }

    async skullClick(event) {
        event.preventDefault();
        event.stopPropagation();
        return null;
    }

    async _registerEvents() {
        this.element.querySelector('.death-saves-skull').addEventListener('click', this.skullClick.bind(this));
        /* this.element.querySelector('.death-saves-skull').addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            // Get current death save count before the roll
            const currentSuccesses = this.actor.system.attributes.death.success || 0;

            try {
                // Determine roll mode based on modifiers
                let rollMode = "roll";
                if (event.altKey) rollMode = "advantage";
                if (event.ctrlKey) rollMode = "disadvantage";
                if (event.shiftKey) rollMode = "gmroll";

                // Roll the death save with the appropriate mode
                const roll = await this.actor.rollDeathSave({
                    event: event,  // Pass the original event
                    advantage: event.altKey,
                    disadvantage: event.ctrlKey,
                    fastForward: event.shiftKey
                });
                
                if(!roll) return;
                this.setVisibility();
            } catch (error) {
                console.error("Error during death save roll:", error);
            }
        }); */

        this.element.querySelector('.death-saves-skull').addEventListener('contextmenu', async (event) => {
            event.preventDefault();
            event.stopPropagation();
                
            if (!this.actor || this.actor.type !== 'character') return;

            // Reset both successes and failures to 0
            if(this.getData().data1?.update) await this.getData().data1.update(0);
            if(this.getData().data2?.update) await this.getData().data2.update(0);
            // await this.actor.update({
            //     [this.datas.data1]: 0,
            //     [this.datas.data2]: 0
            // });

            // Update the UI
            const successBoxes = this.element.querySelectorAll('.death-save-box.success');
            const failureBoxes = this.element.querySelectorAll('.death-save-box.failure');

            // Unmark all boxes
            successBoxes.forEach(box => box.classList.remove('marked'));
            failureBoxes.forEach(box => box.classList.remove('marked'));
        });

        this.element.querySelectorAll('.death-save-box.success').forEach((s) => s.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                if (!this.actor || this.actor.type !== 'character') return;

                // Get all success boxes
                const successBoxes = [...this.element.querySelectorAll('.death-save-box.success')];
                const clickedIndex = successBoxes.indexOf(event.currentTarget);

                // Update all boxes based on clicked position
                successBoxes.forEach((box, index) => {
                    // Mark boxes from the bottom up to the clicked box, unmark the rest
                    box.classList.toggle('marked', index >= clickedIndex);
                });

                // Update the actor with the number of successes (3 - clicked index)
                if(this.getData().data1?.update) await this.getData().data1.update(this.getData().data1.max - clickedIndex);
            })
        );

        this.element.querySelectorAll('.death-save-box.failure').forEach((s) => s.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                if (!this.actor || this.actor.type !== 'character') return;

                // Get all failure boxes
                const failureBoxes = [...this.element.querySelectorAll('.death-save-box.failure')];
                const clickedIndex = failureBoxes.indexOf(event.currentTarget);

                // Update all boxes based on clicked position
                failureBoxes.forEach((box, index) => {
                    // Mark boxes from the top up to the clicked box, unmark the rest
                    box.classList.toggle('marked', index <= clickedIndex);
                });

                // Update the actor with the number of failures (clicked index + 1)
                if(this.getData().data2?.update) await this.getData().data2.update(clickedIndex + 1);
            })
        );
    }
}
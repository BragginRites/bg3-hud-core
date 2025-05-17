import { BG3Component } from "../component.js";


export class PassiveButton extends BG3Component {
    constructor(data) {
        super(data);
    }

    get classes() {
        return ['passive-feature-icon'];
    } 

    get dataTooltip() {
        return {type: 'advanced'};
    }

    async getData() {
        return this.data.item;
    }

    async _registerEvents() {
        this.element.addEventListener("click", async () => {
            if(this.data.item.use) await this.data.item.use();
        });
    }

    async render() {
        await super.render();
        this.element.dataset.uuid = this.data.item.uuid;
        return this.element;
    }
}
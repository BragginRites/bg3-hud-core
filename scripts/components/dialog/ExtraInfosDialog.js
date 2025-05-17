import { BG3CONFIG } from "../../utils/config.js";

export class ExtraInfosDialog extends FormApplication {
    constructor () {
        super();
    }

    static get defaultOptions() {
        return {
            ...super.defaultOptions,
            title: 'Portrait extra datas settings',
            id: "bg3-inspired-hotbar-extradatas-settings",
            template: `modules/bg3-inspired-hotbar/templates/dialog/extra-infos-dialog.hbs`,
            height: "auto",
            submitOnClose: false
        };
    }

    getData() {
        let listAttr = TokenDocument.implementation.getTrackedAttributes();
        listAttr.bar.forEach(a => a.push("value"));
        const listAttrChoices = TokenDocument.implementation.getTrackedAttributeChoices(listAttr);
        return {extraInfos: game.settings.get(BG3CONFIG.MODULE_NAME, "dataExtraInfo"), listAttrChoices};
    }

    activateListeners(html) {
        super.activateListeners(html);
        html[0].querySelectorAll(".list-attr").forEach((select) => {
            select.addEventListener("change", (event) => {
                const value = event.target.value;
                const inputAttr = event.target.closest(".form-group").querySelector(".attr");
                inputAttr.value = value;
            });
        });
    }

    async _onSubmit(event) {
        event.preventDefault();
        let data = [];
        const form = this.element[0].querySelectorAll('div.container-section');
        for (let i = 0; i < form.length; i++) {
            const attr = form[i].querySelector(".attr").value;
            const icon = form[i].querySelector(".icon").value;
            const color = form[i].querySelector(".color").value;
            const pos = form[i].querySelector(".notes").innerHTML;
            data.push({attr, icon, color, pos})
        }
        await game.settings.set(BG3CONFIG.MODULE_NAME, "dataExtraInfo", data);
        this.close();
    }
}
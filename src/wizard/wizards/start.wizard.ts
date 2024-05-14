import { Unit } from "src/unit/unit";
import { ServiceProfivder } from "../services.provider";
import { UnitWizard } from "./unit-wizard";
import { WizardStep } from "./wizard";
import { WizBtn } from "./wizard-buttons";
import { AccountWizard } from "./account.wizard";
import { TradesWizard } from "./trades.wizard";
import { BotUtil } from "../bot.util";
import { AdminWizard } from "./admin.wizard";

export class StartWizard extends UnitWizard {

    constructor(unit: Unit, services: ServiceProfivder) {
        super(unit, services)
    }

    public getSteps(): WizardStep[] {

        const stepZero: WizardStep = {
            order: 0,
            message: ['Actions:'],
            buttons: [[{
                text: 'Subscription management',
                callback_data: WizBtn.amount,
                switch: AccountWizard.name
            }], [{
                text: 'Trades management',
                callback_data: WizBtn.trade,
                switch: TradesWizard.name
            }]]
        }

        if (BotUtil.isAdmin(this.unit?.telegramChannelId)) {
            stepZero.buttons.push([{
                text: 'ADMIN',
                callback_data: WizBtn.admin,
                switch: AdminWizard.name
            }])
        }
        return [ stepZero ]
    }

}
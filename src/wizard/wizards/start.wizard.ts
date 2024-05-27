import { Unit } from "src/unit/unit";
import { ServiceProvider } from "../services.provider";
import { UnitWizard } from "./unit-wizard";
import { WizardStep } from "./wizard";
import { WizBtn } from "./wizard-buttons";
import { AccountWizard } from "./account.wizard";
import { TradesWizard } from "./trades.wizard";
import { AdminWizard } from "./admin.wizard";

export class StartWizard extends UnitWizard {

    constructor(unit: Unit, services: ServiceProvider) {
        super(unit, services)
    }


    public getSteps(): WizardStep[] {

        const stepZero: WizardStep = {
            order: 0,
            message: [`Hi, ${this.unit?.identifier}`],
            buttons: [[{
                text: 'Account',
                callback_data: WizBtn.amount,
                switch: AccountWizard.name
            }], [{
                text: 'Trades & orders',
                callback_data: WizBtn.trade,
                switch: TradesWizard.name
            }]],
        }

        if (this.isAdmin(this.unit?.telegramChannelId)) {
            stepZero.buttons.push([{
                text: 'ADMIN',
                callback_data: WizBtn.admin,
                switch: AdminWizard.name
            }])
        }
        return [ stepZero ]
    }

}
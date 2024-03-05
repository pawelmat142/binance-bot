import { Unit } from "src/unit/unit";
import { ServicesService } from "../services.service";
import { Wizard, WizardStep } from "../wizard";
import { AmountWizard } from "./amount.wizard";
import { BotUtil } from "../bot.util";

export class UnitWizard extends Wizard {

    private unit: Unit

    constructor(unit: Unit, services: ServicesService) {
        super(Number(unit.telegramChannelId), services)
        this.unit = unit
    }

    public getSteps(): WizardStep[] {
        return [{
            order: 0,
            message: [
                `Prompts: `,
                this.getActivateLine(),
                `amount - to manage USDT`,
                this.defaultStopPrompt
            ],
            process: async (input: string) => {
                if (this.unit.active && input === 'deactivate') {
                    const result = await this.services.unitService.activation(this.unit.identifier, false)
                    return !!result ? 1 : 0
                }
                if (!this.unit.active && input === 'activate') {
                    const result = await this.services.unitService.activation(this.unit.identifier, true)
                    return !!result ? 2  : 0
                }
                if (input === 'amount') {
                    return BotUtil.switchResponse(AmountWizard.name)
                }
                return 0
            }
        }, {
            order: 1,
            close: true,
            message: [` Subscription deactivated`]
        }, {
            order: 2,
            close: true,
            message: [` Subscription activated`]
        }]
    }

    private getActivateLine(): string {
        if (this.unit?.active) {
            return `deactivate - to deactivate subscription`
        } else {
            return `activate - to activate subscription`
        }
    }

}
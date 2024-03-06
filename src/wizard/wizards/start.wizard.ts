import { Unit } from "src/unit/unit";
import { ServicesService } from "../services.service";
import { UnitWizard } from "./unit-wizard";
import { WizardStep } from "../wizard";
import { BotUtil } from "../bot.util";
import { AmountWizard } from "./amount.wizard";
import { LogsWizard } from "./logs.wizard";
import { TradesWizard } from "./trades.wizard";
import { AdminWizard } from "./admin.wizard";

export class StartWizard extends UnitWizard {

    constructor(unit: Unit, services: ServicesService) {
        super(unit, services)
    }

    public getSteps(): WizardStep[] {
        return [{
            order: 0,
            message: [
                `Prompts: `,
                this.getActivateLine(),
                `amount - to manage USDT`,
                `log - to see logs`,
                `trade - to see trades`,
                this.defaultStopPrompt
            ],
            process: async (_input: string) => {
                var input = _input.toLowerCase()
                if (this.unit?.active && input === 'deactivate') {
                    const result = await this.services.unitService.activation(this.unit?.identifier, false)
                    return !!result ? 1 : 0
                }
                if (!this.unit?.active && input === 'activate') {
                    const result = await this.services.unitService.activation(this.unit?.identifier, true)
                    return !!result ? 2  : 0
                }
                if (input === 'amount') {
                    return BotUtil.switchResponse(AmountWizard.name)
                }
                if (input === 'log') {
                    return BotUtil.switchResponse(LogsWizard.name)
                }
                if (['trade', 't'].includes(input)) {
                    return BotUtil.switchResponse(TradesWizard.name)
                }
                if (BotUtil.isAdmin(this.unit.telegramChannelId) && ['admin', 'a'].includes(input)) {
                    return BotUtil.switchResponse(AdminWizard.name)
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
import { Unit } from "src/unit/unit"
import { ServiceProvider } from "../services.provider"
import { UnitWizard } from "./unit-wizard"
import { WizBtn } from "./wizard-buttons"
import { WizardStep } from "./wizard"
import { TelegramMessage } from "src/telegram/message"
import { BotUtil } from "../bot.util"
import { LogsWizard } from "./logs.wizard"

export class AdminWizard extends UnitWizard {


    constructor(unit: Unit, services: ServiceProvider) {
        super(unit, services)
    }

    protected _init = async () => {}

    public getSteps(): WizardStep[] {
        return [{
            order: 0,
            message: [`ADMIN actions:`],
            buttons: [[{
                text: `Provide signal`,
                callback_data: WizBtn.signal,
                process: async () => 1,
            }], [{
                text: `LOGS`,
                callback_data: `logswizard`,
                switch: LogsWizard.name
            }]],
        }, {
            order: 1,
            message: [`Provide signal message...`],
            process: async (input: string) => {
                const result = await this.services.signalService.onReceiveTelegramMessage({
                    message: input,
                    id: BotUtil.getRandomInt(1, 5000)
                } as TelegramMessage)
                if (result.error) return 3
                return 2
            },
        }, {            
            order: 2,
            message: ['Sent'],
            close: true
        }, {
            order: 3,
            message: ['Error'],
            close: true
        }]
    }

}
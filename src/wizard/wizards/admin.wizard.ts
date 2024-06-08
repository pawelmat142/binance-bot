import { TelegramMessage } from "../../telegram/message"
import { Unit } from "../../unit/unit"
import { BotUtil } from "../bot.util"
import { ServiceProvider } from "../services.provider"
import { LogsWizard } from "./logs.wizard"
import { StartWizard } from "./start.wizard"
import { UnitWizard } from "./unit-wizard"
import { WizardStep } from "./wizard"
import { WizBtn } from "./wizard-buttons"

export class AdminWizard extends UnitWizard {


    constructor(unit: Unit, services: ServiceProvider) {
        super(unit, services)
    }

    protected _init = async () => {}

    private error: string

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
            }], [BotUtil.getBackSwitchButton(StartWizard.name)]],
        }, {
            order: 1,
            message: [`Provide signal message...`],
            backButton: true,
            process: async (input: string) => {
                const result = await this.services.signalService.onReceiveTelegramMessage({
                    message: input,
                    id: BotUtil.getRandomInt(1, 5000)
                } as TelegramMessage)
                if (result.error) {
                    this.error = result.error
                    return 3
                }
                return 2
            },
        }, {            
            order: 2,
            message: ['Sent'],
            close: true
        }, {
            order: 3,
            message: [this.getErrorMessage()],
            close: true
        }]
    }

    private getErrorMessage() {
        if (this.error) {
            const msg = this.error
            delete this.error
            return msg
        }
        return 'Error'
    }

}
import { Unit } from "src/unit/unit"
import { ServicesService } from "../services.service"
import { WizardStep } from "../wizard"
import { UnitWizard } from "./unit-wizard"
import { TelegramMessage } from "src/telegram/message"
import { WizBtn } from "./wizard-buttons"

export class AdminWizard extends UnitWizard {


    constructor(unit: Unit, services: ServicesService) {
        super(unit, services)
    }

    protected _init = async () => {}

    public getSteps(): WizardStep[] {
        return [{
            order: 0,
            message: [`ADMIN actions:`],
            buttons: [{
                text: `Provide signal`,
                callback_data: WizBtn.signal
            }, {
                text: `TODO`,
                callback_data: WizBtn.AVOID_BUTTON_CALLBACK
            }],

            process: async (input: string) => {
                switch (input?.toLowerCase()) {
                    case WizBtn.signal:
                        return 1
                    default: 
                        return 0
                }
            }
        }, {
            order: 1,
            message: [`Provide signal message...`],
            process: async (input: string) => {
                const result = await this.services.signalService.onReceiveTelegramMessage({
                    message: input,
                    id: 123
                } as TelegramMessage)

                if (result.error) {
                    this.order = 2
                    return [result.error?.message]
                }
                return 2
            },
        }, {            
            order: 2,
            message: ['Sent'],
            close: true
        }]
    }

}
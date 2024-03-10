import { Unit } from "src/unit/unit"
import { ServicesService } from "../services.service"
import { WizardStep } from "../wizard"
import { UnitWizard } from "./unit-wizard"
import { TelegramMessage } from "src/telegram/message"

export class AdminWizard extends UnitWizard {


    constructor(unit: Unit, services: ServicesService) {
        super(unit, services)
    }

    protected _init = async () => {}

    public getSteps(): WizardStep[] {
        return [{
            order: 0,
            message: [`ADMIN`],
            process: async (input: string) => {
                if ('signal' === input) {
                    return 1
                }
                return 0
            }
        }, {
            order: 1,
            message: [`provide signal message`],
            process: async (input: string) => {
                console.log('PROCESS provide signal message')
                 await this.sendSignalTelegramMessageToMe(input)
                return 2
            },
        }, {            
            order: 2,
            message: ['sent'],
            close: true
        }]
    }


    private sendSignalTelegramMessageToMe(message: string) {
        const telegramMessage = {
            message: message,
            id: Date.now()
        } as TelegramMessage

        const path = `http://localhost:8009/signal/telegram`
        fetch(path, {
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
            body: JSON.stringify(telegramMessage)
        })
    }
}
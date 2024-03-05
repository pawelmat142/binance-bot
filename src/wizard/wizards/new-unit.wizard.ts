import { UnitService } from "src/unit/unit.service";
import { Wizard, WizardStep } from "../wizard";
import { ServicesService } from "../services.service";
import { Unit } from "src/unit/unit";

export class NewUnitWizard extends Wizard {

    constructor(chatId: number, services: ServicesService) {
        super(chatId, services)
    }

    private unit: Partial<Unit> = {}


    public getSteps(): WizardStep[] {
        return [{
            order: 0,
            message: [
                `Prompts: `,
                `start - to start subscribe bot`,
                this.defaultStopPrompt
            ],
            process: async (input: string) => {
                return input.toLowerCase() === 'start' ? 1 : 0
            }
        }, {
            order: 1,
            message: [
                `Provide unique nickname / identifier`
            ],
            process: async (input: string) => {
                const taken = await this.services.unitService.identifierTaken(input)
                if (taken) {
                    return  [`Identifier taken`]
                }
                return 2
            }
        }, {
            order: 2,
            message: [ `Provide api key` ],
            process: async (input: string) => {
                const apiKeyTaken = await this.services.unitService.apiKeyTaken(input)
                if (apiKeyTaken) {
                    return [`Api key is already in use`]
                }
                this.unit.binanceApiKey = input
                return 3
            }
        }, {
            order: 3,
            message: [ `Provide api secret` ],
            process: async (input: string) => {
                this.unit.binanceApiSecret = input
                const apiKeyError = await this.services.unitService.apiKeyError(this.unit)
                if (apiKeyError) {
                    this.order = 2
                    return [`${apiKeyError.msg}`]
                }
                return 4
            }
        }, {
            order: 4,
            message: [ `Provide USDT amount per single transaction`],
            process: async (input: string) => {
                const usdtPerTransaction = Number(input)
                if (isNaN(usdtPerTransaction)) {
                    return [`${input} is not a number`]
                }
                if (usdtPerTransaction < 7) {
                    return [`Amount should be more than $7`]
                }
                this.unit.usdtPerTransaction = usdtPerTransaction
                return 5
            }
        }, {
            order: 5,
            message: [ 
                `$${this.unit?.usdtPerTransaction} selected`, 
                `Provide CONFIRM to confirm`
            ],
            process: async (input: string) => {
                if (input.toLowerCase() === 'confirm') {
                    this.unit.telegramChannelId = this.chatId.toString()
                    const unit = await this.services.unitService.addUnit(this.unit as Unit)
                    if (unit) return 6
                }
                return 7
            }
        }, {
            order: 6,
            message: [`Successfully subscribed with identifier/nickname ${this.unit?.identifier}`],
            close: true
        }, {
            order: 7,
            message: [`Failed to subscribe`],
            close: true
        }]
    }

}
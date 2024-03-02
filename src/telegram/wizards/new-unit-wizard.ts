import { BotWizard, WizardStep } from "./bot-wizard";
import { UnitService } from "src/unit/unit.service";
import { Unit } from "src/unit/unit";

export class NewUnitWizard extends BotWizard {

    private readonly unitService: UnitService

    constructor(
        chatId: number,
        unitService: UnitService,
    ) {
        super(chatId)
        this.unitService = unitService
    }

    private unit: Partial<Unit> = {}

    getSteps = (): WizardStep[] => [
        {
            order: 0,
            message: [
                `Prompts: `,
                `start - to start subscribe bot`,
                this.defaultStopPrompt
            ],
            answers: [{
                phrase: 'start',
                result: async () => 1
            }]
        }, {
            order: 1,
            message: [ `Provide unique nickname / identifier` ],
            answers: [{
                input: true,
                result: async (text) => {
                    const identifierTaken = await this.unitService.identifierTaken(text)
                    if (identifierTaken) {
                        return [`Identifier taken`]
                    }
                    this.unit.identifier = text
                    return 2
                }
            }]
        }, {
            order: 2,
            message: [ `Provide api key `],
            answers: [{
                input: true,
                result: async (text) => {
                    const apiKeyTaken = await this.unitService.apiKeyTaken(text)
                    if (apiKeyTaken) {
                        return [`Api key is already in use`]
                    }
                    this.unit.binanceApiKey = text
                    return 3
                }
            }]
        }, {
            order: 3,
            message: [ `Provide api secret `],
            answers: [{
                input: true,
                result: async (text) => {
                    this.unit.binanceApiSecret = text
                    const apiKeyError = await this.unitService.apiKeyError(this.unit)
                    if (apiKeyError) {
                        this.order = 2
                        return [apiKeyError.msg]
                    } else {
                        this.unit.active = false
                        return 4
                    }
                }
            }]
        }, {
            order: 4,
            message: [ `Provide USDT amount per single transaction`],
            answers: [{
                input: true,
                result: async (text) => {
                    const usdtPerTransaction = Number(text)
                    if (isNaN(usdtPerTransaction)) {
                        return [`${text} is not a number`]
                    }
                    if (usdtPerTransaction < 7) {
                        return [`Amount should be more than $7`]
                    }
                    this.unit.usdtPerTransaction = usdtPerTransaction
                    return 5
                }
            }]
        }, {
            order: 5,
            message: [ 
                `$${this.unit.usdtPerTransaction} selected`, 
                `Provide CONFIRM to confirm`
            ], 
            answers: [{
                input: true,
                result: async (text: string) => {
                    if (text === 'CONFIRM') {
                        await this.addUnit()
                        return 6
                    } else {
                        this.unit = {}
                        this.order = 0
                        return [`Subscription failed`]
                    }
                }
            }]
        }, {
            order: 6,
            message: this.getFinalMessage(),
            close: true
        }
    ]

    private async addUnit() {
        this.unit.telegramChannelId = `${this.chatId}`
        const unit = await this.unitService.addUnit(this.unit as Unit)
        console.log(unit)
    }

    private getFinalMessage(): string[] {
        const lines = [ 
            `Sumbscription completed`,
            `identifier: ${this.unit.identifier}`,
            `active: ${this.unit.active}`
        ]
        return lines
    }
}
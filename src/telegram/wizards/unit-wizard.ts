import { UnitService } from "src/unit/unit.service";
import { BotWizard, WizardAnswer, WizardStep } from "./bot-wizard";
import { Unit } from "src/unit/unit";
import { BotUtil } from "../bot.util";

export class UnitWizard extends BotWizard {

    private readonly unitService: UnitService

    private readonly unit: Unit

    constructor(
        unit: Unit,
        unitService: UnitService,
    ) {
        super(Number(unit.telegramChannelId))
        this.unitService = unitService
        this.unit = unit
    }

    getSteps = (): WizardStep[] => [
        {
            order: 0,
            message: [
                `Prompts: `,
                this.getActivateLine(),
                `amount - to set USDT amount per single transaction`
            ],
            answers: [ 
                this.getActivateAnswer(),
                {
                    phrase: 'amount',
                    result: async () => 3
                }
            ]
        }, {
            order: 1,
            close: true,
            message: [` Subscription deactivated`]
        }, {
            order: 2,
            close: true,
            message: [` Subscription activated`]
        },
        {
            order: 3,
            message: [
                `Current value: $${this.unit.usdtPerTransaction}`, 
                `Provide USDT amount per single transaction`,
                `stop - to interrupt`
            ],
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
                    return 4
                }
            }]
        }, {
            order: 4,
            message: [`Provide CONFIRM to confirm`, `$${this.unit.usdtPerTransaction}`],
            answers: [{
                input: true,
                result: async (text: string) => {
                    if (text === 'CONFIRM') {
                        const result = await this.unitService.updateUsdtPerTransaction(this.unit)
                        if (result) {
                            return 5
                        }
                    }
                    this.order = 3
                    return [`Failed`]
                }
            }]
        }, {
            order: 5,
            close: true,
            message: [`Successfully updated USDT amount per transaction: $${this.unit.usdtPerTransaction}`]
        }
    ]

    private getActivateLine(): string {
        if (this.unit.active) {
            return `deactivate - to deactivate subscription`
        } else {
            return `dd - to activate subscription`
        }
    }

    private getActivateAnswer(): WizardAnswer {
        if (this.unit.active) {
            return {
                phrase: 'deactivate',
                result: async () => {
                    const result = await this.unitService.activation(this.unit.identifier, false)
                    if (result) return 1
                    return [`Failed`]
                }
            }
        } else {
            return {
                phrase: 'activate',
                result: async () => {
                    const result = await this.unitService.activation(this.unit.identifier, true)
                    if (result) return 2
                    return [`Failed`]
                }
            }
        }
    }

}

import { Unit } from "src/unit/unit"
import { ServicesService } from "../services.service"
import { Wizard, WizardStep } from "../wizard"

export class AmountWizard extends Wizard {

    private unit: Unit

    constructor(chatId: number, services: ServicesService) {
        super(chatId, services)
        this.initUnit()
    }

    private async initUnit() {
        this.unit = await this.services.unitService.findUnitByChatId(this.chatId)
    }

    public getSteps(): WizardStep[] {
        return [{
            order: 0,
            message: [
                `Current USDT per transaction ${this.unit?.usdtPerTransaction}$`,
                `change - to change USDT per transaction`,
                `balance - to check your balance`,
            ],
            process: async (input: string) => {
                if (input === 'change') {
                    return 1
                }
                if (input === 'balance') {
                    return 4
                }
                return 0
            }
        }, {
            order: 1,
            message: ['Provide USDT amount per transaction'],
            process: async (input: string) => {
                const usdtPerTransaction = Number(input)
                if (isNaN(usdtPerTransaction)) {
                    this.order = 1
                    return [`${input} is not a number!`]
                }
                if (usdtPerTransaction < 10) {
                    this.order = 1
                    return [`Amount should be more than $7!`]
                }
                this.unit.usdtPerTransaction = usdtPerTransaction
                return 2
            }
        }, {
            order: 2,
            message: [
                `CONFIRM - to confirm ${this.unit?.usdtPerTransaction}$ per transaction`,
            ],
            process: async (input: string) => {
                if (input.toLowerCase() === 'confirm') {
                    const result = await this.services.unitService.updateUsdtPerTransaction(this.unit)
                    if (result) {
                        return 3
                    }
                }
                this.order = 0
                return [`Failed...`]
            }
        }, {
            order: 3,
            message: [`Successfully updated USDT amount per transaction: ${this.unit?.usdtPerTransaction}$`],
            close: true
        }, {
            order: 4,
            message: [ `BALANCE TODO`],
            close: true
        }]
    }
}
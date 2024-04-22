import { Unit } from "src/unit/unit"
import { ServicesService } from "../services.service"
import { WizardStep } from "../wizard"
import { UnitWizard } from "./unit-wizard"
import { WizBtn } from "./wizard-buttons"

export class AmountWizard extends UnitWizard {

    constructor(unit: Unit, services: ServicesService) {
        super(unit, services)
    }

    public getSteps(): WizardStep[] {

        const message = [
            `Current USDT per transaction: ${this.unit?.usdtPerTransaction}$`,
            `Current USDT per BTC transaction: ${this.unit?.usdtPerTransaction}$`,
            `Minimum USDT per BTC transaction is 100$`,
            `You can allow/deny BTC tranaction if your USDT per transaction is less`
        ]

        return [{
            order: 0,
            message: message,
            buttons: [{
                text: 'Change USDT per transaction',
                callback_data: WizBtn.usdtPerTransaction
            }, {
                text: 'Allow 100$ per BTC transaction if USDT per transaction is less',
                callback_data: WizBtn.allow100perBtcTransaction
            }, {
                text: 'Check your balance',
                callback_data: WizBtn.balance
            }],
            process: async (input: string) => {
                switch (input) {
                    case WizBtn.usdtPerTransaction:
                        return 1

                    case WizBtn.allow100perBtcTransaction:
                        return 5

                    case WizBtn.balance:
                        return 4

                    default: 
                        return 0
                }
            }
        }, {
            order: 1,
            message: ['Provide USDT amount per transaction...'],
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
                `Are you sure?`
            ],
            buttons: [{
                text: 'Yes',
                callback_data: WizBtn.YES
            }, {
                text: 'No',
                callback_data: WizBtn.STOP
            }],
            process: async (input: string) => {
                switch (input) {

                    case WizBtn.YES: 
                    const result = await this.services.unitService.updateUsdtPerTransaction(this.unit)
                    return !!result ? 3 : 0

                    default: 
                    this.order = 0
                    return ['Failed changing USDT per transaction']    
                }
            }
        }, {
            order: 3,
            message: [`Successfully updated USDT per transaction: ${this.unit?.usdtPerTransaction}$`],
            close: true
        }, {
            order: 4,
            message: [ `BALANCE TODO`],
            close: true
        }, {
            order: 5,
            message: [' TODO allow btc for 100']
        }]
    }
}
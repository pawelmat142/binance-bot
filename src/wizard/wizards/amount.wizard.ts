import { Unit } from "src/unit/unit"
import { ServicesService } from "../services.service"
import { WizardStep } from "../wizard"
import { UnitWizard } from "./unit-wizard"
import { WizBtn } from "./wizard-buttons"
import { BinanceFuturesAccountInfo } from "src/binance/wizard-binance.service"
import { BotUtil } from "../bot.util"

export class AmountWizard extends UnitWizard {

    constructor(unit: Unit, services: ServicesService) {
        super(unit, services)
    }

    public getSteps(): WizardStep[] {

        const message = [
            `Current USDT per transaction: ${this.unit?.usdtPerTransaction}$.`,
            ``,
            `Binance require minimum 100$ per BTC transaction,`,
            `you can allow/deny BTC transaction for 100$ if your USDT per transaction is less`
        ]

        const allow100perBtcTransactionMsg = `${this.unit?.allow100perBtcTransaction ? 'Deny' : 'Allow'} 100$ per BTC transaction if USDT per transaction is less.`

        return [{
            order: 0,
            message: message,
            buttons: [{
                text: 'Change USDT per transaction',
                callback_data: WizBtn.usdtPerTransaction
            }, {
                text: allow100perBtcTransactionMsg,
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
                        const result = await this.services.unitService.updateAllow100perBtcTransaction(this.unit)
                        return !!result ? 5 : 0

                    case WizBtn.balance:
                        const usdtInfo = await this.services.binance.getBalance(this.unit)
                        if (!usdtInfo) return 0
                        this.order = 4
                        // TODO show also transactions pending USDT
                        return this.getUsdtInfoMessage(usdtInfo)

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
            close: true
        }, {
            order: 5,
            message: [`100$ per BTC transaction is ${this.unit?.allow100perBtcTransaction ? 'ALLOWED' : 'DENIED'} now`],
            close: true
        }]
    }

    private getUsdtInfoMessage(usdtInfo: BinanceFuturesAccountInfo): string[] {
        return [`TODO: experimental:
balance: ${BotUtil.fixValue(usdtInfo.balance)}$
crossWalletBalance: ${BotUtil.fixValue(usdtInfo.crossWalletBalance)}$
availableBalance: ${BotUtil.fixValue(usdtInfo.availableBalance)}$
maxWithdrawAmount: ${BotUtil.fixValue(usdtInfo.maxWithdrawAmount)}$`,
        ]
    }
}
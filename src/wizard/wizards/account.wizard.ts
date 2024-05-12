import { Unit } from "src/unit/unit"
import { ServicesService } from "../services.service"
import { UnitWizard } from "./unit-wizard"
import { WizBtn } from "./wizard-buttons"
import { BinanceFuturesAccountInfo } from "src/binance/wizard-binance.service"
import { BotUtil } from "../bot.util"
import { WizardStep } from "./wizard"

export class AccountWizard extends UnitWizard {

    constructor(unit: Unit, services: ServicesService) {
        super(unit, services)
    }

    usdtInfo: BinanceFuturesAccountInfo


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
            buttons: [[{
                text: `${this.unit?.active ? 'Deactivate' : 'Activate'} your subscription`,
                callback_data: this.unit?.active ? WizBtn.deactivate : WizBtn.activate,
                process: async () => {
                    const result = await this.services.unitService.activation(this.unit?.identifier, !this.unit?.active)
                    if (result) {
                        return this.unit?.active ? 10 : 11
                    }
                    return 0
                }
            }],[{
                text: 'Change USDT per transaction',
                callback_data: WizBtn.usdtPerTransaction,
                process: async () => {
                    return 1
                }
            }], [{
                text: allow100perBtcTransactionMsg,
                callback_data: WizBtn.allow100perBtcTransaction,
                process: async () => {
                    const result = await this.services.unitService.updateAllow100perBtcTransaction(this.unit)
                    return !!result ? 5 : 0
                }
            }], [{
                text: 'Check your balance',
                callback_data: WizBtn.balance,
                process: async () => {
                    const usdtInfo = await this.services.binance.getBalance(this.unit)
                    if (!usdtInfo) return 0
                    this.usdtInfo = usdtInfo
                    // TODO show also transactions pending USDT
                    return 6
                }
            }]],
        }, {
            order: 1,
            message: ['Provide USDT amount per transaction...'],
            process: async (input: string) => {
                const usdtPerTransaction = Number(input)
                if (isNaN(usdtPerTransaction)) {
                    return 7
                }
                if (usdtPerTransaction < 10) {
                    return 8
                }
                this.unit.usdtPerTransaction = usdtPerTransaction
                return 2
            }
        }, {
            order: 2,
            message: [
                `Are you sure?`
            ],
            buttons: [[{
                text: 'Yes',
                callback_data: WizBtn.YES,
                process: async () => {
                    const result = await this.services.unitService.updateUsdtPerTransaction(this.unit)
                    return !!result ? 3 : 9
                }
            }, {
                text: 'No',
                callback_data: WizBtn.STOP,
                process: async () => {
                    return 9
                }
            }]],
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
        }, {
            order: 6,
            message: this.getUsdtInfoMessage(this.usdtInfo),
            close: true
        }, {
            order: 7,
            message: [`Its not a number!`],
            nextOrder: 1
        }, {
            order: 8, 
            message: [`Amount should be more than $7!`],
            nextOrder: 1
        }, {
            order: 9,
            message: [`Usdt per transaction is not changed!`],
            nextOrder: 1
        }, {
            order: 10,
            message: [` Subscription deactivated`],
            close: true,
        }, {
            order: 11,
            message: [` Subscription activated`],
            close: true,
        }]
    }

    private getUsdtInfoMessage(usdtInfo: BinanceFuturesAccountInfo): string[] {
        return !this.usdtInfo ? [] : [`TODO: experimental:
balance: ${BotUtil.fixValue(usdtInfo.balance)}$
crossWalletBalance: ${BotUtil.fixValue(usdtInfo.crossWalletBalance)}$
availableBalance: ${BotUtil.fixValue(usdtInfo.availableBalance)}$
maxWithdrawAmount: ${BotUtil.fixValue(usdtInfo.maxWithdrawAmount)}$`,
        ]
    }
}
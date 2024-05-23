import { Unit } from "src/unit/unit"
import { ServiceProvider } from "../services.provider"
import { UnitWizard } from "./unit-wizard"
import { WizBtn } from "./wizard-buttons"
import { BinanceFuturesAccountInfo } from "src/binance/wizard-binance.service"
import { WizardStep } from "./wizard"
import { BotUtil } from "../bot.util"

export class AccountWizard extends UnitWizard {

    constructor(unit: Unit, services: ServiceProvider) {
        super(unit, services)
    }

    usdtInfo: BinanceFuturesAccountInfo

    private error: string


    public getSteps(): WizardStep[] {

        const message = [
            `Current USDT per transaction: ${this.unit?.usdtPerTransaction}$.`,
            ``,
            `You can allow/deny minimum transaction limit`,
            `For example Binance API requires minimum 100 USDT per BTC transaction`,
            `There is no higher one`
        ]

        const allowMinNotional = `${this.unit?.allowMinNotional ? 'DENY' : 'ALLOW'} minimum transaction limit`

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
                text: allowMinNotional,
                callback_data: WizBtn.allowMinNotional,
                process: async () => {
                    const result = await this.services.unitService.updateAllowMinNotional(this.unit)
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
            }], [{
                text: `Change API Key`,
                callback_data: `changeapikey`,
                process: async () => 15
            }], [{
                text: `Delete account`,
                callback_data: `delete`,
                process: async () => 12
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
            message: [`Minimum transaction limit is ${this.unit?.allowMinNotional ? 'ALLOWED' : 'DENIED'} now`],
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
            message: [`Subscription deactivated`],
            close: true,
        }, {
            order: 11,
            message: [`Subscription activated`],
            close: true,
        }, {
            order: 12,
            message: [
                `Are you sure you want to delete your account?`,
                `Pending positions or open orders will NOT be closed automatically`
            ],
            buttons: [[{
                text: 'Cancel',
                callback_data: `cancel`,
                process: async () => 13
            }, {
                text: `CONFIRM`,
                callback_data: `confirm`,
                process: async () => {
                    const success = await this.services.unitService.deleteUnit(this.unit.identifier)
                    return success ? 14 : 13
                }
            }]]
        }, {
            order: 13,
            message: [`Canceled or error`],
            close: true
        }, {
            order: 14,
            message: [`Successfully deleted account`],
            close: true
        }, {
            order: 15,
            message: [`Provide your Binance Futures API Key...`],
            process: async (input: string) => {
                const apiKeyTaken = await this.services.unitService.apiKeyTaken(input)
                if (apiKeyTaken) return 16
                this.unit.binanceApiKey = input
                return 17
            }
        }, {
            order: 16, 
            message: [`API Key is already in use!`],
            close: true
        }, {
            order: 17,
            message: [`Provide your Binance Futures Secret Key...`],
            process: async (input: string) => {
                this.unit.binanceApiSecret = input
                const apiKeyError = await this.services.unitService.apiKeyError(this.unit)
                if (apiKeyError) {
                    this.error = apiKeyError.msg
                    return 18
                }

                const success = await this.services.unitService.updateApiKey(this.unit)
                if (!success.modifiedCount) {
                    this.error = `Modification error??`
                    return 18
                }
                return 19
            }
        }, {
            order: 18,
            message: [this.error],
            nextOrder: 15
        }, {
            order: 19,
            message: [`Successfully changed API Key`],
            close: true
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
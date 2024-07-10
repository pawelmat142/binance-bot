import { ServiceProvider } from "../services.provider"
import { UnitWizard } from "./unit-wizard"
import { WizBtn } from "./wizard-buttons"
import { WizardStep } from "./wizard"
import { BotUtil } from "../bot.util"
import { StartWizard } from "./start.wizard"
import { BinanceFuturesAccountInfo } from "../../binance/wizard-binance.service"
import { Unit } from "../../unit/unit"
import { IncomesWizard } from "./incomes.wizard"
import { TradeAmountWizard } from "./trade-amount.wizard"

export class AccountWizard extends UnitWizard {

    constructor(unit: Unit, services: ServiceProvider) {
        super(unit, services)
    }

    usdtInfo: BinanceFuturesAccountInfo

    private error: string


    public getSteps(): WizardStep[] {

        const message = [
            `Account`,
        ]

        const allowMinNotional = `${this.unit?.allowMinNotional ? 'DENY' : 'ALLOW'} minimum transaction limit`

        return [{
            order: 0,
            message: [`Account`],
            buttons: [[{
                text: `${this.unit?.active ? 'Deactivate' : 'Activate'} your subscription`,
                callback_data: this.unit?.active ? WizBtn.deactivate : WizBtn.activate,
                process: async () => {
                    if (!this.unit) return 0
                    this.unit.active = !this.unit.active
                    const result = await this.services.unitService.activation(this.unit)
                    if (result) {
                        return this.unit?.active ? 3 : 4
                    }
                    return 0
                }
            }], [{
                text: 'Trade amount',
                callback_data: 'amount',
                switch: TradeAmountWizard.name
            }], [{
                text: 'Incomes',
                callback_data: 'income',
                switch: IncomesWizard.name
            }], [{
                text: allowMinNotional,
                callback_data: WizBtn.allowMinNotional,
                process: async () => {
                    const result = await this.services.unitService.updateAllowMinNotional(this.unit)
                    return !!result ? 1 : 0
                }
            }], [{
                text: 'Check your balance',
                callback_data: WizBtn.balance,
                process: async () => {
                    const usdtInfo = await this.services.statisticsBinanceService.getBalance(this.unit)
                    if (!usdtInfo) return 0
                    this.usdtInfo = usdtInfo
                    // TODO show also transactions pending USDT
                    return 2
                }
            }], [{
                text: `Change API Key`,
                callback_data: `changeapikey`,
                process: async () => 8
            }], [BotUtil.getBackSwitchButton(StartWizard.name), {
                text: `Delete account`,
                callback_data: `delete`,
                process: async () => 5
            }]],
        }, {
            order: 1,
            message: [`Minimum transaction limit is ${this.unit?.allowMinNotional ? 'ALLOWED' : 'DENIED'} now`],
            close: true
        }, {
            order: 2,
            message: this.getUsdtInfoMessage(this.usdtInfo),
            backButton: true
        }, {
            order: 3,
            message: [`Subscription deactivated`],
            close: true,
        }, {
            order: 4,
            message: [`Subscription activated`],
            close: true
        }, {
            order: 5,
            message: [
                `Are you sure you want to delete your account?`,
                `Pending positions or open orders will NOT be closed automatically`
            ],
            buttons: [[{
                text: 'Cancel',
                callback_data: `cancel`,
                process: async () => 6
            }, {
                text: `CONFIRM`,
                callback_data: `confirm`,
                process: async () => {
                    const success = await this.services.unitService.deleteUnit(this.unit.identifier)
                    return success ? 7 : 6
                }
            }]]
        }, {
            order: 6,
            message: [`Canceled or error`],
            close: true
        }, {
            order: 7,
            message: [`Successfully deleted account`],
            close: true
        }, {
            order: 8,
            message: [`Provide your Binance Futures API Key...`],
            backButton: true,
            process: async (input: string) => {
                const apiKeyTaken = await this.services.unitService.apiKeyTaken(input)
                if (apiKeyTaken) return 9
                this.unit.binanceApiKey = input
                return 10
            }
        }, {
            order: 9, 
            message: [`API Key is already in use!`],
            close: true
        }, {
            order: 10,
            message: [`Provide your Binance Futures Secret Key...`],
            backButton: true,
            process: async (input: string) => {
                this.unit.binanceApiSecret = input
                const apiKeyError = await this.services.unitService.apiKeyError(this.unit)
                if (apiKeyError) {
                    this.error = apiKeyError.msg
                    return 11
                }

                const success = await this.services.unitService.updateApiKey(this.unit)
                if (!success.modifiedCount) {
                    this.error = `Modification error??`
                    return 11
                }
                return 12
            }
        }, {
            order: 11,
            message: [this.error],
            nextOrder: 8
        }, {
            order: 12,
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
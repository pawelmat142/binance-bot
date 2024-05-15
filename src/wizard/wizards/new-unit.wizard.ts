import { Unit } from "src/unit/unit";
import { Wizard, WizardStep } from "./wizard";
import { ServiceProvider } from "../services.provider";
import { WizBtn } from "./wizard-buttons";

export class NewUnitWizard extends Wizard {

    constructor(chatId: number, services: ServiceProvider) {
        super(chatId, services)
    }

    private unit: Partial<Unit> = {}

    private error: string

    private static USDT_MIN_LIMIT = 10


    public getSteps(): WizardStep[] {

        return [{
            order: 0,
            message: [`Would you like to subscribe?`],
            buttons: [[{
                text: `Subscribe`,
                callback_data: `subscribe`,
                process: async () => 1
            }]]
        }, {
            order: 1,
            message: [`Provide your unique identifier...`],
            process: async (input: string) => {
                const taken = await this.services.unitService.identifierTaken(input)
                if (taken) return 2
                this.unit.identifier = input
                return 3
            }
        }, {
            order: 2,
            message: [`Nickname / identifier already in use`],
            process: async () => 1
        }, {
            order: 3,
            message: [`Provide your binance futures api key...`],
            process: async (input: string) => {
                const apiKeyTaken = await this.services.unitService.apiKeyTaken(input)
                if (apiKeyTaken) return 4
                this.unit.binanceApiKey = input
                return 5
            }
        }, {
            order: 4,
            message: [`Api key is already in use!`],
            close: true
        }, {
            order: 5,
            message: [`Provide your binance futures api secret...`],
            process: async (input: string) => {
                this.unit.binanceApiSecret = input
                    const apiKeyError = await this.services.unitService.apiKeyError(this.unit as Unit)
                    if (apiKeyError) {
                        this.error = apiKeyError.msg
                        return 6
                    }
                    return 7
            }
        }, {
            order: 6,
            message: [this.error],
            nextOrder: 5
        }, {
            order: 7,
            message: [`Provide USDT amount per single transaction...`],
            process: async (input: string) => {
                const usdtPerTransaction = Number(input)
                if (isNaN(usdtPerTransaction)) {
                    return 8
                }
                if (usdtPerTransaction < NewUnitWizard.USDT_MIN_LIMIT) {
                    return 9
                }
                this.unit.usdtPerTransaction = usdtPerTransaction
                return 10

            }
        }, {
            order: 8,
            message: [`This is not a number`],
            nextOrder: 7
        }, {
            order: 9,
            message: [`Amount should be more than ${NewUnitWizard.USDT_MIN_LIMIT} USDT`],
            nextOrder: 7,
        }, {
            order: 10,
            message: [
                `Some currency pairs have a higher minimum transaction limit, for example`,
                `for BTCUSDT it is 100 USDT - highest one`,
                `for ETHUSDT it is 20 USDT.`,
                `Do you want to allow transactions that require more USDT than the given USDT per transaction?`
            ],
            buttons: [[{
                text: `DENY`,
                callback_data: WizBtn.NO,
                process: async () => {
                    this.unit.allowMinNotional = false
                    return 11
                }
            }, {
                text: `ALLOW`,
                callback_data: WizBtn.YES,
                process: async () => {
                    this.unit.allowMinNotional = true
                    return 11
                }
            }]]
        }, {
            order: 11,
            message: [
                `Subscription will be ready...`,
            ],
            buttons: [[{
                text: 'Cancel',
                callback_data: `cancel`,
                process: async () => 12
            }, {
                text: `CONFIRM`,
                callback_data: `confirm`,
                process: async () => {
                    this.unit.telegramChannelId = this.chatId.toString()
                    const unit = await this.services.unitService.addUnit(this.unit as Unit)
                    if (unit) {
                        return 13
                    }
                    return 12
                }
            }]]
        }, {
            order: 12,
            message: [`Canceled`],
            close: true
        }, {
            order: 13,
            message: [`Successfully subscribed with identifier: ${this.unit?.identifier}`],
            close: true
        }]
    }

}
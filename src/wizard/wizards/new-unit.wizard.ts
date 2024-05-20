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

    private getBotIp(): string {
        return process.env.BOT_IP
    }

    public getSteps(): WizardStep[] {

        return [{
            order: 0,
            message: [
                `Would you like to subscribe?`,
                ` * you will need a generated API key`
            ],
            buttons: [[{
                text: `Subscribe`,
                callback_data: `subscribe`,
                process: async () => 1
            }], [{
                text: `Show how to generate API key`,
                callback_data: `showgenapikey`,
                process: async () => 14
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
            message: [`Provide your Binance Futures API Key...`],
            process: async (input: string) => {
                const apiKeyTaken = await this.services.unitService.apiKeyTaken(input)
                if (apiKeyTaken) return 4
                this.unit.binanceApiKey = input
                return 5
            }
        }, {
            order: 4,
            message: [`API Key is already in use!`],
            close: true
        }, {
            order: 5,
            message: [`Provide your Binance Futures Secret Key...`],
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
                `Some currency pairs require a minimum notional value to open an order,`,
                `for example: BTCUSDT needs $100,`,
                `so for x5 leverage it will be $20.`,
                `Do you want to allow transactions that require more USDT than the given USDT per transaction?`,
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
        }, {
            order: 14,
            message: this.getApiKeyGenerationManualMessage(),
            buttons: [[{
                text: `Subscribe`,
                callback_data: `subscribe`,
                process: async () => 1
            }]]
        }]
    }

    private getApiKeyGenerationManualMessage(): string[] {
        if (this.order !== 14) return []
        const message = [
            `Log in to Binance`,
            `Enable futures trading:`,
            `https://www.binance.com/en/support/faq/how-to-open-a-binance-futures-account-360033772992`,
            `Go to dashboard:`,
            `https://www.binance.com/en/my/dashboard`,
            `Go to Account -> API Management -> Create API`,
            ``,
            `Select 'System generated' -> Next`,
            `Provide label of your API key (doesnt matter for me)`,
            `You may need authenticate now`,
            `You should see API Key and Secret Key now, save them for a moment`,
            `Go to 'Edit restrictions'`,
            `Select 'Restrict access to trusted IPs only' and provide: ${this.getBotIp()}`,
            `Select 'Enable Futures'`,
            `Save, and You can start subscribe now`,
        ]

        const result = []
        let iterator = 1
        for (let line of message) { 
            if (!line.startsWith('http')) {
                line = `${iterator}. ${line}`
                iterator++
            }
            result.push(line)
        }
        return result
    }

}
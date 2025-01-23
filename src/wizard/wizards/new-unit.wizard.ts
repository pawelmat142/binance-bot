import { Wizard, WizardStep } from "./wizard";
import { ServiceProvider } from "../services.provider";
import { WizBtn } from "./wizard-buttons";
import { Unit } from "../../unit/unit";

export class NewUnitWizard extends Wizard {

    constructor(chatId: number, services: ServiceProvider) {
        super(chatId, services)
    }

    private unit: Partial<Unit> = {}

    private error: string

    public static USDT_MIN_LIMIT = 10

    private getBotIp(): string {
        const ip = process.env.BOT_IP
        return ip || `<IP where application is installed>`
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
                text: `How to generate API key?`,
                callback_data: `showgenapikey`,
                process: async () => 14
            }]]
        }, {
            order: 1,
            message: [`Provide your unique identifier/nickname...`],
            backButton: true,
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
            backButton: true,
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
            backButton: true,
            process: async (input: string) => {
                this.unit.binanceApiSecret = input
                    const apiKeyError = await this.services.unitService.apiKeyError(this.unit as Unit)
                    if (!apiKeyError || apiKeyError.msg) {
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
            message: [`Provide trade amount (USDT) per single trade...`],
            backButton: true,
            process: async (input: string) => {
                const amount = Number(input)
                if (isNaN(amount)) {
                    return 8
                }
                if (amount < NewUnitWizard.USDT_MIN_LIMIT) {
                    return 9
                }
                
                this.unit.tradeAmounts = new Map<string, number>()

                this.services.signalSourceService.signalSources.forEach(s => {
                    this.unit.tradeAmounts.set(s.name, amount)
                })

                return 10

            }
        }, {
            order: 8,
            message: [`This is not a number`],
            nextOrder: 7
        }, {
            order: 9,
            message: [`Amount should be ${NewUnitWizard.USDT_MIN_LIMIT} USDT or more`],
            nextOrder: 7,
        }, {
            order: 10,
            message: [
                `Some currency pairs require a minimum notional value to open an order,`,
                `for example: BTCUSDT needs $100,`,
                `so for x5 leverage it will be $20.`,
                `Do you want to ALLOW transactions that require more USDT than the given USDT per transaction?`,
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
            message: [`Subscription will be ready...`],
            backButton: true,
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
            message: [
                `Successfully subscribed`,
                `Your identifier: ${this.unit?.identifier}`,
                `Subscription need to be activated`
            ],
            close: true
        }, {
            order: 14,
            message: [`Mobile app or web browser?`],
            buttons: [[{
                text: `WEB`,
                callback_data: `web`,
                process: async () => 15
            }, {
                text: `MOBILE`,
                callback_data: `mobile`,
                process: async () => 16
            }]]
        }, {
            order: 15,
            message: this.getApiKeyGenerationManualMessage(),
            buttons: [[{
                text: `Subscribe`,
                callback_data: `subscribe`,
                process: async () => 1
            }]]
        }, {
            order: 16,
            message: this.getApiKeyGenerationManualMessageForMobile(),
            buttons: [[{
                text: `Subscribe`,
                callback_data: `subscribe`,
                process: async () => 1
            }]]
        }
    ]
    }

    private getApiKeyGenerationManualMessage(): string[] {
        if (this.order !== 15) return []
        const message = [
            `Log in to Binance`,
            `Enable futures trading:`,
            `https://www.binance.com/en/support/faq/how-to-open-a-binance-futures-account-360033772992`,
            `Go to dashboard:`,
            `https://www.binance.com/en/my/dashboard`,
            `Go to Account -> API Management`,
            `"Create API" by yellow button, choose "System generated", and click "Next"`,
            `Give the label to the Key and click "Next"`,
            `You may need to authenticate`,
            `You can see your API Key, click "Edit"`,
            `Copy your Secret Key, it is possible to see it only one time when you create API Key`,
            `Choose "Restrict access to trusted IP's only(Recommended)" in IP access restriction use IP ${this.getBotIp()} and Accept`,
            `When you set restricted IP check box "Enable Futures"`,
            `"Save"`,
            `You can start subscribe process now`,
        ]
        return this.addListNumbers(message)
    }

    private getApiKeyGenerationManualMessageForMobile(): string[] {
        if (this.order !== 16) return []
        const message = this.addListNumbers([
            `Log in to Binance`,
            `Enable futures trading:`,
            `https://www.binance.com/en/support/faq/how-to-open-a-binance-futures-account-360033772992`,
            `Go to profile settings(top left corner), and click "More Service"`,
            `Bellow on the end of the list is API management, choose it`,
            `"Create API" by yellow button, choose "System generated", and click "Next"`,
            `Give the label to the Key and click "Next"`,
            `You may need to authenticate`,
            `You can see your API Key, click "Edit"`,
            `Copy your Secret Key, it is possible to see it only one time when you create API Key`,
            `Choose "Restrict access to trusted IP's only(Recommended)" in IP access restriction use IP ${this.getBotIp()} and Accept`,
            `When you set restricted IP check box "Enable Futures"`,
            `"Save"`,
            `You can start subscribe process now`,
        ])
        message.unshift("To generate API keys for Binance, follow these steps:")
        return message
    }

    private addListNumbers(message: string[]): string[] {
        const result: string[] = []
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
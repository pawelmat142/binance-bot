import { Unit } from "../../unit/unit"
import { BotUtil } from "../bot.util"
import { ServiceProvider } from "../services.provider"
import { AccountWizard } from "./account.wizard"
import { NewUnitWizard } from "./new-unit.wizard"
import { UnitWizard } from "./unit-wizard"
import { WizardButton, WizardStep } from "./wizard"
import { WizBtn } from "./wizard-buttons"

export class TradeAmountWizard extends UnitWizard {

    constructor(unit: Unit, services: ServiceProvider) {
        super(unit, services)
    }

    private selectedSignalSource: string

    public getSteps(): WizardStep[] {

        return [{
            order: 0,
            message: [`Select signal source to change trade amount`],
            buttons: this.signalSourceButtons
        }, {
            order: 1,
            message: [`Provide USDT trade amount for signal source ${this.selectedSignalSource}`],
            backButton: true,
            process: async (input: string) => {
                const amount = Number(input)
                if (isNaN(amount)) {
                    return 2
                }
                if (amount < NewUnitWizard.USDT_MIN_LIMIT) {
                    return 3
                }
                this.unit.tradeAmounts.set(this.selectedSignalSource, amount)
                return 4
            }
        }, {
            order: 2,
            message: [`Its not a number!`],
            nextOrder: 1
        }, {
            order: 3, 
            message: [`Amount should be ${NewUnitWizard.USDT_MIN_LIMIT} USDT or more!`],
            nextOrder: 1
        }, {
            order: 4,
            message: [
                `Are you sure?`,
                `${this.unit?.tradeAmounts.get(this.selectedSignalSource)} USDT for ${this.selectedSignalSource}`
            ],
            buttons: [[{
                text: 'Yes',
                callback_data: WizBtn.YES,
                process: async () => {
                    const result = await this.services.unitService.updateTradeAmounts(this.unit)
                    return !!result ? 5 : 6
                }
            }, {
                text: 'No',
                callback_data: WizBtn.STOP,
                process: async () => {
                    return 6
                }
            }]]
        }, {
            order: 5,
            message: [`Successfully updated trade amount for ${this.selectedSignalSource}: ${this.unit?.tradeAmounts.get(this.selectedSignalSource)} USDT`],
            close: true
        }, {
            order: 6,
            message: [`Usdt per transaction is not changed!`],
            nextOrder: 1
        }]
    }

    private get signalSourceButtons(): WizardButton[][] {
        if (this.order !== 0) return []
        return [
            ...this.services.signalSourceService.signalSources.map(s => {
                return [{
                    text: `${s.name} ${this.unit.tradeAmounts.get(s.name)} USDT`,
                    callback_data: s.name,
                    process: async () => {
                        this.selectedSignalSource = s.name
                        return 1
                    }
                }]
            }),
            [BotUtil.getBackSwitchButton(AccountWizard.name)]
        ]
    }
}
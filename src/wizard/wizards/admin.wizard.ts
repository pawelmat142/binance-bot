import { SignalSource } from "../../binance/utils/variant-util"
import { TelegramMessage } from "../../telegram/message"
import { Unit } from "../../unit/unit"
import { BotUtil } from "../bot.util"
import { ServiceProvider } from "../services.provider"
import { AdminIncomesWizard } from "./admin-incomes.wizard"
import { StartWizard } from "./start.wizard"
import { UnitWizard } from "./unit-wizard"
import { WizardButton, WizardStep } from "./wizard"
import { WizBtn } from "./wizard-buttons"

export class AdminWizard extends UnitWizard {


    constructor(unit: Unit, services: ServiceProvider) {
        super(unit, services)
    }

    protected _init = async () => {}

    private error: string

    public getSteps(): WizardStep[] {
        return [{
            order: 0,
            message: [`ADMIN actions:`],
            buttons: [[{
                text: `Provide signal`,
                callback_data: WizBtn.signal,
                process: async () => 1,
            }], [{
                text: `Select providing signal source`,
                callback_data: 'signalsource',
                process: async () => 4
            }], [{
                text: `Users incomes`,
                callback_data: 'usersincomes',
                switch: AdminIncomesWizard.name
            }], [BotUtil.getBackSwitchButton(StartWizard.name)]],
        }, {
            order: 1,
            message: [`Provide signal message...`],
            backButton: true,
            process: async (input: string) => {
                const result = await this.services.signalService.onReceiveTelegramMessage({
                    message: input,
                    id: BotUtil.getRandomInt(1, 5000),
                    peer_id: { channel_id: this.unit.telegramChannelId }
                } as TelegramMessage)
                if (result.error) {
                    this.error = result.error
                    return 3
                }
                return 2
            },
        }, {            
            order: 2,
            message: ['Sent'],
            close: true
        }, {
            order: 3,
            message: [this.getErrorMessage()],
            close: true
        }, {
            order: 4,
            message: [
                `Currently your providing signal source is set to ${this.unit?.adminSignalSource}`,
            ],
            buttons: this.signalSourceSelectionButtons,
            backButton: true
        },{
            order: 5,
            message: [`Your providing signal source changed to ${this.unit?.adminSignalSource}`],
            close: true
        }]
    }

    private getErrorMessage() {
        if (this.error) {
            const msg = this.error
            delete this.error
            return msg
        }
        return 'Error'
    }

    private get signalSourceSelectionButtons(): WizardButton[][] {
        if (this.order !== 4) return []
        return this.services.signalSourceService.signalSources.map(s => {
            return [{
                text: s.name,
                callback_data: s.name,
                process: async () => {
                    this.unit.adminSignalSource = s.name
                    const success = await this.services.unitService.updateAdminSignalSource(this.unit)
                    if (!success.modifiedCount) {
                        this.error = `Modification error??`
                        return 3
                    }
                    return 5
                }
            }]
        })
    }

}
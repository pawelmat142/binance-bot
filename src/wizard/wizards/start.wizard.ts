import { Unit } from "src/unit/unit";
import { ServicesService } from "../services.service";
import { UnitWizard } from "./unit-wizard";
import { WizardStep } from "./wizard";
import { WizBtn } from "./wizard-buttons";
import { AmountWizard } from "./amount.wizard";
import { TradesWizard } from "./trades.wizard";
import { BotUtil } from "../bot.util";
import { LogsWizard } from "./logs.wizard";
import { AdminWizard } from "./admin.wizard";

export class StartWizard extends UnitWizard {

    constructor(unit: Unit, services: ServicesService) {
        super(unit, services)
    }

    public getSteps(): WizardStep[] {

        const stepZero: WizardStep = {
            order: 0,
            message: ['Actions:'],
            buttons: [[{
                text: `${this.unit?.active ? 'Deactivate' : 'Activate'} your subscription`,
                callback_data: this.unit?.active ? WizBtn.deactivate : WizBtn.activate,
                process: async () => {
                    const deactivationResult = await this.services.unitService.activation(this.unit?.identifier, !this.unit?.active)
                    if (deactivationResult) {
                        return this.unit?.active ? 1 : 2
                    }
                    return !!deactivationResult ? 1 : 0
                }
            }], [{
                text: 'USDT management',
                callback_data: WizBtn.amount,
                switch: AmountWizard.name
            }], [{
                text: 'Trades management',
                callback_data: WizBtn.trade,
                switch: TradesWizard.name
            }]]
        }

        if (BotUtil.isAdmin(this.unit?.telegramChannelId)) {
            stepZero.buttons.push([{
                text: 'logs',
                callback_data: WizBtn.log,
                switch: LogsWizard.name
            }])
            stepZero.buttons.push([{
                text: 'ADMIN',
                callback_data: WizBtn.admin,
                switch: AdminWizard.name
            }])
        }
        return [ stepZero, {
            order: 1,
            message: [` Subscription deactivated`],
            close: true,
        }, {
            order: 2,
            message: [` Subscription activated`],
            close: true,
        }]
    }


    // public getSteps(): WizardStep[] {
    //     const steps = [{
    //         order: 0,
    //         message: ['Actions:'],
    //         buttons: [{
    //             text: `${this.unit?.active ? 'Deactivate' : 'Activate'} your subscription`,
    //             callback_data: this.unit?.active ? WizBtn.deactivate : WizBtn.activate 
    //         }, { 
    //             text: 'USDT management',
    //             callback_data: WizBtn.amount 
    //         }, { 
    //             text: 'Trades management',
    //             callback_data: WizBtn.trade
    //         }, {
    //             text: 'Interrupt dialog',
    //             callback_data: 'stop'
    //         }],

    //         process: async (_input: string) => {
    //             switch (_input?.toLowerCase()) {
    //                 case WizBtn.deactivate:
    //                 if (!this.unit?.active) return 0
    //                 const deactivationResult = await this.services.unitService.activation(this.unit?.identifier, false)
    //                 return !!deactivationResult ? 1 : 0
                    
    //                 case WizBtn.activate: 
    //                     if (this.unit?.active) return 1
    //                     const activationResult = await this.services.unitService.activation(this.unit?.identifier, true)
    //                     return !!activationResult ? 2  : 0

    //                 case WizBtn.amount:
    //                     return BotUtil.switchResponse(AmountWizard.name)
                    
    //                 case WizBtn.log:
    //                     return BotUtil.switchResponse(LogsWizard.name)
                    
    //                 case WizBtn.trade:
    //                     return BotUtil.switchResponse(TradesWizard.name)
                    
    //                 case WizBtn.admin:
    //                     return BotUtil.isAdmin(this.unit.telegramChannelId)
    //                         ? BotUtil.switchResponse(AdminWizard.name)
    //                         : 0

    //                 default: return 0
    //             }
    //         }
    //     }, {
    //         order: 1,
    //         close: true,
    //         message: [` Subscription deactivated`]
    //     }, {
    //         order: 2,
    //         close: true,
    //         message: [` Subscription activated`]
    //     }]

    //     if (BotUtil.isAdmin(this.unit?.telegramChannelId)) {
    //         steps[0].buttons.push({
    //             text: 'logs',
    //             callback_data: WizBtn.log
    //         })
    //         steps[0].buttons.push({
    //             text: 'ADMIN',
    //             callback_data: WizBtn.admin
    //         })
    //     }

    //     return steps
    // }

}
import { Inject, Injectable, Logger } from '@nestjs/common';
import { BotMessage } from './bot-message';
import { BotUtil } from './bot.util';
import { BehaviorSubject, Subject } from 'rxjs';
import { Wizard, WizardStep } from './wizard';
import { NewUnitWizard } from './wizards/new-unit.wizard';
import { ServicesService } from './services.service';
import { UnitWizard } from './wizards/unit-wizard';
import { AmountWizard } from './wizards/amount.wizard';

export interface WizardResponse {
    chatId: number
    messages?: string[]
    stop?: boolean
    switch?: string //wizard class name
}

@Injectable()
export class WizardService {

    private readonly logger = new Logger(WizardService.name)

    constructor(
        private readonly service: ServicesService
    ) {}

    private readonly wizards$ = new BehaviorSubject<Wizard[]>([])


    public deactivateExpiredWizards(): number[] {
        const expiredWizardChatIds = this.wizards$.value
            .filter(BotUtil.isExpired).map(w => w.chatId)
        const wizards = this.wizards$.value
            .filter(w => !expiredWizardChatIds.includes(w.chatId))
        this.wizards$.next(wizards)
        return expiredWizardChatIds
    }


    public onMessage = async (message: BotMessage): Promise<WizardResponse> => {
        const chatId = message.chat.id
        if (!chatId) {
          this.logger.error('Chat id not found')
          return
        }

        let wizard = this.wizards$.value.find(w => w,chatId === chatId)
        if (!wizard) {
            wizard = await this.createWizard(chatId)
        }

        const response = await this.processWizardStep(wizard, message)

        if (response.switch) {
            this.stopWizard(wizard)
            wizard = this.switchWizard(response.switch, wizard)
            return await this.processWizardStep(wizard, message)
        }

        return response
    }

    private async processWizardStep(wizard: Wizard, message: BotMessage): Promise<WizardResponse> {
        const input = message.text
        if (!input) {
            return
        }

        if (input.toLowerCase() === 'stop') {
            this.stopWizard(wizard)
            return {
                messages: ['Dialog interrupted'],
                chatId: wizard.chatId
            }
        }

        var step = this.getStep(wizard)
        console.log(step)
        const response = message.text 
            ? await step.process(message.text)
            : step.order


        const messages = []
        if (typeof response === 'number') {
            wizard.order = response

        } else if (Array.isArray(response)) {
            const switchWizardName = this.getWizardNameIfSwitch(response, wizard)
            if (switchWizardName) {
                return { switch: switchWizardName, chatId: wizard.chatId }
            }

            messages.push(BotUtil.msgFrom(response))
        }

        step = this.getStep(wizard)
        if (step.message) {
            messages.push(BotUtil.msgFrom(step.message))
        }

        if (step.close) {
            this.stopWizard(wizard)
        }

        return {
            messages: messages,
            chatId: wizard.chatId,
        }
    }



    private getStep(wizard: Wizard): WizardStep {
        const step = wizard.getSteps().find(s => s.order === wizard.order)
        if (!step) {
            throw new Error(`Step not found! chatId: ${wizard.chatId}, order: ${wizard.order}`)
        }
        return step
    }

    private async createWizard(chatId: number): Promise<Wizard> {
        const unit = await this.service.unitService.findUnitByChatId(chatId)

        const wizard = !!unit 
            ? new UnitWizard(unit, this.service) 
            : new NewUnitWizard(chatId, this.service)

        const wizards = this.wizards$.value
        wizards.push(wizard)
        this.wizards$.next(wizards)
        return wizard
    }

    private stopWizard(wizard: Wizard) {
        const wizards = this.wizards$.value.filter(w => w.chatId !== wizard.chatId)
        this.wizards$.next(wizards)
        this.logger.log(`Stopped wizard ${wizard.chatId}`)
    }


    // SWITCH
    private getWizardNameIfSwitch(response: string[], currentWizard: Wizard): string {
        const split = response[0].split(' ')
        const isSwitch = split[0] === 'switch'
        if (isSwitch) {
            return split[1]
        }
        return null
    }
    
    private switchWizard(name: string, currentWizard: Wizard): Wizard {
        const wizard = this.selectSWitchWizard(name, currentWizard)
        const wizards = this.wizards$.value.filter(w => w.chatId === currentWizard.chatId)
        wizards.push(wizard)
        this.wizards$.next(wizards)
        return wizard
    }

    private selectSWitchWizard(name: string, currentWizard: Wizard): Wizard {
        switch (name) {
            case AmountWizard.name:
                return new AmountWizard(currentWizard.chatId, this.service)
            default: throw new Error('switch wizard error')
        }
    }

}

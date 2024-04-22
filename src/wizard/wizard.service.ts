import { Injectable, Logger } from '@nestjs/common';
import { BotUtil } from './bot.util';
import { BehaviorSubject } from 'rxjs';
import { Wizard, WizardStep } from './wizard';
import { NewUnitWizard } from './wizards/new-unit.wizard';
import { ServicesService } from './services.service';
import { UnitWizard } from './wizards/unit-wizard';
import { AmountWizard } from './wizards/amount.wizard';
import { LogsWizard } from './wizards/logs.wizard';
import { StartWizard } from './wizards/start.wizard';
import { TradesWizard } from './wizards/trades.wizard';
import { AdminWizard } from './wizards/admin.wizard';
import TelegramBot from 'node-telegram-bot-api';

export interface WizardResponse {
    chatId: number
    messages?: string[]
    stop?: boolean
    switch?: string //wizard class name
    html?: string,
    buttons?: TelegramBot.InlineKeyboardButton[]
    removeButtons?: boolean
}

export interface WizardResponseButton {
    name: string
    response?: string 
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


    public onBotMessage = async (message: TelegramBot.Message): Promise<WizardResponse> => {
        const chatId = message.chat.id
        if (!chatId) {
          this.logger.error('Chat id not found')
          return
        }

        let wizard = this.wizards$.value.find(w => w.chatId === chatId)
        if (!wizard) {
            return this.createWizard(chatId)
        }

        const response = await this.processWizardStep(wizard, message)

        if (response.switch && wizard instanceof UnitWizard) {
            this.stopWizard(wizard)
            wizard = this.switchWizard(response.switch, wizard) as UnitWizard
            await wizard.init()
            return await this.processWizardStep(wizard, message)
        }

        return response
    }

    private async processWizardStep(wizard: Wizard, message: TelegramBot.Message): Promise<WizardResponse> {
        const input = message.text
        if (!input) {
            return
        }
        wizard.modified = new Date()

        if (input.toLowerCase() === 'stop') {
            this.stopWizard(wizard)
            return {
                messages: ['Dialog interrupted'],
                chatId: wizard.chatId,
                removeButtons: true
            }
        }

        if (input.toLowerCase() === 'back') {
            wizard.order = 0
        }

        var step = this.getStep(wizard)
        const response = message.text 
            ? await step.process(message.text.toLowerCase())
            : step.order


        const messages = []
        if (typeof response === 'number') {
            wizard.order = response

        } else if (Array.isArray(response)) {
            const switchWizardName = this.getWizardNameIfSwitch(response)
            if (switchWizardName) {
                return { switch: switchWizardName, chatId: wizard.chatId }
            }

            messages.push(...response)
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
            html: step.html,
            buttons: step.buttons
        }
    }

    private getStep(wizard: Wizard): WizardStep {
        const step = wizard.getSteps().find(s => s.order === wizard.order)
        if (!step) {
            throw new Error(`Step not found! chatId: ${wizard.chatId}, order: ${wizard.order}`)
        }
        return step
    }

    private async createWizard(chatId: number): Promise<WizardResponse> {
        const wizard = await this.prepareWizard(chatId)
        const steps = wizard.getSteps()
        return {
            chatId: wizard.chatId,
            messages: steps[0].message,
            buttons: steps[0].buttons
        }
    }

    private async prepareWizard(chatId: number): Promise<Wizard> {
        const unit = await this.service.unitService.findUnitByChatId(chatId)

        const wizard = !!unit 
            ? new StartWizard(unit, this.service) 
            : new NewUnitWizard(chatId, this.service)
        
        await wizard.init()
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
    private getWizardNameIfSwitch(response: string[]): string {
        const first = response[0]
        if (typeof first === 'string') {
            const split = response[0].split(' ')
            const isSwitch = split[0] === 'switch'
            if (isSwitch) {
                return split[1]
            }
        }
        return null
    }
    
    private switchWizard(name: string, currentWizard: UnitWizard): UnitWizard {
        const wizard = this.selectSWitchWizard(name, currentWizard)
        const wizards = this.wizards$.value.filter(w => w.chatId === currentWizard.chatId)
        wizards.push(wizard)
        this.wizards$.next(wizards)
        return wizard
    }

    private selectSWitchWizard(name: string, currentWizard: UnitWizard): UnitWizard {
        switch (name) {
            case AmountWizard.name:
                return new AmountWizard(currentWizard.getUnit(), this.service)
            case LogsWizard.name:
                return new LogsWizard(currentWizard.getUnit(), this.service)
            case TradesWizard.name:
                return new TradesWizard(currentWizard.getUnit(), this.service)
            case AdminWizard.name:
                return new AdminWizard(currentWizard.getUnit(), this.service)
            default: throw new Error('switch wizard error')
        }
    }

}

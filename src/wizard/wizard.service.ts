import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import TelegramBot from "node-telegram-bot-api";
import { BehaviorSubject, Subscription } from "rxjs";
import { TelegramService } from "src/telegram/telegram.service";
import { BotUtil } from "./bot.util";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ServicesService } from "./services.service";
import { Wizard, WizardButton } from "./wizards/wizard";
import { StartWizard } from "./wizards/start.wizard";
import { WizBtn } from "./wizards/wizard-buttons";
import { AmountWizard } from "./wizards/amount.wizard";
import { UnitWizard } from "./wizards/unit-wizard";
import { TradesWizard } from "./wizards/trades.wizard";
import { AdminWizard } from "./wizards/admin.wizard";

@Injectable()
export class WizardService implements OnModuleInit, OnModuleDestroy {

    private readonly logger = new Logger(WizardService.name)

    constructor(
        private readonly telegramService: TelegramService,
        private readonly service: ServicesService,
    ) {}

    private readonly wizards$ = new BehaviorSubject<Wizard[]>([])


    private lastMessageWithButtonsId = {}

    private messageSubscription: Subscription
    private buttonSubscription: Subscription


    onModuleInit() {
        if (!this.messageSubscription) {
            this.messageSubscription = this.telegramService.messageObs$.subscribe({
                next: (message: TelegramBot.Message) => {
                    this.onBotMessage(message)
                }
            })
        }
        if (!this.buttonSubscription) {
            this.buttonSubscription = this.telegramService.buttonObs$.subscribe({
                next: (message: TelegramBot.CallbackQuery) => {
                    this.onBotButton(message)
                }
            })
        }
    }

    onModuleDestroy() {
        if (this.messageSubscription) {
            this.messageSubscription.unsubscribe()
            this.messageSubscription = null
        }
        if (this.buttonSubscription) {
            this.buttonSubscription.unsubscribe()
            this.buttonSubscription = null
        }
    }
    
    private async onBotButton(message: TelegramBot.CallbackQuery) {
        const chatId = message.from.id
        if (!chatId) {
          this.logger.error('Chat id not found')
          return
        }
        const input = message.data
        if (!input || input === WizBtn.AVOID_BUTTON_CALLBACK) {
            return
        }
        let wizard = await this.findOrCreateWizard(chatId)
        wizard.modified = new Date()

        await this.removeCallbackButtons(message)

        if (input === WizBtn.STOP) {
            this.stopWizard(wizard)
            return this.sendMessage(wizard.chatId, ['Dialog interrupted'], undefined)
        }

        let step = wizard.getStep()
        if (step.close) {
            this.stopWizard(wizard)
        } else if (input === WizBtn.BACK) {
            wizard.order = 0
            this.addStop(step.buttons)
        } else {
            this.addStopAndBack(step.buttons)
        }
        
        for (let btns of step.buttons) {
            for (let btn of btns) {
                if (btn.callback_data === message.data) {
                    if (btn.switch) {
                        this.stopWizard(wizard)
                        wizard = this.switchWizard(btn.switch, wizard as UnitWizard) as UnitWizard
                        await wizard.init()
                    } else if (btn.process) {
                        const order = await btn.process()
                        wizard.order = order
                    }
                    step = wizard.getStep()
                }
            }
        }

        if (step.close) {
            this.stopWizard(wizard)
        }
        this.sendMessage(chatId, step.message, step.buttons)
    }

    private async onBotMessage(message: TelegramBot.Message) {
        const chatId = message.chat.id
        if (!chatId) {
          this.logger.error('Chat id not found')
          return
        }
        const input = message.text.toLowerCase()
        if (!input) {
            return
        }
        let wizard = await this.findOrCreateWizard(chatId)
        wizard.modified = new Date()


        if (input === WizBtn.STOP) {
            this.stopWizard(wizard)
            return this.sendMessage(wizard.chatId, ['Dialog interrupted'], undefined)
        }

        let step = wizard.getStep()
        if (step.close) {
            this.stopWizard(wizard)
        } else if (input === WizBtn.BACK) {
            wizard.order = 0
            this.addStop(step.buttons)
        } else {
            this.addStopAndBack(step.buttons)
        }

        if (step.process) {
            const order = await step.process(input)
            wizard.order = order
            step = wizard.getStep()
        }
        const msg = step.message
        if (!isNaN(step.nextOrder)) {
            wizard.order = step.nextOrder
            step = wizard.getStep()
            msg.push('', ...step.message)
        }
        this.sendMessage(chatId, msg, step.buttons||[])
    }

    private async sendMessage(chatId: number, message: string[], buttons?: WizardButton[][]) {
        const options: TelegramBot.SendMessageOptions = {}
        buttons = buttons || []
        if (Array.isArray(buttons)) {
            options.reply_markup = {
                one_time_keyboard: true,
                inline_keyboard: buttons.map(btns => btns.map(btn => {
                    return btn as TelegramBot.InlineKeyboardButton
                })),
            }
        }
        const result = await this.telegramService.sendMessage(chatId, BotUtil.msgFrom(message), options)
        this.lastMessageWithButtonsId[result.chat.id] = result.message_id
    }

    private addStopAndBack(buttons: WizardButton[][]) {
        buttons = buttons || []
        buttons.push([{
            text: 'Back',
            callback_data: WizBtn.BACK
        }, {
            text: 'Stop',
            callback_data: WizBtn.STOP,
        }])
    }

    private addStop(buttons: WizardButton[][]) {
        buttons = buttons || []
        buttons.push([{
            text: 'Stop',
            callback_data: WizBtn.STOP,
        }])
    }

    private async findOrCreateWizard(chatId: number): Promise<Wizard> {
        let wizard = this.wizards$.value.find(w => w.chatId === chatId)
        if (!wizard) {
            wizard = await this.prepareWizard(chatId)
        }
        return wizard
    }

    private async prepareWizard(chatId: number): Promise<Wizard> {
        const unit = await this.service.unitService.findUnitByChatId(chatId)

        // TODO
        const wizard: Wizard = new StartWizard(unit, this.service)
        
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



    @Cron(CronExpression.EVERY_30_MINUTES)
    private async deactivateExpiredWizards() {
        const expiredWizardChatIds = this.wizards$.value
            .filter(BotUtil.isExpired).map(w => w.chatId)
        const wizards = this.wizards$.value
            .filter(w => !expiredWizardChatIds.includes(w.chatId))
        this.wizards$.next(wizards)
        expiredWizardChatIds.forEach(chatId => this.telegramService.sendMessage(chatId, 'Dialog expired!'))
    }


    private removeCallbackButtons(callback: TelegramBot.CallbackQuery): Promise<TelegramBot.Message | boolean> {
        const buttons = callback.message.reply_markup.inline_keyboard
        const newButtons = []
        buttons.forEach(btns => {
            btns.forEach(btn => {
                if (btn.callback_data === callback.data) {
                    btn.callback_data = WizBtn.AVOID_BUTTON_CALLBACK
                    newButtons.push([btn])
                }
            })
        })
        const chatId = callback.from.id
        return this.telegramService.removeChatButtons(chatId, this.lastMessageWithButtonsId[chatId], newButtons)
    }


    // SWITCH
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
            // case LogsWizard.name:
            //     return new LogsWizard(currentWizard.getUnit(), this.service)
            case TradesWizard.name:
                return new TradesWizard(currentWizard.getUnit(), this.service)
            case AdminWizard.name:
                return new AdminWizard(currentWizard.getUnit(), this.service)
            default: throw new Error('switch wizard error')
        }
    }

}
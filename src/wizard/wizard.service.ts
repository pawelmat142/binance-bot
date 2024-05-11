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

        const msgIdToRemoveButtons = this.lastMessageWithButtonsId[chatId]
        if (msgIdToRemoveButtons) {
            await this.removeCallbackButtons(message)
        }

        let wizard = await this.findOrCreateWizard(chatId)
        wizard.modified = new Date()

        let step = wizard.getStep()
        
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

        this.sendMessage(wizard, input)
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

        let step = wizard.getStep()

        if (step.process) {
            const order = await step.process(input)
            wizard.order = order
            step = wizard.getStep()
        }
        this.sendMessage(wizard, input)
    }


    private async sendMessage(wizard: Wizard, input: string) {
        let step = wizard.getStep()
        
        let msg = step.message

        if (!isNaN(step.nextOrder)) {
            wizard.order = step.nextOrder
            step = wizard.getStep()
            msg.push('', ...step.message)
        }
        if (step.close || input === WizBtn.STOP) {
            if (input === WizBtn.STOP) msg = ['Dialog interrupted']
            this.stopWizard(wizard)
            step.buttons = [[{
                text: `Start new dialog`,
                callback_data: WizBtn.START_NEW_DIALOG,
            }]]
        } else if (input === WizBtn.BACK || wizard.order === 0) {
            wizard.order = 0
            this.addStop(step.buttons)
        } else {
            this.addStopAndBack(step.buttons)
        }


        const options: TelegramBot.SendMessageOptions = {}
        let buttons = step.buttons || []
        if (Array.isArray(buttons)) {
            options.reply_markup = {
                one_time_keyboard: true,
                inline_keyboard: buttons.map(btns => btns.map(btn => {
                    return btn as TelegramBot.InlineKeyboardButton
                })),
            }
        }
        const result = await this.telegramService.sendMessage(wizard.chatId, BotUtil.msgFrom(msg), options)
        if (buttons.length) {
            this.lastMessageWithButtonsId[result.chat.id] = result.message_id
        }
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

        // TODO -> new unit wizard!!!
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
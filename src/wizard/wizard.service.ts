import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import TelegramBot from "node-telegram-bot-api";
import { BehaviorSubject, Subscription } from "rxjs";
import { BotUtil } from "./bot.util";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ServiceProvider } from "./services.provider";
import { Wizard } from "./wizards/wizard";
import { StartWizard } from "./wizards/start.wizard";
import { WizBtn } from "./wizards/wizard-buttons";
import { AccountWizard } from "./wizards/account.wizard";
import { UnitWizard } from "./wizards/unit-wizard";
import { TradesWizard } from "./wizards/trades.wizard";
import { AdminWizard } from "./wizards/admin.wizard";
import { LogsWizard } from "./wizards/logs.wizard";
import { NewUnitWizard } from "./wizards/new-unit.wizard";
import { TakeProfitsWizard } from "./wizards/take-profits.wizard";
import { TelegramService } from "../telegram/telegram.service";
import { IncomesWizard } from "./wizards/incomes.wizard";
import { AdminIncomesWizard } from "./wizards/admin-incomes.wizard";
import { TradeAmountWizard } from "./wizards/trade-amount.wizard";
import { TestWizard } from "./wizards/test-wizard";

@Injectable()
export class WizardService implements OnModuleInit, OnModuleDestroy {

    private readonly logger = new Logger(WizardService.name)

    constructor(
        private readonly telegramService: TelegramService,
        private readonly service: ServiceProvider,
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
        let input = message.data
        if (!input || input === WizBtn.AVOID_BUTTON_CALLBACK) {
            return
        }

        let wizard = await this.findOrCreateWizard(chatId)
        let step = wizard.getStep()

        const clickedButton = BotUtil.findClickedButton(step, message.data)
        await this.removeCallbackButtons(message)

        if (clickedButton) {
            if (clickedButton.switch) {
                this.stopWizard(wizard)
                wizard = this.switchWizard(clickedButton.switch, wizard as UnitWizard) as UnitWizard
                await wizard.init()
            } else if (clickedButton.process) {
                this.wizardLog(wizard, `processing...`)
                const order = await clickedButton.process()
                wizard.order = order
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
        const input = message.text
        if (!input) {
            return
        }
        let wizard = await this.findOrCreateWizard(chatId)
        let step = wizard.getStep()

        if (step.process) {
            const order = await step.process(input)
            wizard.order = order
        }
        this.sendMessage(wizard, input)
    }

    private async sendMessage(wizard: Wizard, _input: string) {
        const input = _input.toLowerCase()

        let step = wizard.getStep()
        
        let msg = step.message

        if (!isNaN(step.nextOrder)) {
            wizard.order = step.nextOrder
            step = wizard.getStep()
            msg.push('', ...step.message)
        }
        BotUtil.addBackBtnIfNeeded(step)
        if (step.close || input === WizBtn.STOP) {
            if (input === WizBtn.STOP) msg = ['Dialog interrupted']
            this.stopWizard(wizard)
        }
        const options: TelegramBot.SendMessageOptions = {}
        let buttons = step.buttons || []
        if (Array.isArray(buttons)) {
            options.reply_markup = {
                one_time_keyboard: true,
                inline_keyboard: buttons.map(btns => btns.map(btn => {
                    if (!btn.callback_data) {
                        btn.callback_data = btn.text
                    }
                    return btn as TelegramBot.InlineKeyboardButton
                })),
            }
        }
        if (!msg.length) {
            this.logger.warn(`empty message`)
            return
        }
        const result = await this.telegramService.sendMessage(wizard.chatId, BotUtil.msgFrom(msg), options)
        this.wizardLog(wizard, `message sent`)
        if (buttons.length) {
            this.lastMessageWithButtonsId[result.chat.id] = result.message_id
        }
        if (step.close) {
            this.startNewWizard(wizard.chatId)
        }
    }

    private async startNewWizard(chatId: number) {
        let wizard = await this.findOrCreateWizard(chatId)
        this.sendMessage(wizard, '')
    }


    private async findOrCreateWizard(chatId: number): Promise<Wizard> {
        this.telegramService.showTyping(chatId)
        let wizard = this.findWizard(chatId)
        if (!wizard) {
            wizard = await this.prepareWizard(chatId)
        }
        wizard.modified = new Date()
        return wizard
    }

    private findWizard(chatId: number): Wizard {
        return this.wizards$.value.find(w => w.chatId === chatId)
    }

    private async prepareWizard(chatId: number): Promise<Wizard> {
        const unit = await this.service.unitService.findUnitByChatId(chatId)
        const wizard: Wizard = unit 
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
        this.wizardLog(wizard, `stopped`)
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
        const chatId = callback.from.id

        const msgIdToRemoveButtons = this.lastMessageWithButtonsId[chatId]
        if (!msgIdToRemoveButtons) return

        const buttons = callback.message.reply_markup.inline_keyboard
        const newButtons = []
        buttons.forEach(btns => {
            btns.forEach(btn => {
                if (btn.callback_data === callback.data) {
                    btn.callback_data = WizBtn.AVOID_BUTTON_CALLBACK    //prevents process again same step action
                    newButtons.push([btn])
                }
            })
        })
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
            case AccountWizard.name:
                return new AccountWizard(currentWizard.getUnit(), this.service)

                // REFACTOR IN PROGRESS
            case TradesWizard.name:
                return new TradesWizard(currentWizard.getUnit(), this.service)

            case TestWizard.name:
                return new TestWizard(currentWizard.getUnit(), this.service)

            case AdminWizard.name:
                return new AdminWizard(currentWizard.getUnit(), this.service)
            case LogsWizard.name:
                return new LogsWizard(currentWizard.getUnit(), this.service)
            case TakeProfitsWizard.name:
                return new TakeProfitsWizard(currentWizard.getUnit(), this.service)
            case StartWizard.name:
                return new StartWizard(currentWizard.getUnit(), this.service)
            case IncomesWizard.name:
                return new IncomesWizard(currentWizard.getUnit(), this.service)
            case AdminIncomesWizard.name:
                return new AdminIncomesWizard(currentWizard.getUnit(), this.service)
            case TradeAmountWizard.name:
                return new TradeAmountWizard(currentWizard.getUnit(), this.service)
            default: throw new Error('switch wizard error')
        }
    }

    private wizardLog(wizard: Wizard, log: string) {
        const unitIdentifierLog = wizard instanceof UnitWizard ? ` [${wizard.getUnit().identifier}]` : ''
        this.logger.log(`[${wizard.constructor.name}]${unitIdentifierLog} step ${wizard.order}, chatId: ${wizard.chatId} - ${log}`)
    }

}
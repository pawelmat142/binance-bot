import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WizardResponse, WizardService } from './wizard.service';
import { TelegramMsg, TelegramService } from 'src/telegram/telegram.service';
import { Subscription } from 'rxjs';
import { Cron, CronExpression } from '@nestjs/schedule';
import TelegramBot = require("node-telegram-bot-api")
import { BotUtil } from './bot.util';
import { WizBtn } from './wizards/wizard-buttons';


@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {

    private readonly logger = new Logger(TelegramBotService.name)

    constructor(
        private readonly wizardService: WizardService,
        private readonly telegramService: TelegramService,
    ) {}

    private readonly channelId = process.env.TELEGRAM_CHANNEL_ID


    private readonly bot = this.initBot()

    private lastMessageWithButtonsId = {}


    onModuleInit() {
        if (process.env.SKIP_TELEGRAM !== 'true') {
            if (!this.messageListener) {
                this.messageListener = this.bot.on('message', this.onBotMessage)
            }
            if (!this.callbackListener) {
                this.callbackListener = this.bot.on('callback_query', this.onBotButton)
            }

            if (!this.subscription) {
                this.subscription = this.telegramService.messageObs$.subscribe({
                    next: (msg: TelegramMsg) => this.sendUnitMessage({
                        chatId: msg.chatId,
                        messages: [msg.message]
                    })
                })
            }
        }
    }

    private onBotButton = async (callback: TelegramBot.CallbackQuery) => {
        if (callback.data === WizBtn.AVOID_BUTTON_CALLBACK) {
            return
        }
        this.removeCallbackButtons(callback)
        this.onBotMessage(BotUtil.messageFromButtonCallback(callback))
    }

    private onBotMessage = async (message: TelegramBot.Message) => {
        this.logger.debug(message.text)
        const response = await this.wizardService.onBotMessage(message)
        if (response.removeButtons) {
            this.removeChatButtons(response.chatId)
        }
        if (!response.chatId) return
        this.sendUnitMessage(response)
    }

    onModuleDestroy() {
        if (this.messageListener) {
            this.messageListener = null
        }
        if (this.callbackListener) {
            this.callbackListener = null
        }
        if (this.subscription) {
            this.subscription.unsubscribe()
            this.subscription = null
        }
    }


    @Cron(CronExpression.EVERY_30_MINUTES)
    private async deactivateExpiredWizards() {
        this.wizardService.deactivateExpiredWizards()
            .forEach(chatId => this.sendUnitMessage({chatId: chatId, messages: ['Dialog expired!']}))
    }

    public async sendPublicMessage(msg: string) {
        await this.bot?.sendMessage(this.channelId, msg)
    }
  
    public async sendUnitMessage(response: WizardResponse) {
        const messages = response.html ? [response.html] : response.messages
        const options: TelegramBot.SendMessageOptions = {}
        if (response.html) {
            options.parse_mode = 'HTML'
        }
        if (response.buttons) {
            options.reply_markup = {
                one_time_keyboard: true,
                inline_keyboard: this.prepareInlineCallbackButtons(response),
            }
        }
        for (const message of messages) {
            const result = await this.bot?.sendMessage(response.chatId, message, options)
            if (response.buttons) {
                this.lastMessageWithButtonsId[result.chat.id] = result.message_id
            }
        }
    }

    private removeCallbackButtons(callback: TelegramBot.CallbackQuery) {
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

        this.removeChatButtons(callback.from.id, newButtons)
    }

    private removeChatButtons(chatId: number, buttons?: TelegramBot.InlineKeyboardButton[][]) {
        const messageId = this.lastMessageWithButtonsId[chatId]
        if (!messageId) { 
            return 
        }
        return this.bot.editMessageReplyMarkup({
            inline_keyboard: buttons ?? []
        }, {
            chat_id: chatId,
            message_id: messageId
        })

    }

    private prepareInlineCallbackButtons(response: WizardResponse): TelegramBot.InlineKeyboardButton[][] {
        return (response.buttons).map(btn => { return [{
            text: btn.text, 
            callback_data: btn.callback_data ?? btn.text,
        }] }) 
    }

    private messageListener: any
    private callbackListener: any

    private subscription: Subscription


    private initBot() {
        if (process.env.SKIP_TELEGRAM === 'true') {
        this.logger.debug('[SKIP] Initializing telegram bot')
        return undefined
        } else {
        this.logger.log('Initializing telegram bot')
        return new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true })
        }
    }
        

}

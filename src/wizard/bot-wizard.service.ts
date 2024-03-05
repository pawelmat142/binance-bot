import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BotMessage } from 'src/wizard/bot-message';
import { WizardService } from './wizard.service';
import { TelegramMsg, TelegramService } from 'src/telegram/telegram.service';
import { Subscription } from 'rxjs';
import { Cron, CronExpression } from '@nestjs/schedule';

const telegramBot = require('node-telegram-bot-api')


@Injectable()
export class BotWizardService implements OnModuleInit, OnModuleDestroy {

    private readonly logger = new Logger(BotWizardService.name)

    constructor(
        private readonly wizardService: WizardService,
        private readonly telegramService: TelegramService,
    ) {}

    private readonly channelId = process.env.TELEGRAM_CHANNEL_ID


    private readonly bot = this.initBot()

    @Cron(CronExpression.EVERY_30_MINUTES)
    private async deactivateExpiredWizards() {
        this.wizardService.deactivateExpiredWizards()
            .forEach(chatId => this.sendUnitMessage(chatId, 'Dialog expired!'))
    }


    public async sendPublicMessage(msg: string) {
        await this.bot?.sendMessage(this.channelId, msg)
    }
  
    public async sendUnitMessage(chatId: number, message: string) {
        await this.bot?.sendMessage(chatId, message)
    }

    private listener: any

    private subscription: Subscription


    onModuleInit() {
        if (!this.listener) {
            this.listener = this.bot.on('message', this.onBotMessage)
        }
        if (!this.subscription) {
            this.subscription = this.telegramService.messageObs$.subscribe({
                next: (msg: TelegramMsg) => this.sendUnitMessage(msg.chatId, msg.message)
            })
        }
    }

    onModuleDestroy() {
        if (this.listener) {
            this.listener = null
        }
        if (this.subscription) {
            this.subscription.unsubscribe()
            this.subscription = null
        }
    }


    private onBotMessage = async (message: BotMessage) => {
        this.logger.debug(message.text)

        const response = await this.wizardService.onBotMessage(message)
        if (!response.chatId) return

        for(let message of (response.messages || [])) {
            await this.sendUnitMessage(response.chatId, message)
        }
    }



    private initBot() {
        if (process.env.SKIP_TELEGRAM === 'true') {
        this.logger.debug('[SKIP] Initializing telegram bot')
        return undefined
        } else {
        this.logger.log('Initializing telegram bot')
        return new telegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true })
        }
    }
        

}

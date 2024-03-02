import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BotMessage } from './bot-message';
import { UnitService } from 'src/unit/unit.service';
import { Unit } from 'src/unit/unit';
import { BehaviorSubject } from 'rxjs';
import { BotWizard } from './wizards/bot-wizard';
import { NewUnitWizard } from './wizards/new-unit-wizard';
import { UnitWizard } from './wizards/unit-wizard';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BotUtil } from './bot.util';

const telegramBot = require('node-telegram-bot-api')

@Injectable()
export class BotService implements OnModuleInit {

  private readonly logger = new Logger(BotService.name)

  constructor(
    private readonly unitService: UnitService,
  ) {}

  private readonly wizards$ = new BehaviorSubject<BotWizard[]>([])

  private readonly bot = this.initBot()

  private readonly channelId = process.env.TELEGRAM_CHANNEL_ID
  
  private initBot() {
    if (process.env.SKIP_TELEGRAM === 'true') {
      this.logger.debug('[SKIP] Initializing telegram bot')
      return undefined
    } else {
      this.logger.log('Initializing telegram bot')
      return new telegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true })
    }
  }

  onModuleInit() {
    this.startListenForMessages()
  }

  public async sendPublicMessage(msg: string) {
      await this.bot?.sendMessage(this.channelId, msg)
  }

  public sendUnitMessage(chatId: number, message: string) {
    this.bot?.sendMessage(chatId, message)
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  private async deactivateExpiredWizards() {
    console.log('deactivateExpiredWizards')
    const expiredWizardChatIds = this.wizards$.value
      .filter(BotUtil.isExpired).map(w => w.chatId)
    this.sendMessageToExpiredWizardChats(expiredWizardChatIds)
    const wizards = this.wizards$.value.filter(w => expiredWizardChatIds.includes(w.chatId))
    this.wizards$.next(wizards)
  }

  get units(): Unit[] {
    return this.unitService.units
  }

  private startListenForMessages() {
    this.bot?.on('message', async (message: BotMessage) => {
      const chatId = message.chat.id
      if (!chatId) {
        this.logger.error('Chat id not found')
        return
      }
      const wizard = this.findWizard(chatId)
      // TODO mock
      // if (wizard) {
      if (false) {
        const response = await wizard.getResponse(message)
        for (let msg of response) {
          this.bot.sendMessage(wizard.chatId, msg)
        }
        this.stopWizardIfFinished(wizard)
      } else {
        this.newWizard(message)
      }

    })
  }

  private async newWizard(message: BotMessage) {
    const wizard = await this.createWizard(message.chat.id)
    const response = await wizard.getResponse(message, true)
    this.bot?.sendMessage(wizard.chatId, response[0])
  }

  private stopWizardIfFinished(wizard: BotWizard) {
    if (wizard.step.close) {
      this.stopWizard(wizard)
    }
  }

  private stopWizard(wizard: BotWizard) {
    const wizards = this.wizards$.value.filter(w => w.chatId !== wizard.chatId)
    this.wizards$.next(wizards)
    this.logger.log(`Stopped wizard ${wizard.chatId}`)
  }


  private findWizard(chatId: number): BotWizard | undefined {
    const result = this.wizards$.value.find(w => w.chatId === chatId)
    return result
  }

  private async createWizard(chatId: number): Promise<BotWizard> {
    let wizard: BotWizard
    const unit = await this.unitService.findUnitByChatId(chatId)
    if (unit) {
      wizard = new UnitWizard(unit, this.unitService)
    } else {
      wizard = new NewUnitWizard(chatId, this.unitService)
    }
    const wizards = this.wizards$.value
    wizards.push(wizard)
    this.wizards$.next(wizards)
    this.logger.debug(`New wizard created: ${wizard.chatId}`)
    return wizard
  }

  private sendMessageToExpiredWizardChats(expiredWizardChatIds: number[]) {
    expiredWizardChatIds.forEach(chatId => {
      this.sendUnitMessage(chatId, `Dialog expired`)
    })
  }

}



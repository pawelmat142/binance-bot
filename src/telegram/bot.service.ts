import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BotMessage } from './bot-message';
import { UnitService } from 'src/unit/unit.service';
import { Unit } from 'src/unit/unit';
import { BehaviorSubject } from 'rxjs';
import { BotWizard } from './wizards/bot-wizard';
import { NewUnitWizard } from './wizards/new-unit-wizard';

const telegramBot = require('node-telegram-bot-api')

@Injectable()
export class BotService implements OnModuleInit {

  private readonly logger = new Logger(BotService.name)

  constructor(
    private readonly unitService: UnitService
  ) {}

  private readonly wizards$ = new BehaviorSubject<BotWizard[]>([])


  onModuleInit() {
    this.startListenForMessages()
  }

  get units(): Unit[] {
    return this.unitService.units
  }

  get unitsChatIds(): number[] {
    return this.units
      .map(u => Number(u.telegramChannelId))
      .filter(chatId => !isNaN(chatId))
  }




  private startListenForMessages() {
    const token = process.env.TELEGRAM_BOT_TOKEN
    const bot = new telegramBot(token, { polling: true })
    bot.on('message', async (message: BotMessage) => {
      console.log(message)

      const chatId = message.chat.id
      if (!chatId) {
        this.logger.error('Chat id not found')
        return
      }

      if (this.isUnitMessage(chatId)) {
        this.logger.debug('in unit message')

      } else {
        const wizardOpened = this.findWizard(chatId)
        if (wizardOpened) {
          this.logger.debug('found wizardOpened')
          const response = await wizardOpened.getResponse(message)
          bot.sendMessage(wizardOpened.chatId, response)
        } else {
          this.logger.debug('creating new wizard')
          const wizard = this.createWizard(message.chat.id)
          const response = await wizard.getResponse(message, true)
          bot.sendMessage(wizard.chatId, response)
        }
      }
    })
  }


  private isUnitMessage(chatId: number): boolean {
    return this.unitsChatIds.includes(chatId)
  }

  private findWizard(chatId: number): BotWizard | undefined {
    const result = this.wizards$.value.find(w => w.chatId === chatId)
    return result
  }

  private createWizard(chatId: number): BotWizard {
    const wizard = new NewUnitWizard(chatId, this.unitService)
    const wizards = this.wizards$.value
    wizards.push(wizard)
    this.wizards$.next(wizards)
    return wizard
  }



}



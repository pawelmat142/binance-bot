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
    private readonly unitService: UnitService,
  ) {}

  private readonly wizards$ = new BehaviorSubject<BotWizard[]>([])

  private readonly bot = new telegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true })
    
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

  public sendUnitMessage(chatId: number, message: string) {
    this.bot.sendMessage(chatId, message)
  }


  private startListenForMessages() {
    this.bot.on('message', async (message: BotMessage) => {
      const chatId = message.chat.id
      if (!chatId) {
        this.logger.error('Chat id not found')
        return
      }
      const wizard = this.findWizard(chatId)
      if (wizard) {
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
    const wizard = this.createWizard(message.chat.id)
    const response = await wizard.getResponse(message, true)
    this.bot.sendMessage(wizard.chatId, response[0])
  }

  
  private stopWizardIfFinished(wizard: BotWizard) {
    if (wizard.getSteps().length === wizard.order+1) {
      this.stopWizard(wizard)
    }
  }

  private stopWizard(wizard: BotWizard) {
    const wizards = this.wizards$.value.filter(w => w.chatId !== wizard.chatId)
    this.wizards$.next(wizards)
    this.logger.log(`Stopped wizard ${wizard.chatId}`)
  }


  private isUnitMessage(chatId: number): boolean {
    return this.unitsChatIds.includes(chatId)
  }

  private findWizard(chatId: number): BotWizard | undefined {
    const result = this.wizards$.value.find(w => w.chatId === chatId)
    return result
  }

  private createWizard(chatId: number): BotWizard {
    let wizard: BotWizard
    // TODO mock
    // if (this.isUnitMessage(chatId)) {
      if (false) {
      throw new Error(`TODO unit wizard`)
    } else {
      wizard = new NewUnitWizard(chatId, this.unitService)
    }
    const wizards = this.wizards$.value
    wizards.push(wizard)
    this.wizards$.next(wizards)
    this.logger.debug(`New wizard created: ${wizard.chatId}`)
    return wizard
  }

}



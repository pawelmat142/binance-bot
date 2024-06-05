import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Decimal from 'decimal.js';
import { TradeStatus } from 'src/binance/model/trade';
import { TradeCtx } from 'src/binance/model/trade-variant';
import { BotUtil } from '../wizard/bot.util';
import { Observable, Subject } from 'rxjs';
import TelegramBot = require("node-telegram-bot-api")
import { TradeUtil } from 'src/binance/trade-util';

export interface TelegramMsg {
    message: string
    chatId: number
}

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {

    private readonly logger = new Logger(TelegramService.name)

    private readonly channelId = process.env.TELEGRAM_CHANNEL_ID

    private readonly bot = this.initBot()

    constructor() {}

    
    private messageListener: any
    private callbackListener: any

    private readonly messageSubject$: Subject<TelegramBot.Message> = new Subject<TelegramBot.Message>()
    private readonly buttonSubject$: Subject<TelegramBot.CallbackQuery> = new Subject<TelegramBot.CallbackQuery>()

    public get messageObs$(): Observable<TelegramBot.Message> {
        return this.messageSubject$.asObservable()
    }
    
    public get buttonObs$(): Observable<TelegramBot.CallbackQuery> {
        return this.buttonSubject$.asObservable()
    }


    private initBot() {
        if (process.env.SKIP_TELEGRAM === 'true') {
            this.logger.warn('[SKIP] Initializing telegram bot')
            return undefined
        } else {
            this.logger.log('Initializing telegram bot')
            return new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true })
        }
    }

    onModuleInit() {
        if (process.env.SKIP_TELEGRAM !== 'true') {
            if (!this.messageListener) {
                this.messageListener = this.bot.on('message', (message: TelegramBot.Message) => {
                    this.messageSubject$.next(message)
                })
            }
            if (!this.callbackListener) {
                this.callbackListener = this.bot.on('callback_query', (callback: TelegramBot.CallbackQuery) => {
                    this.buttonSubject$.next(callback)
                })
            }  
        }
    }

    onModuleDestroy() {
        if (this.messageListener) {
            this.messageListener = null
        }
        if (this.callbackListener) {
            this.callbackListener = null
        }
    }

    public async sendMessage(chatId: number, message: string, options?: TelegramBot.SendMessageOptions): Promise<TelegramBot.Message> {
        const result = await this.bot?.sendMessage(chatId, message, options)
        return result
    }

    public async showTyping(chatId: number): Promise<boolean> {
        return this.bot?.sendChatAction(chatId, 'typing')
    }

    public async sendPublicMessage(msg: string): Promise<TelegramBot.Message> {
        const result = await this.bot?.sendMessage(this.channelId, msg)
        return result
    }


    public async sendUnitMessage(ctx: TradeCtx, lines: string[]): Promise<void> {
        const chatId = Number(ctx.unit.telegramChannelId)
        if (isNaN(chatId)) {
            throw new Error(`Invalid chat id: ${chatId}`)
        }
        this.sendChatMessage(chatId, lines)
    }

    public removeChatButtons(chatId: number, messageId: number, buttons: TelegramBot.InlineKeyboardButton[][]) {
        if (!messageId) return
        return this.bot.editMessageReplyMarkup({
            inline_keyboard: buttons ?? []
        }, {
            chat_id: chatId,
            message_id: messageId
        })
    }


    public onClosedPosition(ctx: TradeCtx) {
        return this.sendUnitMessage(ctx, [
            `Closed position ${TradeUtil.label(ctx)}`
        ])
    }



    private async sendChatMessage(chatId: number, lines: string[]) {
        this.sendMessage(chatId, BotUtil.msgFrom(lines))
    }


    public onFilledPosition(ctx: TradeCtx) {
        const lines = [
            `${TradeUtil.label(ctx)} FILLED`,
            `entryPrice: ${this.print$(ctx.trade.entryPrice)}`,
            `${ctx.trade._id}`
        ]
        this.addStopLossLine(ctx, lines)
        this.addTakeProfitLines(ctx, lines)
        this.sendUnitMessage(ctx, lines)
    }

    private addStopLossLine(ctx: TradeCtx, lines: string[]) {
        const stopLoss = ctx.trade.stopLossResult
        if (stopLoss) {
            lines.push(`SL: ${this.print$(stopLoss.stopPrice)}, ${stopLoss.status}`)
        } else {
            lines.push(`STOP LOSS MISSING!`)
        }
    }


    public onFilledStopLoss(ctx: TradeCtx) {
        const lines = [
            `Filled stop loss ${TradeUtil.label(ctx)}`,
            `price: ${this.print$(ctx.trade.stopLossResult.averagePrice)}`,
            `take profits should be closed automatically`,
            `${ctx.trade._id}`
        ]
        this.sendUnitMessage(ctx, lines)
    }

    private addTakeProfitLines(ctx: TradeCtx, lines: string[]) {
        const tps = ctx.trade.variant.takeProfits
        if (tps.length) {
            for (let tp of tps) {
                if (tp.quantity) {
                    if (tp.reuslt) {
                        const realPercent = new Decimal(tp.reuslt.origQty).div(ctx.origQuantity).times(100).round()
                        lines.push(`- ${this.print$(tp.reuslt?.stopPrice)}, ${realPercent}%, ${tp.reuslt.status}`)
                    } else {
                        lines.push(`- ${this.print$(tp.price)}, waiting`)
                    }
                }
            }
        } else lines.push(`TP MISSING!`)
    }


    public onFilledTakeProfit(ctx: TradeCtx) {
        const lines = [
            `Filled TP ${TradeUtil.label(ctx)}`,
        ]
        this.addTakeProfitLines(ctx, lines)
        this.addStopLossLine(ctx, lines)
        const everyTpFilled = ctx.trade.variant.takeProfits
            .every(tp => tp.reuslt?.status === TradeStatus.FILLED)
        if (everyTpFilled) lines.push(`Position closed successfully!`)
        this.sendUnitMessage(ctx, lines)
    }


    public tradeErrorMessage(ctx: TradeCtx) {
        const logsLength = ctx.trade.logs.length
        const lines = [
            `!!! ERROR WHILE PROCESSING TRADE !!!`,
            `symbol: ${ctx.trade.variant.symbol}`,
            ctx.trade.logs[logsLength-1],
            ctx.trade.logs[logsLength-2],
            ctx.trade.logs[logsLength-3],
        ]
        return this.sendUnitMessage(ctx, lines)
    }


    private print$(input) {
        return `$${parseFloat(input)}`
    }

    private sendMessageToExpiredWizardChats(expiredWizardChatIds: number[]) {
        expiredWizardChatIds.forEach(chatId => {
          this.sendChatMessage(chatId, [`Dialog expired`])
        })
    }

}

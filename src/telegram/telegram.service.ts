import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { TradeStatus } from 'src/binance/model/trade';
import { TradeCtx } from 'src/binance/model/trade-variant';
import { Telegram } from 'telegraf';
import { BotUtil } from './bot.util';
import { BotService } from './bot.service';

@Injectable()
export class TelegramService {

    private readonly logger = new Logger(TelegramService.name)

    private readonly bot = new Telegram(process.env.TELEGRAM_BOT_TOKEN)

    private readonly channelId = process.env.TELEGRAM_CHANNEL_ID

    private readonly skipTelegram = process.env.SKIP_TELEGRAM === 'true'

    constructor(
        private readonly botService: BotService
    ) {}

    public async sendPublicMessage(msg: string) {
        if (this.skipTelegram) {
            return
        }
        await this.bot.sendMessage(this.channelId, msg)
    }

    public onFilledPosition(ctx: TradeCtx) {
        const lines = [
            `${ctx.side} ${ctx.symbol} FILLED`,
            `entryPrice: ${this.print$(ctx.trade.entryPrice)}`,
            // TODO temp
            `origQuantity: ${ctx.origQuantity}`,
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
            `Filled stop loss ${ctx.side} ${ctx.symbol}`,
            `price: ${this.print$(ctx.trade.stopLossResult.price)}`,
            `take profits should be closed automatically`,
            // TODO temp
            `origQuantity: ${ctx.trade.stopLossResult.origQty}`,
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
            `Filled TP ${ctx.side} ${ctx.symbol}`,
            // TODO temporary
            `${ctx.trade._id}`
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

    private async sendUnitMessage(ctx: TradeCtx, lines: string[]): Promise<void> {
        const chatId = Number(ctx.unit.telegramChannelId)
        if (isNaN(chatId)) {
            throw new Error(`Invalid chat id: ${chatId}`)
        }
        this.botService.sendUnitMessage(chatId, BotUtil.msgFrom(lines))
    }

    private print$(input) {
        return `$${parseFloat(input)}`
    }

}

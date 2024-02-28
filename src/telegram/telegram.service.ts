import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { TradeStatus } from 'src/binance/model/trade';
import { TradeUnit } from 'src/binance/model/trade-unit';
import { TakeProfit, TradeContext, TradeCtx } from 'src/binance/model/trade-variant';
import { TradeUtil } from 'src/binance/trade-util';
import { Telegram } from 'telegraf';

@Injectable()
export class TelegramService {

    private readonly logger = new Logger(TelegramService.name)

    private readonly bot = new Telegram(process.env.TELEGRAM_BOT_TOKEN)
    private readonly channelId = process.env.TELEGRAM_CHANNEL_ID

    private readonly skipTelegram = process.env.SKIP_TELEGRAM === 'true'

    public async sendMessage(msg: string){
        if (this.skipTelegram) {
            return
        }
        await this.bot.sendMessage(this.channelId, msg)
    }

    private async sendToBinanceBotChannel(lines: string[]): Promise<boolean> {
        const msg = (lines || []).reduce((acc, line) => acc + line + '\n', '')
        if (this.skipTelegram) {
            return
        }
        this.logger.log(`Sending message to public channel`)
        await this.bot.sendMessage(this.channelId, msg)
        // this.logger.log(response)
    }


    public onFilledPosition(ctx: TradeCtx) {
        const lines = [
            `Filled position ${ctx.side} ${ctx.symbol}`,
            `entryPrice: ${ctx.trade.entryPrice}$`,
        ]
        const stopLoss = ctx.trade.stopLossResult
        if (stopLoss) lines.push(`stop loss: ${stopLoss.stopPrice}$, ${stopLoss.status}`)
        else lines.push(`STOP LOSS MISSING!`)
        this.addTakeProfitLines(ctx, lines)
        this.sendToBinanceBotChannel(lines)
    }


    public onFilledStopLoss(ctx: TradeCtx) {
        const lines = [
            `Filled stop loss ${ctx.side} ${ctx.symbol}`,
            `price: ${parseFloat(ctx.trade.stopLossResult.price)}$`,
            `take profits should be closed automatically`
        ]
        this.sendToBinanceBotChannel(lines)
    }

    private addTakeProfitLines(ctx: TradeCtx, lines: string[]) {
        const tps = ctx.trade.variant.takeProfits
        if (tps.length) {
            lines.push(`Take profits:`)
            for (let tp of tps) {
                if (tp.quantity) {
                    if (tp.reuslt) {
                        const realPercent = new Decimal(tp.reuslt.origQty).div(ctx.executedQuantity).times(100).round()
                        lines.push(`n${tp.order} - ${parseFloat(tp.reuslt?.stopPrice)}$, ${realPercent}%, ${tp.reuslt.status}`)
                    } else {
                        lines.push(`n${tp.order} - ${tp.price}$, waiting`)
                    }
                }
            }
        } else lines.push(`TP MISSING!`)
    }


    public onFilledTakeProfit(ctx: TradeCtx) {
        const lastFilledTakeProfit = TradeUtil.lastFilledTakeProfit(ctx)
        // const realPercent = new Decimal(lastFilledTakeProfit.reuslt.origQty).div(ctx.executedQuantity).times(100).round()
        const lines = [
            `Filled TP ${ctx.side} ${ctx.symbol}, order ${lastFilledTakeProfit.order}`,
        ]
        this.addTakeProfitLines(ctx, lines)
        const everyTpFilled = ctx.trade.variant.takeProfits
            .every(tp => tp.reuslt?.status === TradeStatus.FILLED)
        if (everyTpFilled) lines.push(`Position closed successfully!`)
        this.sendToBinanceBotChannel(lines)
    }


    public tradeErrorMessage(ctx: TradeContext) {
        const logsLength = ctx.trade.logs.length
        const lines = [
            `!!! ERROR WHILE PROCESSING TRADE !!!`,
            `symbol: ${ctx.trade.variant.symbol}`,
            ctx.trade.logs[logsLength-1],
            ctx.trade.logs[logsLength-2],
            ctx.trade.logs[logsLength-3],
        ]
        return this.sendToBinanceBotChannel(lines)
    }

}

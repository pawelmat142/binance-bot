import { Injectable, Logger } from '@nestjs/common';
import { TradeUtil } from './trade-util';
import { getHeaders, queryParams, sign } from 'src/global/util';
import { isBinanceError } from './model/binance.error';
import { FuturesResult, TradeStatus } from './model/trade';
import { TradeCtx, TakeProfit, TradeContext } from './model/trade-variant';
import Decimal from 'decimal.js';
import { HttpMethod } from 'src/global/http-method';
import { TradeType } from './model/model';
import { TradeRepository } from './trade.repo';
import { TelegramService } from 'src/telegram/telegram.service';

@Injectable()
export class TradeService {

    private readonly logger = new Logger(TradeService.name)

    private readonly testNetwork = process.env.BINANCE_TEST_NETWORK === 'true'

    constructor(
        private readonly tradeRepo: TradeRepository,
        private readonly telegramService: TelegramService,
    ) {}

    public async openPosition(ctx: TradeCtx) {
        if (TradeUtil.priceInEntryZone(ctx)) {
            await this.tradeRequestMarket(ctx)
        } else {
            await this.tradeRequestLimit(ctx)
        }
        const status = ctx.trade.futuresResult?.status
        if ([TradeStatus.NEW, TradeStatus.FILLED].includes(status)) {
            TradeUtil.addLog(`Opened position for unit: ${ctx.unit.identifier} with status: ${status}, origQty: ${ctx.trade.futuresResult.origQty}`, ctx, this.logger)
        } else {
            TradeUtil.addError(`Wrong trade status! ${status}`, ctx, this.logger)
        }
    }

    private async tradeRequestMarket(ctx: TradeCtx): Promise<void> {
        const params = TradeUtil.tradeRequestMarketParams(ctx.trade)
        const result = await this.placeOrder(params, ctx)
        ctx.trade.timestamp = new Date()
        ctx.trade.futuresResult = result
        if (this.testNetwork) {
            ctx.trade.futuresResult.origQty = ctx.trade.quantity.toString()
            ctx.trade.futuresResult.status = 'FILLED'
        }
        this.verifyOrigQuantity(ctx)
    }

    private async tradeRequestLimit(ctx: TradeCtx): Promise<void> {
        const params = TradeUtil.tradeRequestLimitParams(ctx.trade)
        const result = await this.placeOrder(params, ctx)
        ctx.trade.timestamp = new Date()
        ctx.trade.futuresResult = result
        if (this.testNetwork) {
            ctx.trade.futuresResult.origQty = ctx.trade.quantity.toString()
            ctx.trade.futuresResult.status = 'NEW'
        }
        this.verifyOrigQuantity(ctx)
    }

    private verifyOrigQuantity(ctx: TradeCtx) {
        if (ctx.trade.futuresResult.status !== 'FILLED') {
            return
        }
        if (!ctx.origQuantity.equals(new Decimal(ctx.trade.quantity))) {
            TradeUtil.addWarning(`origQuantity ${ctx.origQuantity} != quantity ${ctx.trade.quantity}`, ctx, this.logger)
        }
    }

    public async stopLossRequest(ctx: TradeCtx, forcedPrice?: number): Promise<void> {
        if (!ctx.trade.variant.stopLoss) {
            return
        }
        const stopLossQuantity = TradeUtil.calculateStopLossQuantity(ctx)
        const stopLossPrice = isNaN(forcedPrice) ? TradeUtil.getStopLossPrice(ctx) : Number(forcedPrice)
        TradeUtil.addLog(`Calculated stop loss quantity: ${stopLossQuantity}, price: ${stopLossPrice}`, ctx, this.logger)

        const params = TradeUtil.stopLossRequestParams(ctx, stopLossQuantity, stopLossPrice)
        const result = await this.placeOrder(params, ctx)
        ctx.trade.stopLossTime = new Date()
        ctx.trade.stopLossResult = result

        if (this.testNetwork) {
            ctx.trade.stopLossResult.origQty = ctx.trade.quantity.toString()
            ctx.trade.stopLossResult.status = 'NEW'
        }
        TradeUtil.addLog(`Placed stop loss order with quantity: ${ctx.trade.stopLossResult.origQty}, price: ${stopLossPrice}`, ctx, this.logger)
    }


    public async moveStopLoss(ctx: TradeCtx, forcedPrice?: number): Promise<void> {
        await this.closeStopLoss(ctx)
        await new Promise(resolve => setTimeout(resolve, 3000))
        await this.stopLossRequest(ctx, forcedPrice)
    }


    public async closeStopLoss(ctx: TradeCtx): Promise<void> {
        const trade = ctx.trade
        const stopLossOrderId = trade.stopLossResult?.orderId
        if (!stopLossOrderId) {
            throw new Error(`Could not find SL with id: ${stopLossOrderId}, result in trade ${trade._id}`)
        }
        trade.stopLossResult = await this.closeOrder(ctx, stopLossOrderId)
        TradeUtil.addLog(`Closed stop loss with stopPrice: ${trade.stopLossResult.stopPrice}`, ctx, this.logger)
    }

    public async closePendingTakeProfit(ctx: TradeCtx) {
        const takeProfits = ctx.trade.variant.takeProfits
        for (let tp of takeProfits) {
            if (tp.reuslt?.status === TradeStatus.NEW) {
                tp.reuslt = await this.closeOrder(ctx, tp.reuslt.orderId)
                TradeUtil.addLog(`Closed take profit with order: ${tp.order}`, ctx, this.logger)
            }
        }
    }

    public async openNextTakeProfit(ctx: TradeCtx) {
        const takeProfits = ctx.trade.variant.takeProfits
        takeProfits.sort((a, b) => a.order - b.order)
        for (let tp of takeProfits) {
            if (!tp.reuslt && tp.quantity) {
                await this.takeProfitRequest(ctx, tp)
                return
            }
        }
    }

    public async takeSomeProfit(ctx: TradeCtx): Promise<boolean> {
        try {
            const takeProfits = ctx.trade.variant.takeProfits
            takeProfits.sort((a, b) => a.order - b.order)
            for (let i = takeProfits.length-1; i>=0; i--) {
                const tp = takeProfits[i]
                const quantity = Number(tp.quantity)
                if ((!tp.reuslt || tp.reuslt.status === TradeStatus.NEW) && quantity) {
                    if (tp.reuslt?.status === TradeStatus.NEW) {
                        await this.closePendingTakeProfit(ctx)
                    }
                    delete tp.reuslt
                    tp.takeSomeProfitFlag = true
                    const result = await this.takeSomeProfitRequest(ctx, tp)
                    result.status = TradeStatus.FILLED
                    result.executedQty = result.origQty
                    tp.reuslt = result
                    this.onFilledTakeSomeProfit(ctx)
                    return !!result
                }
            }
            return false
        } catch (error) {
            TradeUtil.addError(error.message, ctx, this.logger)
            return false
        }
    }

    private async onFilledTakeSomeProfit(ctx: TradeCtx) {
        if (TradeUtil.positionFullyFilled(ctx)) {
            await this.closeStopLoss(ctx)
            await this.closePendingTakeProfit(ctx)
            TradeUtil.addLog(`Every take profit filled, stop loss closed ${ctx.trade._id}`, ctx, this.logger)
            this.telegramService.onClosedPosition(ctx)
        } else {
            const stopLossPrice = Number(ctx.trade.stopLossResult?.stopPrice)
            await this.moveStopLoss(ctx, isNaN(stopLossPrice) ? undefined : stopLossPrice)
            TradeUtil.addLog(`Moved stop loss`, ctx, this.logger)
            this.telegramService.onFilledTakeProfit(ctx)
        }
        const saved = await this.tradeRepo.update(ctx)
    }


    private async takeSomeProfitRequest(ctx: TradeCtx, tp: TakeProfit): Promise<FuturesResult> {
        const params = queryParams({
            symbol: ctx.trade.variant.symbol,
            side: TradeUtil.opositeSide(ctx.trade.variant.side),
            type: TradeType.MARKET,
            quantity: Number(tp.quantity),
            timestamp: Date.now(),
            reduceOnly: true,
            recvWindow: TradeUtil.DEFAULT_REC_WINDOW
        })
        const result = await this.placeOrder(params, ctx)
        TradeUtil.addLog(`Took profit with order ${tp.order}, price: ${result.price}, unit: ${ctx.unit.identifier}, symbol: ${result.symbol}`, ctx, this.logger)
        return result
    }

    public closeOrder(ctx: TradeCtx, orderId: number): Promise<FuturesResult> {
        const params = queryParams({
            symbol: ctx.symbol,
            orderId: orderId,
            timestamp: Date.now(),
            timeInForce: 'GTC',
            recvWindow: TradeUtil.DEFAULT_REC_WINDOW
        })
        return this.placeOrder(params, ctx, 'DELETE')
    }

    public async setIsolatedMode(ctx: TradeCtx) {
        const params = queryParams({
            symbol: ctx.symbol,
            marginType: 'ISOLATED',
            timestamp: Date.now(),
            timeInForce: 'GTC',
            recvWindow: TradeUtil.DEFAULT_REC_WINDOW
        })
        const request = await fetch(this.signUrlWithParams(`/marginType`, ctx, params), {
            method: 'POST',
            headers: getHeaders(ctx.unit)
        })
        const response: FuturesResult = await request.json()
        TradeUtil.addLog(`Isolated mode set for: ${ctx.trade.variant.symbol}`, ctx, this.logger)
        return response
    }

    private async takeProfitRequest(ctx: TradeCtx, takeProfit: TakeProfit, forcedQuantity?: number): Promise<void> {
        const quantity = forcedQuantity ?? takeProfit.quantity
        if (this.takeProfitQuantitiesFilled(ctx) || !quantity) {
            return
        }
        const params = TradeUtil.takeProfitRequestParams(ctx, takeProfit.price, quantity)
        const result = await this.placeOrder(params, ctx)
        takeProfit.reuslt = result
        takeProfit.resultTime = new Date()
        if (this.testNetwork) {
            takeProfit.reuslt.executedQty = ctx.trade.quantity.toString()
            takeProfit.reuslt.status = 'NEW'
        }
        TradeUtil.addLog(`Placed take profit order for tp: ${takeProfit.order} with quantity: ${result.origQty}`, ctx, this.logger)
    }

    private takeProfitQuantitiesFilled(ctx: TradeCtx): boolean {
        if (ctx.origQuantity.equals(new Decimal(ctx.takeProfitOrigQuentitesSum))) {
            return true
        } else if (new Decimal(ctx.takeProfitQuentitesSum).greaterThan(ctx.origQuantity)) {
            throw new Error(`Take profit quantities sum > origQuantity`)
        }
        return false
    }


    public async setPositionLeverage(ctx: TradeCtx) {
        const lever = TradeUtil.getLever(ctx.trade).toNumber()
        const params = queryParams({
            symbol: ctx.symbol,
            leverage: lever,
            timestamp: Date.now(),
            timeInForce: 'GTC',
        })
        const url = this.signUrlWithParams(`/leverage`, ctx, params)
        const request = await fetch(url, {
            method: 'POST',
            headers: getHeaders(ctx.unit)
        })
        const response: FuturesResult = await request.json()
        if (isBinanceError(response)) {
            throw new Error(response.msg)
        }
        TradeUtil.addLog(`Leverage is set to ${lever}x for symbol: ${ctx.trade.variant.symbol}`, ctx, this.logger)
    } 


    public async placeOrder(params: string, ctx: TradeCtx, method?: HttpMethod): Promise<FuturesResult> {
        const path = this.testNetwork ? '/order/test' : '/order'
        const request = await fetch(this.signUrlWithParams(path, ctx, params), {
            method: method ?? 'POST',
            headers: getHeaders(ctx.unit)
        })
        const response: FuturesResult = await request.json()
        if (isBinanceError(response)) {
            throw new Error(response.msg)
        }
        return response
    }


    private signUrlWithParams(urlPath: string, tradeContext: TradeContext, params: string): string {
        const url = `${TradeUtil.futuresUri}${urlPath}`
        return sign(url, params, tradeContext.unit)
    }

}

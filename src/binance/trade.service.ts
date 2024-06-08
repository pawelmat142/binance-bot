import { Injectable, Logger } from '@nestjs/common';
import { TradeUtil } from './utils/trade-util';
import { FuturesResult, TradeStatus, TradeType } from './model/trade';
import { TradeCtx, TakeProfit, TradeContext } from './model/trade-variant';
import Decimal from 'decimal.js';
import { TradeRepository } from './trade.repo';
import { Position } from './wizard-binance.service';
import { CalculationsService } from './calculations.service';
import { BinanceErrors } from './model/binance.error';
import { Subject } from 'rxjs';
import { VariantUtil } from './utils/variant-util';
import { TPUtil } from './utils/take-profit-util';
import { TradeQuantityCalculator } from '../global/calculators/trade-quantity.calculator';
import { Http } from '../global/http/http.service';
import { HttpMethod } from '../global/type';
import { queryParams, getHeaders, sign } from '../global/util';
import { TelegramService } from '../telegram/telegram.service';
import { Unit } from '../unit/unit';

@Injectable()
export class TradeService {

    private readonly logger = new Logger(TradeService.name)

    private readonly testNetwork = process.env.BINANCE_TEST_NETWORK === 'true'

    constructor(
        private readonly tradeRepo: TradeRepository,
        private readonly telegramService: TelegramService,
        private readonly http: Http,
        private readonly calculationsService: CalculationsService,
    ) {}

    public closeOrderEvent$ = new Subject<string>()


    public async openPositionByMarket(ctx: TradeCtx): Promise<void> {
        const quantity = await TradeQuantityCalculator.start<number>(ctx, this.calculationsService)
        const params = TradeUtil.marketOrderParams(ctx.trade, quantity)
        const result = await this.placeOrder(params, ctx)
        ctx.trade.timestamp = new Date()
        ctx.trade.futuresResult = result
        TradeUtil.addLog(`Opened position with status: ${result.status}, origQty: ${ctx.trade.futuresResult.origQty}`, ctx, this.logger)
        if (!ctx.origQuantity.equals(new Decimal(quantity))) {
            TradeUtil.addWarning(`origQuantity ${ctx.origQuantity} != quantity ${quantity}`, ctx, this.logger)
        }
    }


    public async stopLossRequest(ctx: TradeCtx, forcedPrice?: number): Promise<void> {
        if (!ctx.trade.variant.stopLoss && !forcedPrice) {
            TradeUtil.addWarning(`STOP LOSS NOT PROVIDED!`, ctx, this.logger)
            return
        }
        const stopLossQuantity = TradeUtil.calculateStopLossQuantity(ctx)
        let stopLossPrice = isNaN(forcedPrice) ? TradeUtil.getStopLossPrice(ctx) : forcedPrice
        stopLossPrice = this.calculationsService.fixPricePrecision(stopLossPrice, this.calculationsService.getExchangeInfo(ctx.symbol)).toNumber()

        TradeUtil.addLog(`Calculated stop loss quantity: ${stopLossQuantity}, price: ${stopLossPrice}`, ctx, this.logger)

        const params = TradeUtil.stopLossRequestParams(ctx, stopLossQuantity, stopLossPrice)
        const result = await this.placeOrder(params, ctx)
        if (result) {
            ctx.trade.stopLossTime = new Date()
            ctx.trade.stopLossResult = result
            TradeUtil.addLog(`Placed stop loss order with quantity: ${ctx.trade.stopLossResult.origQty}, price: ${stopLossPrice}`, ctx, this.logger)
        } else {
            TradeUtil.addError(`Error placing stop loss order`, ctx, this.logger)
        }
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
            TradeUtil.addLog(`Could not find SL with id: ${stopLossOrderId}, result in trade ${trade._id}`, ctx, this.logger)
            return
        }
        trade.stopLossResult = await this.closeOrder(ctx, stopLossOrderId)
        TradeUtil.addLog(`Closed stop loss with stopPrice: ${trade.stopLossResult.stopPrice}`, ctx, this.logger)
    }

    public async closePendingTakeProfit(ctx: TradeCtx) {
        const takeProfits = ctx.trade.variant.takeProfits
        for (let tp of takeProfits) {
            if (tp.reuslt?.status === TradeStatus.NEW) {
                const tpOrderId = tp.reuslt.orderId
                tp.reuslt = null // delete result prevents triggers onFilledTakeProfit
                await this.tradeRepo.update(ctx)
                tp.reuslt = await this.closeOrder(ctx, tpOrderId)
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
            this.calculationsService.calculateSingleTakeProfitQuantityIfEmpty(ctx)
            const takeProfits = ctx.trade.variant.takeProfits
            takeProfits.sort((a, b) => a.order - b.order)
            for (let i = takeProfits.length-1; i >= 0; i--) {
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
            throw new Error(`Take profits are empty`)
        } catch (error) {
            this.handleError(error, `TAKE SOME PROFIT ERROR`, ctx)
            return false
        }
    }

    private async onFilledTakeSomeProfit(ctx: TradeCtx) {
        if (TPUtil.positionFullyFilled(ctx)) {
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
            side: VariantUtil.opositeSide(ctx.trade.variant.side),
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

    public closeOrder(ctx: TradeCtx, orderId: BigInt): Promise<FuturesResult> {
        const params = queryParams({
            symbol: ctx.symbol,
            orderId: orderId,
            timestamp: Date.now(),
            timeInForce: 'GTC',
            recvWindow: TradeUtil.DEFAULT_REC_WINDOW,
        })
        return this.placeOrder(params, ctx, 'DELETE')
    }

    public closeOrderEvent(ctx: TradeCtx) {
        this.closeOrderEvent$.next(ctx.symbol) // should stop Price Ticker if not needed anymore
    }

    public async setIsolatedMode(ctx: TradeCtx) {
        try {
            const params = queryParams({
                symbol: ctx.symbol,
                marginType: 'ISOLATED',
                timestamp: Date.now(),
                timeInForce: 'GTC',
                recvWindow: TradeUtil.DEFAULT_REC_WINDOW
            })
            await this.http.fetch<FuturesResult>({
                url: this.signUrlWithParams(`/marginType`, ctx, params),
                method: 'POST',
                headers: getHeaders(ctx.unit)
            })
            TradeUtil.addLog(`Isolated mode set for: ${ctx.trade.variant.symbol}`, ctx, this.logger)
        } catch (error) {
            const e = Http.handleFetchError(error)
            if (e.code === BinanceErrors.CHANGE_MODE) {
                TradeUtil.addWarning(e.msg, ctx, this.logger)
            } else {
                this.logger.error(e?.msg ?? error)
            }
        }
    }

    private async takeProfitRequest(ctx: TradeCtx, takeProfit: TakeProfit, forcedQuantity?: number): Promise<void> {
        const quantity = forcedQuantity ?? takeProfit.quantity
        TradeUtil.addLog(`Placing Take Profit order: ${takeProfit.order} with quantity: ${quantity}`, ctx, this.logger)
        if (this.takeProfitQuantitiesFilled(ctx) || !quantity) {
            return
        }
        const params = TradeUtil.takeProfitRequestParams(ctx, takeProfit.price, quantity)
        const result = await this.placeOrder(params, ctx)
        takeProfit.reuslt = result
        takeProfit.resultTime = new Date()
    }

    private takeProfitQuantitiesFilled(ctx: TradeCtx): boolean {
        if (ctx.origQuantity.equals(new Decimal(ctx.takeProfitOrigQuentitesSum))) {
            return true
        } else if (new Decimal(TPUtil.takeProfitsFilledQuantitySum(ctx.trade)).greaterThan(ctx.origQuantity)) {
            throw new Error(`Take profit quantities sum > origQuantity`)
        }
        return false
    }


    public async setPositionLeverage(ctx: TradeCtx) {
        const lever = ctx.lever
        const params = queryParams({
            symbol: ctx.symbol,
            leverage: lever,
            timestamp: Date.now(),
            timeInForce: 'GTC',
        })
        const response = await this.http.fetch({
            url: this.signUrlWithParams(`/leverage`, ctx, params),
            method: 'POST',
            headers: getHeaders(ctx.unit)
        })
        TradeUtil.addLog(`Leverage is set to ${lever}x for symbol: ${ctx.trade.variant.symbol}`, ctx, this.logger)
    } 

    public placeOrder(params: string, ctx: TradeCtx, method?: HttpMethod): Promise<FuturesResult> {
        const path = this.testNetwork ? '/order/test' : '/order'
        return this.http.fetch<FuturesResult>({
            url: this.signUrlWithParams(path, ctx, params),
            method: method ?? 'POST',
            headers: getHeaders(ctx.unit)
        })
    }

    public placeOrderByUnit(params: string, unit: Unit, method?: HttpMethod): Promise<FuturesResult> {
        const path = this.testNetwork ? '/order/test' : '/order'
        return this.http.fetch<FuturesResult>({
            url: this.signUrlWithParamsAndUnit(path, unit, params),
            method: method ?? 'POST',
            headers: getHeaders(unit)
        })
    }

    public async closePosition(ctx: TradeCtx): Promise<FuturesResult> {
        try {
            const position = ctx.position ?? await this.fetchPosition(ctx)
            const params = queryParams({
                symbol: ctx.symbol,
                side: VariantUtil.opositeSide(ctx.side),
                type: TradeType.MARKET,
                quantity: Number(position.positionAmt),
                reduceOnly: true,
                timestamp: Date.now()
            })
            return this.placeOrder(params, ctx, 'POST')
        } catch (error) {
            this.handleError(error, `CLOSE POSITION ERROR`, ctx)
            return null
        }
    }

    private async fetchPosition(ctx: TradeCtx): Promise<Position> {
        try {
            const params = queryParams({
                timestamp: Date.now(),
                symbol: ctx.trade.variant.symbol
            })
            const response = await this.http.fetch<Position[]>({
                url: sign(`${TradeUtil.futuresUriV2}/positionRisk`, params, ctx.unit),
                method: `GET`,
                headers: getHeaders(ctx.unit)
            })
            if (!(response || []).length) {
                throw new Error(`Could not fetch position ${VariantUtil.label(ctx.trade.variant)}`)
            }
            return response[0] as Position
        } catch (error) {
            this.handleError(error, `FETCH SINGLE POSITIONS ERROR`, ctx)
            return null
        }
    }

    public async fetchPositions(unit: Unit): Promise<Position[]> {
        try {
            const params = queryParams({
                timestamp: Date.now()
            })
            const trades = await this.http.fetch<Position[]>({
                url: sign(`${TradeUtil.futuresUriV2}/positionRisk`, params, unit),
                method: 'GET',
                headers: getHeaders(unit)
            })
            this.logger.log(`fetched ${trades.length} positions`)
            if (trades.length >= 500) {
                throw new Error(`limit exceeded /positionRisk`)
            }
            return trades
        } catch (error) {
            this.handleError(error, `FETCH POSITIONS ERROR`)
            return []
        }
    }

    public async fetchOpenOrders(unit: Unit, symbol?: string): Promise<FuturesResult[]> {
        try {
            const params = {
                timestamp: Date.now()
            }
            if (symbol) {
                params['symbol'] = symbol
            }
            const result = await this.http.fetch<FuturesResult[]>({
                url: sign(`${TradeUtil.futuresUri}/openOrders`, queryParams(params), unit),
                method: 'GET',
                headers: getHeaders(unit)
            })
            return result
        } catch (error) {
            this.handleError(error, `FETCH OPEN ORDERS ERROR`)
            return []
        }
    }

    private signUrlWithParams(urlPath: string, tradeContext: TradeContext, params: string): string {
        return this.signUrlWithParamsAndUnit(urlPath, tradeContext.unit, params)
    }
    
    private signUrlWithParamsAndUnit(urlPath: string, unit: Unit, params: string): string {
        const url = `${TradeUtil.futuresUri}${urlPath}`
        return sign(url, params, unit)
    }

    private handleError(error, msg?: string, ctx?: TradeCtx) {
        const errorMessage = Http.handleErrorMessage(error)
        if (ctx) {
            if (msg) {
                TradeUtil.addError(msg, ctx, this.logger)
            } else {
                TradeUtil.addError(errorMessage, ctx, this.logger)
            }
        } else {
            this.logger.error(errorMessage)
        }
    }

}

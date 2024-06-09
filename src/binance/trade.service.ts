import { Injectable, Logger } from '@nestjs/common';
import { TradeUtil } from './utils/trade-util';
import { FuturesResult, TradeType } from './model/trade';
import { TradeCtx, TradeContext } from './model/trade-variant';
import Decimal from 'decimal.js';
import { TradeRepository } from './trade.repo';
import { Position } from './wizard-binance.service';
import { CalculationsService } from './calculations.service';
import { BinanceErrors } from './model/binance.error';
import { Subject } from 'rxjs';
import { VariantUtil } from './utils/variant-util';
import { TradeQuantityCalculator } from '../global/calculators/trade-quantity.calculator';
import { Http } from '../global/http/http.service';
import { HttpMethod } from '../global/type';
import { TelegramService } from '../telegram/telegram.service';
import { Unit } from '../unit/unit';
import { CalcUtil } from './utils/calc-util';
import { Util } from './utils/util';

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
        ctx.trade.marketResult = result
        TradeUtil.addLog(`Opened position with status: ${result.status}, origQty: ${ctx.trade.marketResult.origQty}`, ctx, this.logger)
        if (!ctx.marketFilledQuantity.equals(new Decimal(quantity))) {
            TradeUtil.addWarning(`origQuantity ${ctx.marketFilledQuantity} != quantity ${quantity}`, ctx, this.logger)
        }
    }


    public async stopLossRequest(ctx: TradeCtx, forcedPrice?: number): Promise<void> {
        if (!ctx.trade.variant.stopLoss && !forcedPrice) {
            TradeUtil.addWarning(`STOP LOSS NOT PROVIDED!`, ctx, this.logger)
            return
        }

        // TODO stop loss calculator
        const stopLossQuantity = TradeUtil.calculateStopLossQuantity(ctx)
        let stopLossPrice = isNaN(forcedPrice) ? TradeUtil.getStopLossPrice(ctx) : forcedPrice
        stopLossPrice = CalcUtil.fixPricePrecision(stopLossPrice, this.calculationsService.getExchangeInfo(ctx.symbol)).toNumber()
        // 

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

    public closeOrder(ctx: TradeCtx, orderId: BigInt): Promise<FuturesResult> {
        let params = TradeUtil.closeOrderParams(orderId, ctx.symbol)
        params = TradeUtil.removeMultiOrderProperties(params)
        return this.placeOrder(params, ctx, 'DELETE')
    }

    public closeOrderEvent(ctx: TradeCtx) {
        this.closeOrderEvent$.next(ctx.symbol) // should stop Price Ticker if not needed anymore
    }

    public async setIsolatedMode(ctx: TradeCtx) {
        try {
            const params = {
                symbol: ctx.symbol,
                marginType: 'ISOLATED',
                timestamp: Date.now(),
                timeInForce: 'GTC',
                recvWindow: TradeUtil.DEFAULT_REC_WINDOW
            }
            await this.http.fetch<FuturesResult>({
                url: this.signUrlWithParams(`/marginType`, ctx, params),
                method: 'POST',
                headers: Util.getHeaders(ctx.unit)
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

    public async setPositionLeverage(ctx: TradeCtx) {
        const lever = ctx.lever
        const params = {
            symbol: ctx.symbol,
            leverage: lever,
            timestamp: Date.now(),
            timeInForce: 'GTC',
        }
        const response = await this.http.fetch({
            url: this.signUrlWithParams(`/leverage`, ctx, params),
            method: 'POST',
            headers: Util.getHeaders(ctx.unit)
        })
        TradeUtil.addLog(`Leverage is set to ${lever}x for symbol: ${ctx.trade.variant.symbol}`, ctx, this.logger)
    } 

    public placeOrder(params: Object, ctx: TradeCtx, method?: HttpMethod): Promise<FuturesResult> {
        const path = this.testNetwork ? '/order/test' : '/order'
        return this.http.fetch<FuturesResult>({
            url: this.signUrlWithParams(path, ctx, params),
            method: method ?? 'POST',
            headers: Util.getHeaders(ctx.unit)
        })
    }

    public placeOrderByUnit(params: Object, unit: Unit, method?: HttpMethod): Promise<FuturesResult> {
        const path = this.testNetwork ? '/order/test' : '/order'
        return this.http.fetch<FuturesResult>({
            url: this.signUrlWithParamsAndUnit(path, unit, params),
            method: method ?? 'POST',
            headers: Util.getHeaders(unit)
        })
    }

    public async closePosition(ctx: TradeCtx): Promise<FuturesResult> {
        try {
            const position = ctx.position ?? await this.fetchPosition(ctx)
            const params = {
                symbol: ctx.symbol,
                side: VariantUtil.opositeSide(ctx.side),
                type: TradeType.MARKET,
                quantity: Number(position.positionAmt),
                reduceOnly: true,
                timestamp: Date.now()
            }
            return this.placeOrder(params, ctx, 'POST')
        } catch (error) {
            this.handleError(error, `CLOSE POSITION ERROR`, ctx)
            return null
        }
    }

    private async fetchPosition(ctx: TradeCtx): Promise<Position> {
        try {
            const params = {
                timestamp: Date.now(),
                symbol: ctx.trade.variant.symbol
            }
            const response = await this.http.fetch<Position[]>({
                url: Util.sign(`${TradeUtil.futuresUriV2}/positionRisk`, params, ctx.unit),
                method: `GET`,
                headers: Util.getHeaders(ctx.unit)
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
            const trades = await this.http.fetch<Position[]>({
                url: Util.sign(`${TradeUtil.futuresUriV2}/positionRisk`, { timestamp: Date.now() }, unit),
                method: 'GET',
                headers: Util.getHeaders(unit)
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
                url: Util.sign(`${TradeUtil.futuresUri}/openOrders`, params, unit),
                method: 'GET',
                headers: Util.getHeaders(unit)
            })
            return result
        } catch (error) {
            this.handleError(error, `FETCH OPEN ORDERS ERROR`)
            return []
        }
    }

    private signUrlWithParams(urlPath: string, tradeContext: TradeContext, params: Object): string {
        return this.signUrlWithParamsAndUnit(urlPath, tradeContext.unit, params)
    }
    
    private signUrlWithParamsAndUnit(urlPath: string, unit: Unit, params: Object): string {
        const url = `${TradeUtil.futuresUri}${urlPath}`
        return Util.sign(url, params, unit)
    }

    public handleError(error, msg?: string, ctx?: TradeCtx) {
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

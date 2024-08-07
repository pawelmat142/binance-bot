import { Injectable, Logger } from '@nestjs/common';
import { TradeUtil } from './utils/trade-util';
import { FuturesResult, TradeType } from './model/trade';
import { TradeCtx, TradeContext } from './model/trade-variant';
import Decimal from 'decimal.js';
import { Position } from './wizard-binance.service';
import { CalculationsService } from './calculations.service';
import { BinanceErrors } from './model/binance.error';
import { Subject } from 'rxjs';
import { VariantUtil } from './utils/variant-util';
import { TradeQuantityCalculator } from '../global/calculators/trade-quantity.calculator';
import { Http } from '../global/http/http.service';
import { HttpMethod } from '../global/type';
import { Unit } from '../unit/unit';
import { Util } from './utils/util';
import { StopLossCalculator } from '../global/calculators/stop-loss.calculator';
import { PlaceOrderParams } from './model/model';
import { TradeRepository } from './trade.repo';

@Injectable()
export class TradeService {

    private readonly logger = new Logger(TradeService.name)

    private readonly testNetwork = process.env.BINANCE_TEST_NETWORK === 'true'

    constructor(
        private readonly http: Http,
        private readonly calculationsService: CalculationsService,
        private readonly tradeRepo: TradeRepository,
    ) {}

    public closeOrderEvent$ = new Subject<string>()


    public async openPositionByMarket(ctx: TradeCtx): Promise<void> {
        const quantity = await TradeQuantityCalculator.start<number>(ctx, this.calculationsService)
        const params = TradeUtil.marketOrderParams(ctx, quantity)
        const result = await this.placeOrder(params, ctx.unit)
        ctx.trade.timestamp = new Date()
        ctx.trade.marketResult = result
        TradeUtil.addLog(`Opened position with status: ${result.status}, origQty: ${ctx.trade.marketResult.origQty}`, ctx, this.logger)
        if (!ctx.marketFilledQuantity.equals(new Decimal(quantity))) {
            TradeUtil.addWarning(`origQuantity ${ctx.marketFilledQuantity} != quantity ${quantity}`, ctx, this.logger)
        }
    }

    public async placeStopLoss(ctx: TradeCtx, forcedPrice?: number): Promise<void> {
        const params = await StopLossCalculator.start<PlaceOrderParams>(ctx, this.calculationsService, forcedPrice ? { forcedPrice } : undefined)
        if (!params) {
            return
        }
        const result = await this.placeOrder(params, ctx.unit)
        if (result) {
            ctx.trade.stopLossTime = new Date()
            ctx.trade.stopLossResult = result
            TradeUtil.addLog(`Placed stop loss order with quantity: ${ctx.trade.stopLossResult.origQty}, price: ${result.stopPrice}`, ctx, this.logger)
        } else {
            TradeUtil.addError(`Error placing stop loss order`, ctx, this.logger)
        }
    }

    public async moveStopLoss(ctx: TradeCtx, forcedPrice?: number): Promise<void> {
        await this.closeStopLoss(ctx)
        await new Promise(resolve => setTimeout(resolve, 3000))
        await this.placeStopLoss(ctx, forcedPrice)
    }

    public async closeStopLoss(ctx: TradeCtx): Promise<void> {
        const trade = ctx.trade
        const stopLossClientOrderId = trade.stopLossResult?.clientOrderId
        if (!stopLossClientOrderId) {
            TradeUtil.addWarning(`Not found Stop Loss clientOrderId ${stopLossClientOrderId}, result in trade ${trade._id}`, ctx, this.logger)
            return
        }
        trade.stopLossResult = await this.closeOrder(ctx.unit, ctx.symbol, stopLossClientOrderId)
        TradeUtil.addLog(`Closed stop loss with stopPrice: ${trade.stopLossResult.stopPrice}`, ctx, this.logger)
    }

    public async closeOrder(unit: Unit, symbol: string,  clientOrderId: string): Promise<FuturesResult> {
        const params = TradeUtil.closeOrderParams(clientOrderId, symbol)
        const result = await this.placeOrder(params, unit, 'DELETE')
        return result
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
                url: this.signUrlWithParams(`/marginType`, ctx.unit, params),
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
            url: this.signUrlWithParams(`/leverage`, ctx.unit, params),
            method: 'POST',
            headers: Util.getHeaders(ctx.unit)
        })
        TradeUtil.addLog(`Leverage is set to ${lever}x for symbol: ${ctx.trade.variant.symbol}`, ctx, this.logger)
    } 

    public async placeOrder(params: Object, unit: Unit, method?: HttpMethod): Promise<FuturesResult> {
        const path = this.testNetwork ? '/order/test' : '/order'
        const result = await this.http.fetch<FuturesResult>({
            url: this.signUrlWithParams(path, unit, params),
            method: method ?? 'POST',
            headers: Util.getHeaders(unit)
        })
        return result
    }

    public async placeOrderByUnit(params: Object, unit: Unit, method?: HttpMethod): Promise<FuturesResult> {
        const path = this.testNetwork ? '/order/test' : '/order'
        const result = await this.http.fetch<FuturesResult>({
            url: this.signUrlWithParamsAndUnit(path, unit, params),
            method: method ?? 'POST',
            headers: Util.getHeaders(unit)
        })
        return result
    }

    public async closeTrades(ctx: TradeCtx) {
        const trades = await this.tradeRepo.findBySymbol(ctx.unit, ctx.symbol)
        TradeUtil.addLog(`Found ${trades.length} open trades`, ctx, this.logger)
        
        for (let trade of trades) {
            await this.tradeRepo.closeTradeManual(ctx)
            TradeUtil.addLog(`Closed trade: ${trade._id}`, ctx, this.logger)
        }
    }

    public async closePosition(ctx: TradeCtx): Promise<FuturesResult> {
        try {
            const position = ctx.position ?? await this.fetchPosition(ctx)
            const amount = Number(position.positionAmt)
            if (!amount) {
                TradeUtil.addLog(`Position empty`, ctx, this.logger)
                return null
            }
            const params = {
                symbol: ctx.symbol,
                side: VariantUtil.opositeSide(ctx.side),
                type: TradeType.MARKET,
                quantity: Number(position.positionAmt),
                reduceOnly: true,
                timestamp: Date.now()
            }
            const result = await this.placeOrder(params, ctx.unit, 'POST')
            return result
        } catch (error) {
            this.handleError(error, `CLOSE POSITION ERROR`, ctx)
            return null
        }
    }

    public async closePositionBy(position: Position, unit: Unit): Promise<FuturesResult> {
        const amount = Number(position.positionAmt)
        const side = amount < 0 ? 'BUY' : 'SELL'
        const params = {
            symbol: position.symbol,
            side: side,
            type: TradeType.MARKET,
            quantity: amount.toString(),
            timestamp: Date.now(),
            reduceOnly: true,
        }
        return this.placeOrder(params, unit, 'POST')
    }

    public async fetchPosition(ctx: TradeCtx): Promise<Position> {
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

    private signUrlWithParams(urlPath: string, unit: Unit, params: Object): string {
        return this.signUrlWithParamsAndUnit(urlPath, unit, params)
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

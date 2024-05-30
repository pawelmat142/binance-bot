import { queryParams, toDateString } from "src/global/util"
import { Logger } from "@nestjs/common"
import { FuturesResult, Trade, TradeStatus } from "./model/trade"
import { SignalMode } from "src/signal/signal-validator"
import { TradeEventData, TradeSide, TradeType } from "./model/model"
import { TakeProfit, TradeCtx } from "./model/trade-variant"
import Decimal from "decimal.js"
import { Position } from "./wizard-binance.service"


export abstract class TradeUtil {

    public static readonly futuresUri = 'https://fapi.binance.com/fapi/v1'
    public static readonly futuresUriV2 = 'https://fapi.binance.com/fapi/v2'

    public static readonly apiUri = 'https://api.binance.com/api/v3'

    public static readonly DEFAULT_LEVER = 5

    public static readonly DEFAULT_REC_WINDOW = 50000


    public static getTradeSide(mode: SignalMode): 'BUY' | 'SELL' {
        return mode === 'SHORT' ? 'SELL' : 'BUY'
    }

    public static getSymbolByToken(token: string): string {
        return `${token.toUpperCase()}USDT`
    }

    public static addLog(msg: string, ctx: TradeCtx, logger: Logger, prefix?: string) {
        const _prefix = prefix ? `${prefix} ` : ''
        const log = `${ctx.side} ${ctx.symbol}, unit ${ctx.unit.identifier} - ${_prefix}${msg}`
        ctx.trade.logs = ctx.trade.logs || []
        ctx.trade.logs.push(log)
        logger.log(msg)
    } 

    public static addError(msg: string, ctx: TradeCtx, logger: Logger) {
        ctx.error = true
        const log = `[${toDateString(new Date())}] ${msg}`
        ctx.trade.logs.push(log)
        logger.error(msg)
    }
    
    public static addWarning(msg: string, ctx: TradeCtx, logger: Logger) {
        this.addLog(msg, ctx, logger, '[WARNING]')
    }


    public static tradeRequestLimitParams = (trade: Trade): string => {
        return queryParams({
            symbol: trade.variant.symbol,
            side: trade.variant.side,
            type: TradeType.LIMIT,
            quantity: trade.quantity,
            price: trade.entryPrice,
            timestamp: Date.now(),
            timeInForce: 'GTC',
            recvWindow: TradeUtil.DEFAULT_REC_WINDOW
        })
    }

    public static tradeRequestMarketParams = (trade: Trade): string => {
        return queryParams({
            symbol: trade.variant.symbol,
            side: trade.variant.side,
            type: TradeType.MARKET,
            quantity: trade.quantity,
            timestamp: Date.now(),
            recvWindow: TradeUtil.DEFAULT_REC_WINDOW
        })
    }

    public static stopLossRequestParams = (ctx: TradeCtx, quantity: Decimal, stopLossPrice?: number): string => {
        const tradeorigQty = ctx.trade.futuresResult.origQty
        if (!tradeorigQty) {
            throw new Error(`origQuantity could not be found`)
        }
        return queryParams({
            symbol: ctx.symbol,
            side: ctx.stopLossSide,
            type: TradeType.STOP_MARKET,
            quantity: quantity.toNumber(),
            stopPrice: stopLossPrice ?? ctx.trade.variant.stopLoss,
            timestamp: Date.now(),
            timeInForce: 'GTC',
            recvWindow: TradeUtil.DEFAULT_REC_WINDOW,
            reduceOnly: true
        })
    }

    public static takeProfitRequestParams = (ctx: TradeCtx, price: number, quantity: number): string => {
        return queryParams({
            symbol: ctx.symbol,
            side: ctx.takeProfitSide,
            type: TradeType.TAKE_PROFIT_MARKET,
            quantity: quantity,
            stopPrice: price,
            timestamp: Date.now(),
            timeInForce: 'GTC',
            recvWindow: TradeUtil.DEFAULT_REC_WINDOW,
            reduceOnly: true,
        })
    }

    public static isTradeEvent(tradeEvent: TradeEventData): boolean {
        const isOrderTradeUpdate = tradeEvent?.e === 'ORDER_TRADE_UPDATE'
        return isOrderTradeUpdate
    }


    public static parseToFuturesResult(tradeEvent: TradeEventData): FuturesResult {
        return {
            orderId: tradeEvent.o?.i,
            symbol: tradeEvent.o?.s,
            status: tradeEvent.o?.X,
            clientOrderId: tradeEvent.o?.c,
            origQty: tradeEvent.o?.q,
            executedQty: tradeEvent.o?.l,
            type: tradeEvent.o?.o,
            reduceOnly: tradeEvent.o?.R,
            closePosition: tradeEvent.o?.cp,
            side: tradeEvent.o?.S,
            stopPrice: tradeEvent.o?.sp,
            origType: tradeEvent.o?.ot,
            updateTime: tradeEvent.o?.t,
            averagePrice: tradeEvent.o?.ap,
            timestamp: new Date(tradeEvent.T)
        } as FuturesResult
    }

    public static isFilledOrder(tradeResult: FuturesResult): boolean {
        const isLimitType = tradeResult.origType === TradeType.LIMIT || tradeResult.type === TradeType.MARKET
        const isFilled = tradeResult.status === TradeStatus.FILLED
        return isLimitType && isFilled
    }

    public static priceInEntryZone(ctx: TradeCtx): boolean {
        const variant = ctx.trade.variant
        const currentPrice = ctx.trade.currentPrice
        return (variant.side === TradeSide.BUY && currentPrice < variant.entryZoneEnd) || (variant.side === TradeSide.SELL && currentPrice > variant.entryZoneEnd)
    }

    public static getLever(trade: Trade): Decimal {
        return new Decimal(trade?.variant?.leverMax ?? TradeUtil.DEFAULT_LEVER)
    }

    public static positionFullyFilled(ctx: TradeCtx): boolean {
        const positionQuantity = new Decimal(ctx.trade.futuresResult?.origQty ?? 0)
        const result = positionQuantity.equals(this.takeProfitsFilledQuantitySum(ctx.trade))
        if (result) {
            ctx.trade.closed = true
        }
        return result
    }

    public static calculateStopLossQuantity = (ctx: TradeCtx) => {
        let stopLossQuantity = new Decimal(ctx.trade.futuresResult.origQty ?? 0)
            .minus(this.takeProfitsFilledQuantitySum(ctx.trade))
        return stopLossQuantity
    }

    public static takeProfitsFilledQuantitySum = (trade: Trade): Decimal => {
        const takeProfits = trade.variant.takeProfits
        return takeProfits
            .filter(tp => tp.reuslt?.status === TradeStatus.FILLED)
            .map(tp => new Decimal(tp.reuslt?.origQty || 0))
            .reduce((sum, qty) => sum.plus(qty), new Decimal(0))
    }

    public static getStopLossPrice = (ctx: TradeCtx): number => {
        let result = Number(ctx.trade.variant.stopLoss)
        const takeProfits = ctx.trade.variant.takeProfits
        takeProfits.sort((a, b) => a.order - b.order)
        for (let tp of takeProfits) {
            if (tp.reuslt?.status === TradeStatus.FILLED) {
                if (tp.order === 0) {
                    const entryPrice = Number(ctx.trade.entryPrice)
                    if (!isNaN(entryPrice)) {
                        result = entryPrice
                    }
                } else if (tp.order > 1) {
                    const takeProfitPrice = Number(ctx.trade.variant.takeProfits[tp.order-2].price)
                    if (!isNaN(takeProfitPrice)) {
                        result = takeProfitPrice
                    }
                }
            }
        }
        return result
    }


    public static tradeAmount = (trade: Trade): Decimal => {
        let result = new Decimal(0)
        if (trade.futuresResult) {
            result = result
                .plus(new Decimal(trade.futuresResult.origQty)) // has to be orig here, not executed!
                .minus(this.takeProfitsFilledQuantitySum(trade))
        }
        return result
    }

    public static mode = (side: string): SignalMode => {
        if (side === TradeSide.BUY) {
            return 'LONG'
        }
        return 'SHORT'
    }

    public static token = (symbol: string): string => symbol.replace('USDT', '')
    
    public static profitPercent = (position: Position): string => {
        // TODO zle to dziala!
        const profit = 100*Number(position.unRealizedProfit)/Number(position.positionAmt)/Number(position.entryPrice)
        return profit.toFixed()
    }
 
    public static takeProfitStatus = (tp: TakeProfit): string => {
        if (tp.reuslt) {
            switch (tp.reuslt.status) {
                case TradeStatus.NEW: return `pending`
                case TradeStatus.FILLED: return `filled`
                case TradeStatus.CANCELED: return `canceled`
                case TradeStatus.CLOSED_MANUALLY: return `closed manually`
            }
        }
        return 'waiting'
    }

    public static opositeSide = (side: TradeSide): TradeSide => {
        if (side === 'BUY') {
            return 'SELL'
        }
        return 'BUY'
    }

    public static findNextTakeProfitOrder = (trade: Trade): number => {
        let result = 0
        const takeProfits = trade.variant.takeProfits
        for (let tp of takeProfits) {
            result = tp.order+1
        }
        return result
    }


}
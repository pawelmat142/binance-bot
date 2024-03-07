import { queryParams, toDateString } from "src/global/util"
import { Logger } from "@nestjs/common"
import { FuturesResult, Trade, TradeStatus } from "./model/trade"
import { SignalMode } from "src/signal/signal-validator"
import { TradeSide, TradeType } from "./model/model"
import { TakeProfit, TradeCtx } from "./model/trade-variant"
import { TradeEventData } from "./model/trade-event-data"
import Decimal from "decimal.js"


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
        const log = `[${toDateString(new Date())}]${_prefix} ${msg}`
        ctx.trade.logs.push(log)
        logger.log(msg)
    } 

    public static addError(msg: string, ctx: TradeCtx, logger: Logger) {
        ctx.error = true
        this.addLog(msg, ctx, logger, '[ERROR]')
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

    public static lastFilledTakeProfit(ctx: TradeCtx): TakeProfit {
        const filledTakeProfits = ctx.trade.variant.takeProfits
            .filter(tp => tp.reuslt?.status === TradeStatus.FILLED)
        if (!filledTakeProfits.length) {
            return null
        }
        filledTakeProfits.sort((a, b) => b.order - a.order)
        return filledTakeProfits[0]
    }

    public static getLever(ctx: TradeCtx): Decimal {
        return new Decimal(ctx?.trade?.variant?.leverMax ?? TradeUtil.DEFAULT_LEVER)
    }

    public static everyTakeProfitFilled(ctx: TradeCtx): boolean {
        const takeProfits = ctx.trade.variant.takeProfits
        return takeProfits.every(tp => tp.reuslt?.status === TradeStatus.FILLED)
    }


    public static calculateStopLossQuantity = (ctx: TradeCtx) => {


        const takeProfits = ctx.trade.variant.takeProfits ?? []
        let stopLossQuantity = new Decimal(ctx.origQuantity)
        for (let takeProfit of takeProfits) {
            if (takeProfit.reuslt?.status === TradeStatus.FILLED) {
                const executedTakeProfitQuantity = Number(takeProfit.reuslt?.origQty)
                if (!isNaN(executedTakeProfitQuantity)) {
                    stopLossQuantity = stopLossQuantity.minus(new Decimal(executedTakeProfitQuantity))
                }
            }
        }
        return stopLossQuantity
    }

    public static getStopLossPrice = (ctx: TradeCtx): number => {
        const lastFilledTakeProfit = TradeUtil.lastFilledTakeProfit(ctx)
        if (lastFilledTakeProfit) {
            const order = Number(lastFilledTakeProfit.order)
            if (order === 0) {
                const entryPrice = Number(ctx.trade.entryPrice)
                if (!isNaN(entryPrice)) {
                    return entryPrice
                }
            } else if (order > 0) {
                const stopLossPrice = Number(ctx.trade.variant.takeProfits[order-1].price)
                if (!isNaN(stopLossPrice)) {
                    return stopLossPrice
                }
            }
        }
        return Number(ctx.trade.variant.stopLoss)
    }

 
}
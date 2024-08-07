import { Logger } from "@nestjs/common"
import { FuturesResult, Trade, TradeStatus, TradeType } from "../model/trade"
import { PlaceOrderParams, TradeEventData } from "../model/model"
import { TakeProfit, TradeCtx } from "../model/trade-variant"
import Decimal from "decimal.js"
import { Position } from "../wizard-binance.service"
import { TPUtil } from "./take-profit-util"
import { VariantUtil } from "./variant-util"
import { ClientOrderId, ClientOrderIdUtil } from "./client-order-id-util"
import { Util } from "./util"


export abstract class TradeUtil {

    public static readonly futuresUri = 'https://fapi.binance.com/fapi/v1'
    public static readonly futuresUriV2 = 'https://fapi.binance.com/fapi/v2'

    public static readonly apiUri = 'https://api.binance.com/api/v3'

    public static readonly DEFAULT_REC_WINDOW = 50000


    public static getSymbolByToken(token: string): string {
        return `${token.toUpperCase()}USDT`
    }
    
    public static addLog(msg: string, ctx: TradeCtx, logger: Logger, prefix?: string): string {
        if (prefix) {
            msg = `${prefix} ${msg}`
        }
        const log = this.prepareLog(msg, ctx)
        TradeUtil.addToCtxLogs(log, ctx)
        logger.log(log)
        return log
    } 

    public static addError(msg: string, ctx: TradeCtx, logger: Logger): string {
        ctx.error = true
        const log = this.prepareLog(msg, ctx)
        logger.error(log)
        return log
    }
    
    public static addWarning(msg: string, ctx: TradeCtx, logger: Logger): string {
        const log = this.prepareLog(msg, ctx)
        TradeUtil.addToCtxLogs(`[WARNING] ${log}`, ctx)
        logger.warn(log)
        return log
    }

    private static prepareLog(msg: string, ctx: TradeCtx): string {
        return `${VariantUtil.label(ctx.trade.variant)} [${ctx.unit.identifier}] - ${msg}`
    }

    private static addToCtxLogs(log: string, ctx: TradeCtx) {
        log = `[${Util.toDateString(new Date())}] ${log}`
        ctx.trade.logs = ctx.trade.logs || []
        ctx.trade.logs.push(log)
    }

    public static marketOrderParams (ctx: TradeCtx, quantity: number): Object  {
        const trade = ctx.trade
        const clientOrderId = ClientOrderIdUtil.generate(ClientOrderId.MARKET_ORDER, ctx.unit, ctx.trade.variant.symbol)
        return {
            symbol: trade.variant.symbol,
            side: trade.variant.side,
            type: TradeType.MARKET,
            quantity: quantity,
            timestamp: Date.now(),
            recvWindow: TradeUtil.DEFAULT_REC_WINDOW,
            newClientOrderId: clientOrderId
        }
    }

    public static stopLossRequestParams = (ctx: TradeCtx, quantity: Decimal, stopLossPrice?: number): Object => {
        const tradeorigQty = ctx.trade.marketResult.origQty
        if (!tradeorigQty) {
            throw new Error(`origQuantity could not be found`)
        }
        return {
            symbol: ctx.symbol,
            side: VariantUtil.opositeSide(ctx.trade.variant.side),
            type: TradeType.STOP_MARKET,
            quantity: quantity.toNumber(),
            stopPrice: stopLossPrice ?? ctx.trade.variant.stopLoss,
            timestamp: Date.now(),
            timeInForce: 'GTC',
            recvWindow: TradeUtil.DEFAULT_REC_WINDOW,
            reduceOnly: true
        }
    }


    public static isTradeEvent(tradeEvent: TradeEventData): boolean {
        const isOrderTradeUpdate = tradeEvent?.e === 'ORDER_TRADE_UPDATE'
        return isOrderTradeUpdate
    }


    public static parseToFuturesResult(tradeEvent: TradeEventData): FuturesResult {
        return {
            orderId: tradeEvent.o?.i?.toString(),
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





    public static tradeAmount = (trade: Trade): Decimal => {
        let result = new Decimal(0)
        if (trade.marketResult) {
            result = result
                .plus(new Decimal(trade.marketResult.origQty)) // has to be orig here, not executed!
                .minus(TPUtil.takeProfitsFilledQuantitySum(trade))
        }
        return result
    }

    public static token = (symbol: string): string => symbol.replace('USDT', '')
    
    public static profitPercent = (position: Position): string => {
        // TODO zle to dziala!
        const profit = 100*Number(position.unRealizedProfit)/Number(position.positionAmt)/Number(position.entryPrice)
        return profit.toFixed()
    }
 
    public static takeProfitStatus = (tp: TakeProfit): string => {
        if (tp.result) {
            switch (tp.result.status) {
                case TradeStatus.NEW: return `pending`
                case TradeStatus.FILLED: return `filled`
                case TradeStatus.CANCELED: return `canceled`
                case TradeStatus.CLOSED_MANUALLY: return `closed manually`
            }
        }
        return 'waiting'
    }

    public static closeOrderParams(clientOrderId : string, symbol: string): PlaceOrderParams {
        return {
            symbol: symbol,
            timeInForce: 'GTC',
            type: undefined,
            timestamp: Date.now(),
            recvWindow: TradeUtil.DEFAULT_REC_WINDOW,
            origClientOrderId: clientOrderId
        }
    }

    public static removeMultiOrderProperties(params: PlaceOrderParams): void {
        delete params.recvWindow
        delete params.timestamp
    }

}
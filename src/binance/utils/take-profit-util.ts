import Decimal from "decimal.js";
import { Logger } from "@nestjs/common";
import { TakeProfit, TradeCtx, TradeVariant } from "../model/trade-variant";
import { Trade, TradeStatus, TradeType } from "../model/trade";
import { TradeUtil } from "./trade-util";
import { VariantUtil } from "./variant-util";
import { PlaceOrderParams } from "../model/model";

export abstract class TPUtil {

    public static anyPendingOrFilledTakeProfit = (ctx: TradeCtx): boolean => {
        return this.takeProfits(ctx.trade).some(tp => [TradeStatus.FILLED, TradeStatus.NEW].includes(tp.result?.status))
    }

    public static takeProfits = (trade: Trade): TakeProfit [] => {
        return trade.variant.takeProfits || []
    }

    public static orderIds(ctx: TradeCtx): string[] {
        return ctx.trade.variant.takeProfits.filter(tp => !!tp.result).map(tp => tp.result?.orderId)
    }


    public static takeProfitsFilledQuantitySum = (trade: Trade): Decimal => {
        const takeProfits = trade.variant.takeProfits
        return takeProfits
            .filter(tp => tp.result?.status === TradeStatus.FILLED)
            .map(tp => new Decimal(tp.result?.origQty || 0))
            .reduce((sum, qty) => sum.plus(qty), new Decimal(0))
    }


    
    public static takeProfitQuentitesSum = (trade: Trade): Decimal => {
        return this.takeProfits(trade)
            .map(tp => new Decimal(tp.quantity || 0))
            .reduce((sum, qty) => sum.plus(qty), new Decimal(0))
    }

    public static firstTakeProfitToOpen(variant: TradeVariant) {
        for (let tp of variant.takeProfits) {
            if (!tp.result || tp.result.status === TradeStatus.NEW) {
                return tp
            }
        }
    }


    public static positionFullyFilled(ctx: TradeCtx): boolean {
        const logger = new Logger(this.name)
        const positionQuantity = new Decimal(ctx.trade.marketResult?.origQty ?? 0)
        const takeProfitsSum = TPUtil.takeProfitsFilledQuantitySum(ctx.trade)
        const result = positionQuantity.equals(takeProfitsSum)
        TradeUtil.addLog(`Position quantity: ${positionQuantity}, take profits filled sum: ${takeProfitsSum}`, ctx, logger)
        if (result) {
            TradeUtil.addLog(`Position fully filled`, ctx, logger)
            ctx.trade.closed = true
        } else {
            TradeUtil.addLog(`Position filled not fully`, ctx, logger)
        }
        return result
    }


    public static takeProfitRequestParams(ctx: TradeCtx, price: number, quantity: number): PlaceOrderParams {
        return {
            symbol: ctx.symbol,
            side: VariantUtil.opositeSide(ctx.trade.variant.side),
            type: TradeType.TAKE_PROFIT_MARKET,
            quantity: quantity.toString(),
            stopPrice: price.toString(),
            timestamp: Date.now(),
            timeInForce: 'GTC',
            recvWindow: TradeUtil.DEFAULT_REC_WINDOW,
            reduceOnly: "true",
        }
    }

    public static sort(ctx: TradeCtx) {
        ctx.trade.variant.takeProfits.sort((a, b) => a.order - b.order)
    }


    public static calculatePercentages(takeProfits: TakeProfit[]) {
        const singleTakeProfitPercentage = new Decimal(100).div(takeProfits.length).floor()
        takeProfits.forEach(tp => {
            tp.closePercent = singleTakeProfitPercentage.toNumber()
        })
        const remainder = 100 % takeProfits.length
        takeProfits[0].closePercent += remainder
    }
    
    public static findNextTakeProfitOrder = (trade: Trade): number => {
        let result = 0
        const takeProfits = trade.variant.takeProfits
        for (let tp of takeProfits) {
            result = tp.order+1
        }
        return result
    }

    public static tpNotFilled = (takeProfit: TakeProfit): boolean => {
        return !takeProfit.result || takeProfit.result.status === TradeStatus.NEW
    }

    public static takeProfitsPercentageSum(takeProfits: TakeProfit[]) {
        return takeProfits.reduce((sum, tp) => {
            return sum + tp.closePercent
        }, 0)
    }


    public static percentagesString(variant: TradeVariant): string {
        return `[${variant.takeProfits.map(tp => tp.closePercent).map(value => `${value}%`).join(', ')}]`
    }

    public static quantitiesString(variant: TradeVariant): string {
        return `[ ${variant.takeProfits.map(tp => tp.quantity).filter(q => !!q).join(', ')} ]`
    }

}
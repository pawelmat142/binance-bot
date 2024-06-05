import Decimal from "decimal.js";
import { Trade, TradeStatus } from "./model/trade";
import { TakeProfit, TradeCtx } from "./model/trade-variant";
import { TradeUtil } from "./trade-util";
import { Logger } from "@nestjs/common";

export abstract class TPUtil {

    public static anyPendingOrFilledTakeProfit = (ctx: TradeCtx): boolean => {
        return this.takeProfits(ctx).some(tp => [TradeStatus.FILLED, TradeStatus.NEW].includes(tp.reuslt?.status))
    }

    private static takeProfits = (ctx: TradeCtx): TakeProfit [] => {
        return ctx.trade.variant.takeProfits || []
    }

    public static takeProfitsFilledQuantitySum = (trade: Trade): Decimal => {
        const takeProfits = trade.variant.takeProfits
        return takeProfits
            .filter(tp => tp.reuslt?.status === TradeStatus.FILLED)
            .map(tp => new Decimal(tp.reuslt?.origQty || 0))
            .reduce((sum, qty) => sum.plus(qty), new Decimal(0))
    }

    public static positionFullyFilled(ctx: TradeCtx): boolean {
        const logger = new Logger(this.name)
        const positionQuantity = new Decimal(ctx.trade.futuresResult?.origQty ?? 0)
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

    
    public static findNextTakeProfitOrder = (trade: Trade): number => {
        let result = 0
        const takeProfits = trade.variant.takeProfits
        for (let tp of takeProfits) {
            result = tp.order+1
        }
        return result
    }

    public static tpNotFilled = (takeProfit: TakeProfit): boolean => {
        return !takeProfit.reuslt || takeProfit.reuslt.status === TradeStatus.NEW
    }

}
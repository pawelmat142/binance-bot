import { FilterQuery } from "mongoose"
import { FuturesResult, Trade } from "../model/trade"
import { Unit } from "../../unit/unit"
import { TradeCtx } from "../model/trade-variant"
import { Util } from "./util"

export abstract class ClientOrderId {
    public static readonly MARKET_ORDER = "MA"
    public static readonly LIMIT_ORDER = "LO"
    public static readonly TAKE_PROFIT = "TP"
    public static readonly STOP_LOSS = "SL"
}

export abstract class ClientOrderIdUtil {

    public static getFilterQueryByEventClientOrderId(clientOrderId: string): FilterQuery<Trade> {
        switch (this.prefix(clientOrderId)) {
            case ClientOrderId.MARKET_ORDER: return { "marketResult.clientOrderId": clientOrderId }
            case ClientOrderId.LIMIT_ORDER: return { "variant.limitOrders.result.clientOrderId": clientOrderId }
            case ClientOrderId.TAKE_PROFIT: return { "variant.takeProfits.result.clientOrderId": clientOrderId }
            case ClientOrderId.STOP_LOSS: return { "stopLossResult.clientOrderId": clientOrderId }
        }
    }

    public static generate(prefix: string, unit: Unit, symbol: string): string {
        return `${prefix}_${unit.identifier}_${symbol}_${Date.now().toString().slice(-3)}`
    }


    public static reprepare(prefix: string, ctx: TradeCtx, order?: number) {
        const orderProvided = !isNaN(order)
        if ([ClientOrderId.TAKE_PROFIT, ClientOrderId.LIMIT_ORDER].includes(prefix) && !orderProvided) {
            throw new Error(`Order is needed to reprepare clinetOrderId with prefix ${prefix}`)
        }
        const futuresResult = this.selectResult(ctx)
        const split = futuresResult.clientOrderId.split('_')
        if (orderProvided) {
            prefix = `${prefix}${order+1}`
        }
        split[0] = prefix
        return split.join('_')
    }


    private static selectResult(ctx: TradeCtx): FuturesResult {
        if (ctx.entryByMarket) {
            return ctx.trade.marketResult
        } else {
            for (let lo of ctx.trade.variant.limitOrders) {
                if (lo.result) {
                    return lo.result
                }
            }
            throw new Error('Not found Limit Order result for prepare clientOrderId')
        }
    }

    public static orderTypeByClientOrderId(clientOrderId: string): string {
        return Util.removeNumbersFromstring(this.prefix(clientOrderId))
    }

    public static prefix(clientOrderId: string): string {
        return this.splitClientOrderId(clientOrderId)[0]
    }

    private static splitClientOrderId(clientOrderId: string): string[] {
        if (!clientOrderId) {
            throw new Error(`ClientOrderId missing`)
        }
        return clientOrderId.split('_')
    }

}
import { FilterQuery } from "mongoose"
import { FuturesResult, Trade } from "../model/trade"
import { Unit } from "../../unit/unit"
import { TradeCtx } from "../model/trade-variant"
import { Util } from "./util"
import { TradeUtil } from "./trade-util"
import { Logger } from "@nestjs/common"

export abstract class ClientOrderId {
    public static readonly MARKET_ORDER = "MA"
    public static readonly LIMIT_ORDER = "LO"
    public static readonly TAKE_PROFIT = "TP"
    public static readonly STOP_LOSS = "SL"
}

export abstract class ClientOrderIdUtil {

    public static updaResult(ctx: TradeCtx, result: FuturesResult) {

        const orderType = this.orderTypeByClientOrderId(result.clientOrderId)
        TradeUtil.addLog(`Set result of type ${result.type}, orderType: ${orderType} with clientOrderId ${result.clientOrderId}`, ctx, new Logger(`util`))
        switch (orderType) {
            case ClientOrderId.MARKET_ORDER: 
                ctx.trade.marketResult = result
            break

            case ClientOrderId.STOP_LOSS:
                ctx.trade.stopLossResult = result
            break

            case ClientOrderId.LIMIT_ORDER: 
                for (let lo of ctx.trade.variant?.limitOrders) {
                    if (!lo.result || lo.result?.clientOrderId === result.clientOrderId) {
                        lo.result = result
                        break
                    }
                }
            break

            case ClientOrderId.TAKE_PROFIT: 
                for (let tp of ctx.trade.variant?.takeProfits) {
                    if (!tp.result || tp.result?.clientOrderId === result.clientOrderId) {
                        tp.result = result
                        continue
                    }
                }

            break

            default:
                TradeUtil.addError(`No matching order result with clientOrderId ${result.clientOrderId}`, ctx, new Logger(`util`))

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
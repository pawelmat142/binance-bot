import Decimal from "decimal.js";
import { PlaceOrderParams } from "../../binance/model/model";
import { TradeCtx } from "../../binance/model/trade-variant";
import { TradeCalculator } from "./trade-calculator";
import { TPUtil } from "../../binance/utils/take-profit-util";
import { TradeUtil } from "../../binance/utils/trade-util";
import { LimitOrderUtil } from "../../binance/utils/limit-order-util";
import { VariantUtil } from "../../binance/utils/variant-util";
import { TradeStatus, TradeType } from "../../binance/model/trade";

export class StopLossCalculator extends TradeCalculator<PlaceOrderParams> {

    protected async calculate(): Promise<PlaceOrderParams> {
        this.log('START')

        if (!this.ctx.entryByMarket && !LimitOrderUtil.areFilled(this.variant)) {
            this.log(`Skip Stop Loss. Limit Orders are not filled`)
            return null
        }

        const quantity = StopLossCalculator.calculateQuantity(this.ctx)
        this.log(`Calculated quantity ${quantity}`)

        const notRoundedPrice = this.params.forcedPrice 
            ? this.params.forcedPrice 
            : StopLossCalculator.findStopLossPrice(this.ctx)

        if (!notRoundedPrice) {
            this.warn(`Skip Stop Loss, price not found`)
            return null
        }

        let price = this.fixPricePrecision(notRoundedPrice)
        price = this.roundToTickSize(price)
        this.log(`Calculated stop price ${price}`)

        this.log('STOP')
        return {
            symbol: this.ctx.symbol,
            side: VariantUtil.opositeSide(this.ctx.side),
            type: TradeType.STOP_MARKET,
            quantity: quantity.toString(),
            stopPrice: price.toString(),
            timestamp: Date.now(),
            timeInForce: 'GTC',
            recvWindow: TradeUtil.DEFAULT_REC_WINDOW,
            reduceOnly: true
        }
    }


    
    private static findStopLossPrice(ctx: TradeCtx): number {
        let result = Number(ctx.trade.variant.stopLoss)
        TPUtil.sort(ctx)
        const takeProfits = ctx.trade.variant.takeProfits
        for (let tp of takeProfits) {
            if (tp.reuslt?.status === TradeStatus.FILLED) {
                if (tp.order === 0) {
                    const entryPrice = this.findEntryPrice(ctx)
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


    private static findEntryPrice(ctx: TradeCtx): number {
        if (ctx.entryByMarket) {
            return Number(ctx.trade.marketResult.averagePrice)
        } else {
            for (let lo of ctx.trade.variant.limitOrders) {
                if (lo.result?.status === TradeStatus.FILLED) {
                    return lo.price
                }
            }
        }
    }


    private static calculateQuantity(ctx: TradeCtx) {
        let stopLossQuantity = new Decimal(ctx.filledQuantity)
            .minus(TPUtil.takeProfitsFilledQuantitySum(ctx.trade))
        return stopLossQuantity
    }
}

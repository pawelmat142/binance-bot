import Decimal from "decimal.js";
import { TradeCtx } from "../binance/model/trade-variant";
import { VariantUtil } from "../binance/utils/variant-util";

export abstract class Messages {

    public static stopLossFilled(ctx: TradeCtx) {
        const result = ctx.trade.stopLossResult
        const price = new Decimal(result.stopPrice)
        const quantity = new Decimal(result.origQty)
        const lever = new Decimal(ctx.lever)

        const amount = quantity.div(lever).times(price).toFixed(1)
        return [
            VariantUtil.label(ctx.trade.variant),
            `Stop Loss filled, stop price: ${price}, -${amount} USDT`
        ]
    }
}
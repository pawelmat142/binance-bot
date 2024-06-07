import Decimal from "decimal.js"
import { TradeCalculator } from "./trade-calculator"

export class TradeQuantityCalculator extends TradeCalculator<number> {

    protected async calculate(): Promise<number> {
        this.log('START')

        const usdtAmount = this.findUsdtAmount()

        const entryPrice = new Decimal(this.variant.marketPriceOnCalculate)

        const calculatedQuantity = usdtAmount.times(this.lever).div(entryPrice)

        const quantity = this.roundWithFraction(calculatedQuantity, this.stepSize)

        this.log(`Calculated quantity: ${quantity}, step: ${this.stepSize}, minNotional: ${this.minNotional}, min quantity: ${this.minQty}`)
        if (quantity.lessThan(this.minQty)) {
            throw new Error(`quantity ${quantity} < minQty ${this.minQty}`)
        }

        this.log('STOP')

        return quantity.toNumber()
    }


    private findUsdtAmount(): Decimal {
        let usdtAmount = new Decimal(this.usdtPerTransaction)

        if (usdtAmount.times(this.lever).lessThan(this.minNotional)) {
            if (this.ctx.unit.allowMinNotional) {
                usdtAmount = this.minNotional.div(this.lever) 
            } else {
                throw new Error(`USDT per transaction is not enough for this position`)
            }
        }

        if (!usdtAmount || usdtAmount.equals(0)) throw new Error(`usdtAmount not found or 0`)
        if (!this.variant.marketPriceOnCalculate) throw new Error(`Missing market price`)

        return usdtAmount
    }


    // public calculateTradeQuantity(ctx: TradeCtx): void {
    //     const symbol = ctx.trade.variant.symbol
    //     const symbolInfo = this.getExchangeInfo(symbol)
    //     const minNotional = this.getMinNotional(symbolInfo)
    //     var usdtAmount = new Decimal(0)
    //     if (process.env.TEST_MODE === 'true') {
    //         usdtAmount = new Decimal(7)
    //     } else {
    //         usdtAmount = new Decimal(ctx.unit.usdtPerTransaction)

    //         // TODO - also in wizard
    //         if (usdtAmount.times(ctx.lever).lessThan(minNotional)) {
    //             if (ctx.unit.allowMinNotional) {
    //                 usdtAmount = minNotional.div(ctx.lever)
    //             } else {
    //                 throw new Error(`USDT per transaction is not enough for this position`)
    //             }
    //         }
    //     }
    //     if (!usdtAmount || usdtAmount.equals(0)) throw new Error(`usdtAmount not found or 0`)

    //     const entryPrice = new Decimal(ctx.trade.entryPrice)
    //     if (!entryPrice) throw new Error(`entryPrice not found or 0`)

    //     const calculatedQuantity = usdtAmount.times(ctx.lever).div(entryPrice)
    //     const { minQty, stepSize } = this.getLotSize(symbolInfo)
    //     const quantityStep = roundWithFraction(calculatedQuantity, stepSize)
    //     const quantity = quantityStep
    //     TradeUtil.addLog(`Calculated quantity: ${quantity}, step: ${stepSize}, minNotional: ${minNotional}`, ctx, this.logger)
    //     if (quantity.lessThan(minQty)) {
    //         throw new Error(`quantity ${quantity} < minQty ${minQty}`)
    //     }
    //     ctx.trade.quantity = quantity.toNumber()
    // }
}
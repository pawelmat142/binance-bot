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

}
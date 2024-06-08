import { LimitOrder } from "../../binance/model/trade-variant"
import { LimitOrderUtil } from "../../binance/utils/limit-order-util"
import { TradeCalculator } from "./trade-calculator"
import Decimal from "decimal.js"

export class LimitOrdersQuantityCalculator extends TradeCalculator<LimitOrder[]> {

    private limitOrders: LimitOrder[]
    private usdtAmount: Decimal
    private calculatedUsdtAmountPerOrder: Decimal
    private ordersNumber: number

    private get sum(): Decimal {
        return LimitOrderUtil.limitOrderQuantitiesSum(this.variant)
    }

    protected init() {
        this.limitOrders = this.variant.limitOrders
        this.usdtAmount = this.findUsdtAmount()
        this.ordersNumber = LimitOrderUtil.DEFAULT_ORDERS_NUMBER
    }

    protected async calculate(): Promise<LimitOrder[]> {
        this.log('START')

        this.calculateUsdtAmountPerOrder()
        this.log(`${this.calculatedUsdtAmountPerOrder}`)

        
        for (let i = 0; i < this.ordersNumber; i++) {
            const limitOrder = this.limitOrders[i]

            const calculatedQuantity = this.calculatedUsdtAmountPerOrder.times(this.lever).div(limitOrder.price)

            let quantity = this.roundWithFraction(calculatedQuantity, this.stepSize)

            quantity = this.findMax(quantity, this.minQty)

            limitOrder.quantity = quantity.toNumber()
        }
            
        const sum = this.sum
        const loQtiesString = LimitOrderUtil.quantitiesString(this.variant)

        if (sum.div(this.lever).times(this.ordersNumber).div(2).greaterThan(this.usdtAmount)) {
            throw new Error(`Calculated Limit Order quantities ${loQtiesString}, sum ${sum} is more than twice USDT per transaction ${this.usdtAmount}`)
        } else {
            this.log(`Calculated Limit Order quantities ${loQtiesString} succesfully, sum ${sum}`)
        }

        this.log('STOP')
        return this.limitOrders
    }

    private calculateUsdtAmountPerOrder() {
        this.calculatedUsdtAmountPerOrder = this.usdtAmount.div(this.ordersNumber)
        if (this.calculatedUsdtAmountPerOrder.times(this.lever).lessThan(this.minNotional)) {
            this.calculatedUsdtAmountPerOrder = this.minNotional.div(this.lever)
        }
        this.log(`Calculated Limit Order USDT per order: ${this.calculatedUsdtAmountPerOrder}`)
    }

}
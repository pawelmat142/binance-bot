import { TakeProfit } from "src/binance/model/trade-variant";
import { TradeCalculator } from "./trade-calculator";
import { TradeStatus } from "src/binance/model/trade";
import { TPUtil } from "src/binance/take-profit-util";
import Decimal from "decimal.js";

export class TakeProfitsQuantityCalculator extends TradeCalculator<TakeProfit[]> {

    private takeProfits: TakeProfit[]
    private origQuantity: Decimal


    private get length(): number {
        return this.takeProfits.length
    }

    protected init() {
        this.takeProfits = this.variant.takeProfits
        this.origQuantity = this.ctx.origQuantity
    }


    protected async calculate(): Promise<TakeProfit[]> {
        this.log('START')

        for (let i = 0; i < this.length; i++) {

            const tp = this.takeProfits[i]
            if (tp.reuslt?.status === TradeStatus.FILLED) {
                this.log(`Skipped calculation for TP with order: ${tp.order}`)
                continue
            }
            let quantity = this.roundWithFraction(this.origQuantity.times(tp.closePercent).div(100), this.stepSize)
            quantity = this.findMax(quantity, this.minQty)
            const sum = TPUtil.takeProfitQuentitesSum(this.trade).plus(quantity)

            if (sum.equals(this.origQuantity)) {
                tp.quantity = quantity.toNumber()
                break
            }

            else if (sum.greaterThan(this.origQuantity)) {
                const correctedQuantity = quantity.minus(sum.minus(this.origQuantity)) 
                if (correctedQuantity.lessThan(this.minQty)) {
                    if (i > 0) {
                        const prevTp = this.takeProfits[i-1]
                        prevTp.quantity = new Decimal(prevTp.quantity).plus(correctedQuantity).toNumber()
                        tp.quantity = 0
                    } else throw new Error('quantity calculation error')
                } else {
                    tp.quantity = correctedQuantity.toNumber()
                }
                break
            } 
            
            else {
                tp.quantity = quantity.toNumber()
            }
        }


        const sum = TPUtil.takeProfitQuentitesSum(this.trade)
        const tpQtiesString = TPUtil.quantitiesString(this.variant)

        if (sum.equals(this.origQuantity)) {
            this.log(`Successfully calculated TP quantities: ${tpQtiesString}, sum: ${sum}, origin: ${this.origQuantity}`)
        } else {
            throw new Error(`calculated TP quantities: ${tpQtiesString}, sum: ${sum}, origin: ${this.origQuantity}`)
        }

        this.log('STOP')
        return this.takeProfits
    }

}

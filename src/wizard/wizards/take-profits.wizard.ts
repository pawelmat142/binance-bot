import { Unit } from "src/unit/unit"
import { ServiceProvider } from "../services.provider"
import { UnitWizard } from "./unit-wizard"
import { WizardStep } from "./wizard"
import { TakeProfit, TradeCtx } from "src/binance/model/trade-variant"
import Decimal from "decimal.js"
import { TradeUtil } from "src/binance/trade-util"

export class TakeProfitsWizard extends UnitWizard {

    constructor(unit: Unit, services: ServiceProvider) {
        super(unit, services)
    }

    private get takeProfits(): TakeProfit[] {
        return this.selectedTrade?.variant.takeProfits ?? []
    }

    private takeProfitsAggregator: TakeProfit[] = []

    private numberOfTakeProfits = 0
    private takeProfitsIterator = 0

    private error: string



    public getSteps(): WizardStep[] {
        return [
            this.getStepZero(),
            {
                order: 1,
                message: [`It's not a number`],
                nextOrder: 0
            }, {
                order: 2,
                message: [`Can not be less than 1`],
                nextOrder: 0
            }, {
                order: 3,
                message: [`Can not be greater than 4`],
                nextOrder: 0
            }, {
                order: 4,
                message: [`Provide stop price of take profit number: ${this.takeProfitsIterator}`],
                process: async (input: string) => {
                    const price = Number(input)
                    if (isNaN(price)) return 5
                    if (!this.isPriceOk(price)) return 6
                    const newTakeProfit = {
                        price: price,
                        order: this.takeProfitsIterator
                    } as TakeProfit

                    this.takeProfitsAggregator.push(newTakeProfit)
                    if (this.takeProfitsAggregator.length >= this.numberOfTakeProfits) {
                        this.calculatePercentages()
                        return 7
                    }
                    this.takeProfitsIterator++
                    return 4
                }
            }, {
                order: 5,
                message: [`It's not a number`],
                nextOrder: 4
            }, {
                order: 6,
                message: [this.error],
                nextOrder: 4
            }, {
                order: 7,
                message: this.takeProfitsMessage(),
                buttons: [[{
                    text: `Cancel`,
                    callback_data: `cancel`,
                    process: async () => 8
                }, {
                    text: `CONFIRM`,
                    callback_data: `confirm`,
                    process: async () => {
                        this.selectedTrade.variant.takeProfits = this.takeProfitsAggregator
                        try {
                            const ctx = new TradeCtx({
                                unit: this.unit,
                                trade: this.selectedTrade
                            })
                            await this.services.binanceServie.openFirstTakeProfit(ctx)
                            await this.services.binanceServie.update(ctx)
                            return 9
                        } catch (error) {
                            this.error = error
                            return 4
                        }
                    }
                }]]
            }, {
                order: 8,
                message: [`Canceled`],
                close: true
            }, {
                order: 9,
                message: [`Take profits added to trade! :)`],
                close: true
            }]
    }

    private getStepZero(): WizardStep {
        if (this.selectedTrade) {
            if (!this.takeProfits.length) {
                return {
                    order: 0,
                    message: [`Provide number of take profits`],
                    process: async (input: string) => {
                        const numberOfTakeProfits = Number(input)
                        if (isNaN(numberOfTakeProfits)) return 1
                        if (numberOfTakeProfits < 1) return 2
                        if (numberOfTakeProfits > 4) return 3
                        this.numberOfTakeProfits = numberOfTakeProfits
                        this.takeProfitsIterator = 0
                        return 4
                    }
                } as WizardStep
            }
        }
        return null
    }

    private takeProfitsMessage(): string[] {
        const result = []
        if (this.takeProfitsAggregator?.length) {
            result.push(`Take profits:`)
            for (const tp of this.takeProfitsAggregator) {
                result.push(`- ${tp.closePercent}% ${TradeUtil.takeProfitStatus(tp)}: ${tp.price} USDT`)
            }
        } else {
            result.push(`MISSING take profits!`)
        }
        return result
    }

    private isPriceOk(price: number) {
        const side = this.selectedTrade.variant.side
        if (this.takeProfitsIterator === 0) {
            if (side === "BUY") {
                if (price > this.selectedTrade.entryPrice) {
                    return true
                } else {
                    this.error = `It should be more than entry price`
                    return false
                }
            }
            else {
                if (price < this.selectedTrade.entryPrice) {
                    return true
                } else {
                    this.error = `It should be less than entry price`
                    return false
                }
            }
        } else {
            const takeProfitBefore = this.takeProfitsAggregator[this.takeProfitsIterator-1]
            if (takeProfitBefore) {
                if (side === "BUY") {
                    if (price > takeProfitBefore.price) {
                        return true
                    } else {
                        this.error = `It should be more than previous take profit`
                        return false
                    }
                } else {
                    if (price < takeProfitBefore.price) {
                        return true
                    } else {
                        this.error = `It should be less than previous take profit`
                        return false
                    }
                }
            }
        }
    }

    private calculatePercentages() {
        const singleTakeProfitPercentage = new Decimal(100).div(this.numberOfTakeProfits).floor()
        this.takeProfitsAggregator.forEach(tp => {
            tp.closePercent = singleTakeProfitPercentage.toNumber()
        })
    }

    

}
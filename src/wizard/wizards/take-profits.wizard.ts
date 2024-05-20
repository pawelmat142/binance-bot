import { Unit } from "src/unit/unit"
import { ServiceProvider } from "../services.provider"
import { UnitWizard } from "./unit-wizard"
import { WizardStep } from "./wizard"
import { TakeProfit, TradeCtx } from "src/binance/model/trade-variant"
import { TradeUtil } from "src/binance/trade-util"
import { TradeStatus } from "src/binance/model/trade"
import Decimal from "decimal.js"

export class TakeProfitsWizard extends UnitWizard {

    constructor(unit: Unit, services: ServiceProvider) {
        super(unit, services)
        this.takeProfitsAggregator = this.takeProfits
    }

    private get takeProfits(): TakeProfit[] {
        return this.selectedTrade?.variant.takeProfits ?? []
    }

    private takeProfitsAggregator: TakeProfit[] = []

    private takeProfitsIterator = 0

    private error: string

    private anyTpToRemove: boolean


    public getSteps(): WizardStep[] {
        return [
            this.getStepZero(),
            {
                order: 1,
                message: [`Removed not filled take profits`],
                nextOrder: 0
            }, {
                order: 2,
                message: [`Provide stop price of index ${this.takeProfitsIterator} take profit...`],
                process: async (input: string) => {
                    const price = Number(input)
                    if (isNaN(price)) return 3
                    if (!this.isPriceOk(price)) return 4
                    const newTakeProfit = {
                        price: price,
                        order: this.takeProfitsIterator
                    } as TakeProfit

                    this.takeProfitsAggregator.push(newTakeProfit)
                    this.takeProfitsIterator++
                    return 0
                }, 
            }, {
                order: 3,
                message: [`It's not a number`],
                nextOrder: 2
            }, {
                order: 4,
                message: [this.error],
                nextOrder: 2
            }, {
                order: 5,
                message: [`Take profits added to trade! :)`],
                nextOrder: 0
            // }, {
            //     order: 6,
            //     message: [`Are you sure you want to remove take profits?`],
            //     buttons: [[{d
            //         text: `No`,
            //         callback_data: `no`,
            //         process: async () => 0
            //     }, {
            //         text: `YES`,
            //         callback_data: `yes`,
            //         process: async () => {
            //             // todo - TO ZLE DZIALA
            //             this.selectedTrade.variant.takeProfits = this.takeProfitsAggregator
            //             const ctx = new TradeCtx({
            //                 unit: this.unit,
            //                 trade: this.selectedTrade
            //             })
            //             await this.services.tradeService.closePendingTakeProfit(ctx)
            //             ctx.trade.variant.takeProfits = ctx.trade.variant.takeProfits.filter(tp => tp.reuslt?.status === TradeStatus.FILLED)
            //             await this.services.binanceServie.update(ctx)
            //             this.takeProfitsAggregator = ctx.trade.variant.takeProfits
            //             return 1
            //         }
            //     }
            
            // ]]
            }]
    }

    private cleanTpsButton(step: WizardStep) {
        step.buttons[0].push({
            text: `Remove not filled TPs`,
            callback_data: `cleantps`,
            process: async () => 6
        })
    }

    private addTpButton(step: WizardStep) {
        step.buttons[0].push({
            text: `Add TP`,
            callback_data: `addtp`,
            process: async () => {
                const tpsLength = this.takeProfitsAggregator.length
                this.takeProfitsIterator = tpsLength
                return 2
            }
        })
    }

    private getStepZero(): WizardStep {
        if (this.selectedTrade) {
            const step = { order: 0, message: [], buttons: [[]] }
            this.anyTpToRemove = this.takeProfitsAggregator.some(tp => !tp.reuslt || tp.reuslt.status === TradeStatus.NEW)

            if (this.takeProfitsAggregator.length) {
                step.message.push(`Take profits:`)
                for (let tp of this.takeProfitsAggregator) {
                    step.message.push(this.tpContentString(tp))
                }
                if (this.anyTpToRemove) {
                    this.cleanTpsButton(step)
                    this.addTpButton(step)
                }
            } else {
                step.message.push(`Take profits are empty`)
                this.addTpButton(step)
            }

            step.buttons.push([{
                text: `CONFIRM and order first take profit`,
                callback_data: `confitm`,
                process: async () => {
                    this.calculatePercentages()
                    this.selectedTrade.variant.takeProfits = this.takeProfitsAggregator
                    try {
                        const ctx = new TradeCtx({
                            unit: this.unit,
                            trade: this.selectedTrade
                        })
                        await this.services.binanceServie.openFirstTakeProfit(ctx)
                        await this.services.binanceServie.update(ctx)
                        return 5
                    } catch (error) {
                        this.error = error
                        this.logger.error(this.error)
                        return 4
                    }
                    // TODO
                    return 0
                }
            }])
            return step
        }
        return null
    }

    private tpContentString(tp: TakeProfit): string {
        return `- ${tp.closePercent}% ${TradeUtil.takeProfitStatus(tp)}: ${tp.price} USDT`
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
        const singleTakeProfitPercentage = new Decimal(100).div(this.takeProfitsAggregator.length).floor()
        this.takeProfitsAggregator.forEach(tp => {
            tp.closePercent = singleTakeProfitPercentage.toNumber()
        })
    }
    

}
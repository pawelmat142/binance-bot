import { TradeStatus } from "../../binance/model/trade"
import { TakeProfit, TradeCtx } from "../../binance/model/trade-variant"
import { TPUtil } from "../../binance/utils/take-profit-util"
import { TradeUtil } from "../../binance/utils/trade-util"
import { Unit } from "../../unit/unit"
import { BotUtil } from "../bot.util"
import { ServiceProvider } from "../services.provider"
import { TradesWizard } from "./trades.wizard"
import { UnitWizard } from "./unit-wizard"
import { WizardStep } from "./wizard"

export class TakeProfitsWizard extends UnitWizard {

    constructor(unit: Unit, services: ServiceProvider) {
        super(unit, services)
        this.initTakeProfitAggregator()
    }

    private takeProfitsAggregator: TakeProfit[] = []

    private get takeProfits(): TakeProfit[] {
        return this.takeProfitsAggregator || []
    }

    private initTakeProfitAggregator() {
        this.takeProfitsAggregator = this.selectedTrade?.variant.takeProfits.map(tp => tp) ?? []
        this.takeProfitsIterator = 0
    }

    private takeProfitsIterator = 0

    private error: string


    public getSteps(): WizardStep[] {
        return [{ 
                order: 0, 
                message: [
                    BotUtil.btnTradeLabel(this.selectedTrade),
                    ...this.getTakeProfitsMessage()
                ],
                buttons: this.anyTpToRemove 
                    ? [[{
                        text: `Remove pending & waiting take profits`,
                        callback_data: `cleantps`,
                        process: async () => 6
                    }], [BotUtil.getBackSwitchButton(TradesWizard.name)]]
                    : this.hasOnlyFilledTps 
                    ? [[{
                        text: `Add Take Profit number ${this.takeProfitsIterator+1}`,
                        callback_data: `addtp`,
                        process: async () => {
                            const tpsLength = this.takeProfits.length
                            this.takeProfitsIterator = tpsLength
                            return 2
                        }
                    }], [BotUtil.getBackSwitchButton(TradesWizard.name)]] 
                    : [[BotUtil.getBackSwitchButton(TradesWizard.name)]]
            }, {
                order: 1,
                message: [`Removed not filled take profits`],
                nextOrder: 0
            }, {
                order: 2,
                message: [
                    ...this.getTakeProfitsMessage(),
                    ``,
                    `Provide stop price of Take Profit number ${this.takeProfitsIterator+1} ...`
                ],
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
                    return 2
                }, 
                buttons: [[{
                    text: `Interrupt`,
                    callback_data: 'interrupt',
                    process: async () => {
                        this.initTakeProfitAggregator()
                        return 0
                    }
                }, {
                    text: `CONFIRM`,
                    callback_data: 'confirm',
                    process: async () => {
                        TPUtil.calculatePercentages(this.takeProfits)
                        this.selectedTrade.variant.takeProfits = this.takeProfits
                        const anyPendingTakeProfit = this.takeProfits.some(tp => tp.result?.status === TradeStatus.NEW)
                        if (anyPendingTakeProfit) {
                            throw new Error(`Should be no any pending Take Profit now!`)
                        }
                        const ctx = new TradeCtx({
                            trade: this.selectedTrade,
                            unit: this.unit
                        })
                        await this.services.takeProfitsService.openFirstTakeProfit(ctx)
                        TradeUtil.addLog(`Opened first take profit`, ctx, this.logger)
                        await this.services.binanceServie.update(ctx)
                        this.select(ctx.trade)
                        this.initTakeProfitAggregator()
                        return 0
                    }
                }]]
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
            }, {
                order: 6,
                message: [`Take profits ${this.takeProfitsAggregator?.filter(tp => TPUtil.tpNotFilled(tp)).map(tp => tp.order+1).join(', ')} will be removed`],
                buttons: [[{
                    text: `No`,
                    callback_data: `no`,
                    process: async () => 0
                }, {
                    text: `YES`,
                    callback_data: `yes`,
                    process: async () => {
                        const trade = this.selectedTrade
                        trade.variant.takeProfits = this.takeProfitsAggregator
                        const ctx = new TradeCtx({
                            unit: this.unit,
                            trade: trade
                        })
                        await this.services.takeProfitsService.closePendingTakeProfit(ctx)
                        trade.variant.takeProfits = trade.variant.takeProfits.filter(tp => tp.result?.status === TradeStatus.FILLED)
                        await this.services.binanceServie.update(ctx)
                        this.takeProfitsAggregator = ctx.trade.variant.takeProfits
                        return 1
                    }
                }
            ]]
            }]
    }

    private getTakeProfitsMessage(): string[] {
        if (!this.selectedTrade) return []
        const lines = []
        BotUtil.prepareTakeProfitMsgLines(this.takeProfits, lines)
        return lines
    }

    private get anyTpToRemove(): boolean {
        return this.takeProfits.some(tp => TPUtil.tpNotFilled(tp))
    }

    private get hasOnlyFilledTps(): boolean {
        return this.takeProfits.every(tp => tp.result?.status === TradeStatus.FILLED)
    }


    private isPriceOk(price: number) {
        const side = this.selectedTrade.variant.side
        if (this.takeProfitsIterator === 0) {
            if (side === "BUY") {
                if (price > Number(this.selectedTrade.marketResult.averagePrice)) {
                    return true
                } else {
                    this.error = `It should be more than entry price`
                    return false
                }
            }
            else {
                if (price < Number(this.selectedTrade.marketResult.averagePrice)) {
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



}
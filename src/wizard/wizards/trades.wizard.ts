import { Unit } from "src/unit/unit"
import { ServiceProvider } from "../services.provider"
import { UnitWizard } from "./unit-wizard"
import { FuturesResult, Trade, TradeStatus } from "src/binance/model/trade"
import { isBinanceError } from "src/binance/model/binance.error"
import { TradeType } from "src/binance/model/model"
import { Logger } from "@nestjs/common"
import { Position } from "src/binance/wizard-binance.service"
import { TradeUtil } from "src/binance/trade-util"
import Decimal from "decimal.js"
import { WizBtn } from "./wizard-buttons"
import { WizardButton, WizardStep } from "./wizard"
import { TradeCtx } from "src/binance/model/trade-variant"

export class TradesWizard extends UnitWizard {

    private readonly logger = new Logger(TradesWizard.name)

    constructor(unit: Unit, services: ServiceProvider) {
        super(unit, services)
    }

    private pendingPositions: Position[]

    private openOrders: FuturesResult[] = []
    private openOrdersPositions: Position[] = []

    private stopLoses: FuturesResult[] = []

    private takeProfits: FuturesResult[] = []

    private trades: Trade[]


    private selectedTrade: Trade

    private error: any

    private liqPrice: number
    private sl: number

    protected _init = async () => {
        const [trades, positions, openOrders] = await Promise.all([
            this.fetchTrades(),
            this.fetchPositions(),
            this.fetchOpenOrders(),
        ])
        this.trades = trades
        this.pendingPositions = positions
            .filter(p => Number(p.positionAmt) !== 0)

        for (let order of openOrders) {
            if (order.type === TradeType.LIMIT) {
                this.openOrders.push(order)
                this.openOrdersPositions.push(positions.find(p => p.symbol === order.symbol))
                continue
            }
            if (order.type === TradeType.STOP_MARKET) {
                this.stopLoses.push(order)
                continue
            }
            if (order.type === TradeType.TAKE_PROFIT_MARKET) {
                this.takeProfits.push(order)
                continue
            }
        }
    }

    public getSteps(): WizardStep[] {
        const stepZeroButtons = [
            ...this.getPendingPositionsButtons(),
            ...this.getOpenOrdersButtons(),
            [{
                text: `refresh`,
                callback_data: `refresh`,
                process: async () => {
                    await this._init()
                    return 0
                }
            }]
        ]
        const stepZeroMsg = stepZeroButtons.length 
            ? [`Select position or order...`]
            : [`You have no pending positions or open orders`]

        const stopLossSet = this.selectedTrade?.stopLossResult?.status === TradeStatus.NEW
        return [{
            order: 0,
            buttons: stepZeroButtons,
            message: stepZeroMsg,
            close: !stepZeroButtons.length,
        }, {
            order: 1,
            message: this.selectedPositionMessage(),
            buttons: [[{
                text: stopLossSet ? `SL to entry price` : `set SL to entry price`,
                callback_data: WizBtn.slToEntryPrice,
                process: async () => {
                    const position = this.findPosition(this.selectedTrade.variant.symbol)
                    const entryPrice = Number(position.entryPrice)
                    const success = await this.services.binance.moveStopLoss(this.getCtxForSelected(), entryPrice)
                    return success ? 4 : 3
                }
            }, {
                text: stopLossSet ? `Move SL to...` : `Set SL to...`,
                callback_data: WizBtn.slTo,
                process: async () => 5
            }], [{
                text: `Take some profits`,
                callback_data: WizBtn.takeSomeProfits,
                process: async () => {
                    const ctx = new TradeCtx({
                        unit: this.unit,
                        trade: this.selectedTrade
                    })
                    const success = await this.services.tradeService.takeSomeProfit(ctx)
                    if (success) {
                        this.selectedTrade = ctx.trade
                        return 12
                    }
                    this.error = 'error when take some profits'
                    return 3
                }
            }, {
                text: `Close by market`,
                callback_data: WizBtn.closePosition,
                process: async () => {
                    const success = await this.fullClosePosition()
                    return success ? 13 : 3
                }
            }]],
        }, {
            order: 2,
            message: this.selectedOrderMessage(),
            buttons: [[{
                text: `Close order`,
                callback_data: WizBtn.closeOrder,
                process: async () => {
                    const success = await this.fullCloseOrder() 
                    return success ? 7 : 3
                }
            }], [{
                text: `Force order by marker price`,
                callback_data: WizBtn.forceOrderByMarket,
                process: async () => {
                    // TODO
                    return 8
                }
            }]]
        }, {
            order: 3,
            message: this.getErrorMessage(),
            close: true
        }, {
            order: 4,
            message: [`Successfully moved stop loss to entry price`],
            close: true
        }, {
            order: 5,
            message: [`Provide new stop loss level...`],
            process: async (input: string) => {
                const price = Number(input)
                if (isNaN(price)) {
                    return 9
                }
                const position = this.findPosition(this.selectedTrade.variant.symbol)
                this.liqPrice = Number(position.liquidationPrice)
                if (price <= this.liqPrice) {
                    return 10
                }
                const success = await this.services.binance.moveStopLoss(this.getCtxForSelected(), price)
                this.sl = price
                return success ? 11 : 3
            },
        }, {
            order: 6,
            message: [`Trade not found`],
            nextOrder: 0
        }, {
            order: 7,
            message: [`Order closed`],
            nextOrder: 0
        }, {
            order: 8,
            message: [`TODO`],
            nextOrder: 0
        }, {
            order: 9,
            message: ['Its not a number!'],
            nextOrder: 5
        }, {
            order: 10,
            message: [`Its less than liquidation price ${this.liqPrice} USDT`],
            nextOrder: 5
        }, {
            order: 11,
            message: [`Successfully moved SL to level ${this.sl} USDT`],
            nextOrder: 1
        }, {
            order: 12,
            message: [`Took some profit`],
            nextOrder: 1
        }, {
            order: 13,
            message: [`Closed position`],
            close: true
        } ]
    }


    private getErrorMessage(): string[] {
        const result = ['Error']
        if (this.error) {
            result.push(this.error)
        }
        return result
    }
    
    private async fetchTrades(): Promise<Trade[]> {
        const trades = await this.services.binance.fetchTrades(this.unit)
        this.logger.log(`fetched ${trades.length} trades`)
        return Array.isArray(trades) ? trades : []
    } 

    private async fetchOpenOrders(): Promise<FuturesResult[]> {
        const trades = await this.services.tradeService.fetchOpenOrders(this.unit)
        if (isBinanceError(trades)) {
            this.logger.error(trades)
            return []
        }
        this.logger.log(`fetched ${trades.length} orders`)
        return trades
    }

    private async fetchPositions(): Promise<Position[]> {
        const trades = await this.services.binance.fetchPositions(this.unit)
        if (isBinanceError(trades)) {
            this.logger.error(trades)
            return []
        }
        this.logger.log(`fetched ${trades.length} positions`)
        if (trades.length >= 500) {
            this.logger.error(`limit exceeded /positionRisk`)
        }
        return trades
    }

    private getPendingPositionsButtons(): WizardButton[][] {
        if (this.order !== 0 || !this.pendingPositions?.length) return []
        const buttons: WizardButton[][] = [[{
            text: `Pending positions:`,
            callback_data: WizBtn.AVOID_BUTTON_CALLBACK
        }]]
        for (const position of this.pendingPositions) {
            const trade = this.findMatchingTrade(position)
            if (!trade) continue
            const profit = Number(position.unRealizedProfit)
            const profitPrefix = profit > 0 ? '+' : ''
            buttons.push([{
                text: `${TradeUtil.msgHeader(trade)}  /  ${profitPrefix}${profit.toFixed(2)} USDT  (${TradeUtil.profitPercent(position)}%)`,
                callback_data: position.symbol,
                process: async () => {
                    if (position) {
                        this.selectedTrade = trade
                        if (this.selectedTrade) {
                            return 1
                        }
                    }
                    return 6
                }
            }])
        }
        return buttons
    }

    private getOpenOrdersButtons(): WizardButton[][] {
        if (this.order !== 0 || !this.openOrders?.length) return []
        const buttons: WizardButton[][] = [[{
            text: `Open orders:`,
            callback_data: WizBtn.AVOID_BUTTON_CALLBACK
        }]]
        for (const order of this.openOrders) {
            const trade = this.findMatchingOrderTrade(order)
            if (trade) {
                buttons.push([{
                    text: `${TradeUtil.orderMsgHeader(order)} [${trade.variant.leverMax}x]`,
                    callback_data: order.symbol,
                    process: async () => {
                        if (order) {
                            this.selectedTrade = trade
                            if (this.selectedTrade) {
                                return 2
                            }
                        }
                        return 6
                    }
                }])
            }
        }
        return buttons
    }

    private findMatchingTrade(position: Position) {
        const matchingTrades = this.trades.filter(t => t.variant.symbol === position.symbol)
            .filter(t => t.futuresResult?.status === TradeStatus.FILLED)
            .filter(t => {
                const tradeAmount = TradeUtil.tradeAmount(t)
                const positionAmount = new Decimal(position.positionAmt)
                // TODO check/test if any TP is filled
                // console.log(`${t.variant.symbol} tradeAmount: ${tradeAmount.toString()}`)
                // console.log(`${t.variant.symbol} positionAmount: ${positionAmount.toString()}`)
                return tradeAmount.equals(positionAmount)
            }).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        const result = matchingTrades[0]
        if (!result) {
            this.logger.error(`Could not find matching trade for position ${position.symbol}`)
        }
        return result
    }

    private findMatchingOrderTrade(order: FuturesResult): Trade {
        const matchingTrades = this.trades.filter(t => t.variant.symbol === order.symbol)
            .filter(t => t.futuresResult?.status === TradeStatus.NEW)
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        const result = matchingTrades[0]
        if (!result) {
            this.logger.error(`Could not find matching trade for order ${order.symbol}`)
        }
        return matchingTrades[0]
    }

    private findPosition(symbol: string): Position {
        return this.pendingPositions.find(p => p.symbol.toLowerCase() === symbol.toLowerCase())
    }

    private selectedPositionMessage(): string[] {
        if (this.selectedTrade) {
            const position = this.findPosition(this.selectedTrade.variant.symbol)
            if (position) {
                const message = [
                    `Wallet: ${Number(position.isolatedWallet).toFixed(2)} USDT`,
                    `Entry price: ${Number(position.entryPrice).toFixed(2)} USDT`,
                    `Market price: ${Number(position.markPrice).toFixed(2)} USDT`,
                ]
                if (this.selectedTrade.stopLossResult) {
                    message.push(`Stop loss: ${Number(this.selectedTrade.stopLossResult?.stopPrice??0).toFixed(2)} USDT`)
                } else if (this.selectedTrade.variant.stopLoss) {
                    message.push(`Stop loss: ${this.selectedTrade.variant.stopLoss.toFixed(2)} USDT`)
                } else {
                    message.push(`MISSING stop loss`)
                }
                if (this.selectedTrade.variant.takeProfits.length) {
                    message.push(`Take profits:`)
                } else {
                    message.push(`MISSING take profits!`)
                }
                for (const tp of this.selectedTrade.variant.takeProfits) {
                    message.push(`- ${tp.closePercent}% ${TradeUtil.takeProfitStatus(tp)}: ${tp.price} USDT`)
                }
                console.log(message)
                return message
            }
        }
        return ['Trade not selected...']
    }

    
    private selectedOrderMessage(): string[] {
        if (this.selectedTrade) {
            const position = this.openOrdersPositions.find(o => o.symbol === this.selectedTrade.variant.symbol)
            if (position) {
                const message = [
                    `Entry price: ${this.selectedTrade.entryPrice.toFixed(2)} USDT`,
                    `Market price: ${Number(position.markPrice).toFixed(2)} USDT`,
                ]
                if (this.selectedTrade.variant.stopLoss) {
                    message.push(`Stop loss: ${this.selectedTrade.variant.stopLoss.toFixed(2)} USDT`)
                } else {
                    message.push(`MISSING stop loss`)
                }
                if (this.selectedTrade.variant.takeProfits.length) {
                    message.push(`Take profits:`)
                } else {
                    message.push(`MISSING take profits!`)
                }
                for (const tp of this.selectedTrade.variant.takeProfits) {
                    message.push(`- ${tp.closePercent}% : ${tp.price} USDT`)
                }
                return message
            }
        }
        return ['Order not selected...']
    }


    // CLOSING

    private async fullCloseOrder(): Promise<boolean> {
        try {
            const ctx = new TradeCtx({
                unit: this.unit,
                trade: this.selectedTrade
            })
            TradeUtil.addLog(`[START] closing order ${this.selectedTrade.futuresResult.orderId}, ${this.selectedTrade.variant.symbol}`, ctx, this.logger)
            await this.services.binance.closeOrder(ctx)
            this.openOrders = this.openOrders.filter(o => o.symbol !== this.selectedTrade.variant.symbol)
            TradeUtil.addLog(`[STOP] closing order ${this.selectedTrade.futuresResult.orderId}, ${this.selectedTrade.variant.symbol}`, ctx, this.logger)
            this.selectedTrade = null
            return true
        } catch (error) {
            this.error = error
            return false
        }
    }


    private async fullClosePosition(): Promise<boolean> {
        if (!this.selectedTrade) throw new Error('missing selected trade')
        const ctx = new TradeCtx({
            unit: this.unit,
            trade: this.selectedTrade
        })
        try {
            await this.services.binanceServie.fullClosePosition(ctx)
            this.pendingPositions = this.pendingPositions.filter(p => p.symbol === this.selectedTrade.variant.symbol)
            this.selectedTrade = null
            return true
        } catch (error) {
            this.error = error
            return false
        }
    }

    private getCtxForSelected(): TradeCtx {
        if (this.selectedTrade) {
            return new TradeCtx({
                trade: this.selectedTrade,
                unit: this.unit
            })
        }
        throw new Error(`missing selected trade`)
    }

}
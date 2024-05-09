import { Unit } from "src/unit/unit"
import { ServicesService } from "../services.service"
import { UnitWizard } from "./unit-wizard"
import { FuturesResult, Trade, TradeStatus } from "src/binance/model/trade"
import { isBinanceError } from "src/binance/model/binance.error"
import { TradeType } from "src/binance/model/model"
import { Logger } from "@nestjs/common"
import TelegramBot from "node-telegram-bot-api"
import { Position } from "src/binance/wizard-binance.service"
import { TradeUtil } from "src/binance/trade-util"
import Decimal from "decimal.js"
import { WizBtn } from "./wizard-buttons"
import { WizardButton, WizardStep } from "./wizard"
import { TradeCtx, TradeVariant } from "src/binance/model/trade-variant"
import { queryParams } from "src/global/util"

export class TradesWizard extends UnitWizard {

    private readonly logger = new Logger(TradesWizard.name)

    constructor(unit: Unit, services: ServicesService) {
        super(unit, services)
    }

    private pendingPositions: Position[]

    private openOrders: FuturesResult[] = []

    private stopLoses: FuturesResult[] = []

    private takeProfits: FuturesResult[] = []

    private trades: Trade[]


    private selectedTrade: Trade

    private error: any

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
            ...this.getOpenOrdersButtons()
        ]
        const stepZeroMsg = stepZeroButtons.length 
            ? [`Select position or order...`]
            : [`You have no pending positions or open orders`]
        return [{
            order: 0,
            buttons: stepZeroButtons,
            message: stepZeroMsg,
            close: !stepZeroButtons.length,
        }, {
            order: 1,
            message: this.selectedPositionMessage(),
            buttons: [[{
                text: `Move stop loss to entry price`,
                callback_data: WizBtn.slToEntryPrice
            }], [{
                text: `Move stop loss to...`,
                callback_data: WizBtn.slTo
            }], [{
                text: `Take some profits`,
                callback_data: WizBtn.takeSomeProfits
            }], [{
                text: `Close position with market price`,
                callback_data: WizBtn.closePosition,
                process: async () => {
                    // TODO!!
                    const success = await this.fullClosePosition()
                    return success ? 1 : 3
                }
            }]],
            process: async (input: string) => {
                switch (input) {
                    case WizBtn.slToEntryPrice:
                        const position = this.findPosition(this.selectedTrade.variant.symbol)
                        const entryPrice = Number(position.entryPrice)
                        const result = await this.services.binance.moveStopLoss(this.selectedTrade.stopLossResult, entryPrice, this.unit)
                        if (result === 'error') {
                            return 3
                        }
                        return 4

                    case WizBtn.slTo:
                        // TODO magic!
                        return 5


                    default: return 0
                }
            }
        }, {
            order: 2,
            message: this.selectedOrderMessage(),
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
            message: [`Successfully moved stop loss to TODO`],
            process: async () => {
                console.log('process')
                return 1
            },
        }, {
            order: 6,
            message: [`Trade not found`],
            close: true
        },{
            order: 55,
            message: ['stoooop'],
            close: true
        }]

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
        const trades = await this.services.binance.fetchOpenOrders(this.unit)
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
        return buttons
    }

    private findMatchingTrade(position: Position) {
        const matchingTrades = this.trades.filter(t => t.variant.symbol === position.symbol)
            .filter(t => t.futuresResult?.status === TradeStatus.FILLED)
            .filter(t => {
                const tradeAmount = TradeUtil.tradeAmount(t)
                const positionAmount = new Decimal(position.positionAmt)
                // TODO check/test if any TP is filled
                console.log(`${t.variant.symbol} tradeAmount: ${tradeAmount.toString()}`)
                console.log(`${t.variant.symbol} positionAmount: ${positionAmount.toString()}`)
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
                    `Stop loss: ${Number(this.selectedTrade.stopLossResult?.stopPrice??0).toFixed(2)} USDT`,
                    `Take profits:`,
                ]
                for (const tp of this.selectedTrade.variant.takeProfits) {
                    message.push(`- ${tp.closePercent}% ${TradeUtil.takeProfitStatus(tp)}: ${tp.price} USDT`)
                }
                return message
            }
        }
        return ['Trade not selected...']
    }

    
    private selectedOrderMessage(): string[] {
        if (this.selectedTrade) {
            return [`TODO selected order message`]
        }
        return ['Order not selected...']
    }


    // CLOSING
    private async fullClosePosition(): Promise<boolean> {
        try {
            const trade = this.selectedTrade
            if (!trade) throw new Error('missing selected trade')
            const symbol = trade.variant.symbol
            this.logger.log(`[START] Closing position ${symbol} for unit: ${this.unit.identifier}`)
    
            const ctx = new TradeCtx({
                unit: this.unit,
                trade: { variant: { symbol: symbol} as TradeVariant } as Trade
            })
    
            const stopLoses = this.stopLoses.filter(sl => sl.symbol === symbol)
            const takeProfits = this.takeProfits.filter(tp => tp.symbol === symbol)
            const trades = this.trades.filter(t => t.variant.symbol === symbol)
            
            for (let sl of stopLoses) {
                await this.services.tradeService.closeOrder(ctx, sl.orderId)
                this.logger.log(`Closed sl order ${sl.orderId} fot unit: ${this.unit.identifier}`)
            }
            for (let tp of takeProfits) {
                await this.services.tradeService.closeOrder(ctx, tp.orderId)
                this.logger.log(`Closed tp order ${tp.orderId} fot unit: ${this.unit.identifier}`)
            }
            for (let trade of trades) {
                await this.closeTrade(trade)
                this.logger.log(`Closed trade: ${trade._id} fot unit: ${this.unit.identifier}`)
            }
            await this.closePosition(symbol, ctx)
            this.logger.log(`[STOP] Closing position ${symbol} for unit: ${this.unit.identifier}`)
            return true
        } catch (error) {
            this.error = error
            return false
        }
    }

    private closeTrade(trade: Trade) {
        trade.closed = true
        if (trade.stopLossResult) {
            trade.stopLossResult.status = TradeStatus.CLOSED_MANUALLY
        }
        for (let tp of trade.variant.takeProfits || []) {
            if (tp.reuslt) {
                tp.reuslt.status = TradeStatus.CLOSED_MANUALLY
            }
        }
        const ctx = new TradeCtx({
            unit: this.unit,
            trade: trade
        })
        return this.services.binanceServie.update(ctx)
    }

    private async closePosition(symbol: string, ctx: TradeCtx) {
        const position = this.pendingPositions.find(p => p.symbol === symbol)
        if (position) {
            const params = queryParams({
                symbol: ctx.symbol,
                side: TradeUtil.opositeSide(this.selectedTrade.variant.side),
                type: TradeType.MARKET,
                quantity: Number(position.positionAmt),
                timestamp: Date.now(),
            })
            const resultTrade = await this.services.tradeService.placeOrder(params, ctx, 'POST')
            this.logger.log(`Closed position ${symbol}, for unit ${this.unit.identifier}`)
        }
    }

}
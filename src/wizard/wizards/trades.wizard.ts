import { Unit } from "src/unit/unit"
import { ServiceProvider } from "../services.provider"
import { UnitWizard } from "./unit-wizard"
import { FuturesResult, Trade, TradeStatus } from "src/binance/model/trade"
import { TradeType } from "src/binance/model/model"
import { Position } from "src/binance/wizard-binance.service"
import { TradeUtil } from "src/binance/trade-util"
import Decimal from "decimal.js"
import { WizBtn } from "./wizard-buttons"
import { WizardButton, WizardStep } from "./wizard"
import { TradeCtx } from "src/binance/model/trade-variant"
import { TakeProfitsWizard } from "./take-profits.wizard"
import { BotUtil } from "../bot.util"
import { StartWizard } from "./start.wizard"

export class TradesWizard extends UnitWizard {

    constructor(unit: Unit, services: ServiceProvider) {
        super(unit, services)
    }

    private trades: Trade[]
    private orders: FuturesResult[]
    private positions: Position[]

    private openPositions: Position[]

    private openOrders: FuturesResult[] = []
    private openStopLosses: FuturesResult[] = []
    private openTakeProfits: FuturesResult[] = []


    private selectedPosition?: Position

    private readonly STEP = {
        TRADES_ORDERS: 0,
        POSITION: 1,
        ORDER: 2,
        ERROR: 3,
        POSITION_CLOSED: 13,
        POSITION_WITHOUT_TRADE: 15,
    }


    private openOrdersPositions: Position[] = []
    private error: any

    private liqPrice: number
    private sl: number

    protected _init = async () => {
        await Promise.all([
            this.fetchTrades(),
            this.fetchOrders(),
            this.fetchPositions(),
        ])

        const tradeSymbols = new Set(this.trades.map(t => t.variant.symbol))

        this.openPositions = this.positions
            .filter(p => Number(p.positionAmt) !== 0)

        this.openOrders = this.orders
            .filter(o => o.status === TradeStatus.NEW)
            .filter(o => o.type === TradeType.LIMIT)
            .filter(o => tradeSymbols.has(o.symbol))

        this.openStopLosses = this.orders
            .filter(o => o.status === TradeStatus.NEW)
            .filter(o => o.type === TradeType.STOP_MARKET)

        this.openTakeProfits = this.orders
            .filter(o => o.status === TradeStatus.NEW)
            .filter(o => o.type === TradeType.TAKE_PROFIT_MARKET)

        this.openOrdersPositions = this.openOrders
            .map(o => this.positions.find(p => p.symbol === o.symbol))
            .filter(p => !!p)
    }

    private get anyOpenPositionOrOrder(): boolean {
        return !!this.openOrders?.length || !!this.openPositions?.length
    }

    public getSteps(): WizardStep[] {
        const anyOpenPositionOrOrder = this.anyOpenPositionOrOrder

        return [{
            order: 0,
            message: anyOpenPositionOrOrder 
                ? [`Select position or order...`]
                : [`You have no pending positions or open orders`],

            buttons: [
                ...(this.order !== 0 || !this.openPositions?.length ? [] : [
                    [{
                        text: `Pending positions:`,
                        callback_data: WizBtn.AVOID_BUTTON_CALLBACK
                    }],
                    ...this.openPositions.map(p => this.positionButton(p))
                ]),

                ...(this.order !== 0 || !this.openOrders?.length ? [] : [
                    [{
                        text: `Open orders:`,
                        callback_data: WizBtn.AVOID_BUTTON_CALLBACK
                    }],
                    ...this.openOrders.map(o => this.orderButton(o))
                ]),


                [BotUtil.getBackSwitchButton(StartWizard.name), {
                    text: `Refresh`,
                    callback_data: `refresh`,
                    process: async () => {
                        await this._init()
                        return this.STEP?.TRADES_ORDERS
                    }
                }],
            ],
            close: !anyOpenPositionOrOrder,
        }, {
            order: this.STEP?.POSITION,
            message: this.selectedPositionMessage(),
            buttons: this.selectedPositionStepButtons(),
            backButton: true
        }, {
            order: this.STEP?.ORDER,
            message: this.selectedOrderMessage(),
            buttons: this.selectedOrderStepButtons(),
            backButton: true
        }, {
            order: this.STEP?.ERROR,
            message: this.getErrorMessage(),
            close: true
        }, {
            order: 4,
            message: [`Successfully moved stop loss to entry price`],
            close: true
        }, {
            order: 5,
            message: [`Provide new stop loss level...`],
            backButton: true,
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
                return success ? 11 : this.STEP?.ERROR
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
            message: [`TODO Force order by market price`],
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
            nextOrder: this.STEP?.POSITION
        }, {
            order: 12,
            message: [`Took some profit`],
            nextOrder: this.STEP?.POSITION
        }, {
            order: this.STEP?.POSITION_CLOSED,
            message: [`Closed position`],
            nextOrder: this.STEP?.TRADES_ORDERS
        }, {
            order: 14,
            message: [`Are you sure you want to close position?`],
            buttons: [[{
                text: 'Cancel',
                callback_data: `cancel`,
                process: async () => this.STEP?.POSITION
            }, {
                text: `CONFIRM`,
                callback_data: `confirm`,
                process: async () => {
                    const success = await this.fullClosePosition()
                    return success ? this.STEP?.POSITION_CLOSED : this.STEP?.ERROR
                }
            }]]
        }, {
            order: this.STEP?.POSITION_WITHOUT_TRADE,
            message: [
                `Found ${this.selectedPosition?.symbol} position in your Binance Futures account without bot reference`,
                `Would you like to close it?`
            ],
            buttons: [[{
                text: 'No',
                callback_data: WizBtn.NO,
                process: async () => this.STEP?.TRADES_ORDERS
            }, {
                text: `Yes`,
                callback_data: WizBtn.YES,
                process: async () => {
                    this.error = await this.services.binance.closePositionWithoutTrade(this.selectedPosition, this.unit)
                    return !!this.error ? this.STEP?.ERROR : this.STEP?.POSITION_CLOSED
                }
            }]]
        } ]
    }



    private selectedPositionStepButtons(): WizardButton[][] {
        if (!this.selectedTrade) return []

        const stopLossSet = this.selectedTrade?.stopLossResult?.status === TradeStatus.NEW

        const buttons: WizardButton[][] = [[{
            text: stopLossSet ? `Move SL to entry price` : `Set SL at entry price`,
            callback_data: WizBtn.slToEntryPrice,
            process: async () => {
                const position = this.findPosition(this.selectedTrade.variant.symbol)
                const entryPrice = Number(position.entryPrice)
                const success = await this.services.binance.moveStopLoss(this.getCtxForSelected(), entryPrice)
                return success ? 4 : 3
            }
        }, {
            text: stopLossSet ? `Move SL to...` : `Set SL at...`,
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
                    this.select(ctx.trade)
                    return 12
                }
                this.error = 'error when take some profits'
                return 3
            }
        }, {
            text: `Edit take profits`,
            callback_data: `addtps`,
            switch: TakeProfitsWizard.name
        }], [{
            text: `Close by market`,
            callback_data: WizBtn.closePosition,
            process: async () => 14
        }]]
        return buttons
    }
    
    private selectedOrderStepButtons(): WizardButton[][] {
        const buttons: WizardButton[][] = [[{
            text: `Close order`,
            callback_data: WizBtn.closeOrder,
            process: async () => {
                const success = await this.fullCloseOrder() 
                return success ? 7 : 3
            }
        }, {
            text: `Edit take profits`,
            callback_data: `addtps`,
            switch: TakeProfitsWizard.name
        }], [{
            text: `Force order by market price`,
            callback_data: WizBtn.forceOrderByMarket,
            process: async () => {
                // TODO
                return 8
            }
        }]]
        return buttons
    }

    private getErrorMessage(): string[] {
        const result = ['Error']
        if (this.error) {
            result.push(this.error)
        }
        return result
    }
    
    private async fetchTrades() {
        try {
            this.trades = await this.services.binance.fetchTrades(this.unit)
        } catch (error) {
            const msg = this.services.http.handleErrorMessage(error)
            this.logger.error(msg)
            this.trades = []
        }
        this.logger.log(`Fetched ${this.trades.length} trades`)
    } 

    private async fetchOrders() {
        this.orders = await this.services.tradeService.fetchOpenOrders(this.unit)
        this.logger.log(`Fetched ${this.orders.length} orders`)
    }

    private async fetchPositions(){
        this.positions = await this.services.tradeService.fetchPositions(this.unit)
        this.logger.log(`Fetched ${this.positions.length} orders`)
    }

    private positionButton(position: Position): WizardButton[] {
        const profit = Number(position.unRealizedProfit)
        const profitPrefix = profit > 0 ? '+' : ''
        const trade = this.findMatchingTrade(position)
        return [{
            text: !!trade 
                ? `${BotUtil.btnTradeLabel(trade)}  /  ${profitPrefix}${profit.toFixed(2)} USDT  (${TradeUtil.profitPercent(position)}%)`
                : `${BotUtil.btnPositionLabel(position)}`,
            callback_data: position.symbol,
            process: async () => {
                this.selectedPosition = position
                if (trade) {
                    this.select(trade)
                    return this.STEP?.POSITION
                }
                return this.STEP?.POSITION_WITHOUT_TRADE
            }
        }]
    }

    private orderButton(order: FuturesResult): WizardButton[] {
        const trade = this.findMatchingOrderTrade(order)
        const leverTextPart = !!trade ? ` ${trade.variant.leverMax}x` : ` error`
        return [{
            text: `${BotUtil.btnOrderMsg(order)}${leverTextPart}`,
            callback_data: order.symbol,
            process: async () => {
                if (trade) {
                    this.select(trade)
                    return 2
                }
                return 8
            }
        }]
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
            this.logger.warn(`Could not find matching trade for position ${position.symbol}, unit: ${this.unit.identifier}`)
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
        return this.openPositions.find(p => p.symbol.toLowerCase() === symbol.toLowerCase())
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
                BotUtil.prepareTakeProfitMsgLines(this.selectedTrade.variant.takeProfits, message)
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
                BotUtil.prepareTakeProfitMsgLines(this.selectedTrade.variant.takeProfits, message)
                return message
            }
        }
        return ['Order not selected...']
    }


    // CLOSING

    private async fullCloseOrder(): Promise<boolean> {
        const order = this.openOrders.find(o => o.symbol === this.selectedTrade.variant.symbol)
        const ctx = new TradeCtx({
            unit: this.unit,
            trade: this.selectedTrade
        })
        try {
            TradeUtil.addLog(`[START] closing order ${this.selectedTrade.futuresResult.orderId}, ${this.selectedTrade.variant.symbol}`, ctx, this.logger)
            await this.services.binance.closeOrder(ctx, order.orderId)
            this.openOrders = this.openOrders.filter(o => o.symbol !== this.selectedTrade.variant.symbol)
            TradeUtil.addLog(`[STOP] closing order ${this.selectedTrade.futuresResult.orderId}, ${this.selectedTrade.variant.symbol}`, ctx, this.logger)
            this.unselectTrade()
            return true
        } catch (error) {
            this.error = this.services.http.handleErrorMessage(error)
            TradeUtil.addError(error, ctx, this.logger)
            return false
        }
    }


    private async fullClosePosition(): Promise<boolean> {
        if (!this.selectedTrade) throw new Error('missing selected trade')
        const ctx = new TradeCtx({
            unit: this.unit,
            trade: this.selectedTrade,
        })
        ctx.position = this.findPosition(ctx.symbol)
        try {
            await this.services.binanceServie.fullClosePosition(ctx)
            this.openPositions = this.openPositions.filter(p => p.symbol === this.selectedTrade.variant.symbol)
            this.unselectTrade()
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
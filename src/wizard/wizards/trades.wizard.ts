import { Unit } from "src/unit/unit"
import { ServicesService } from "../services.service"
import { WizardStep } from "../wizard"
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
        const buttons: TelegramBot.InlineKeyboardButton[] = [
            ...this.getPendingPositionsButtons(),
            ...this.getOpenOrdersButtons()
        ]
        return [{
            order: 0,
            buttons: buttons,
            message: [`Select position or order...`],
            process: async (input: string) => {
                const position = this.pendingPositions.find(p => p.symbol.toLowerCase() === input)
                if (position) {
                    this.selectedTrade = this.findMatchingTrade(position)
                    if (this.selectedTrade) {
                        return 1
                    }
                }
                const order = this.openOrders.find(o => o.symbol.toLowerCase() === input)
                if (order) {
                    this.selectedTrade = this.findMatchingOrderTrade(order)
                    if (this.selectedTrade) {
                        return 2
                    }
                }
                return 0
            }
        }, {
            order: 1,
            message: this.selectedPositionMessage(),
            buttons: [{
                text: `Move stop loss to entry price`,
                callback_data: WizBtn.slToEntryPrice
            }, {
                text: `Move stop loss to...`,
                callback_data: WizBtn.slTo
            }, {
                text: `Take some profits`,
                callback_data: WizBtn.takeSomeProfits
            }, {
                text: `Close position with market price`,
                callback_data: WizBtn.closePosition
            }],
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
            message: ['Error'],
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
            order: 55,
            message: ['stoooop'],
            close: true
        }]

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

    private getPendingPositionsButtons(): TelegramBot.InlineKeyboardButton[] {
        if (this.order !== 0 || !this.pendingPositions?.length) return []
        const buttons: TelegramBot.InlineKeyboardButton[] = [{
            text: `Pending positions:`,
            callback_data: WizBtn.AVOID_BUTTON_CALLBACK
        }]
        for (const position of this.pendingPositions) {
            const trade = this.findMatchingTrade(position)
            const profit = Number(position.unRealizedProfit)
            const profitPrefix = profit > 0 ? '+' : ''
            buttons.push({
                text: `${TradeUtil.msgHeader(trade)}  /  ${profitPrefix}${profit.toFixed(2)} USDT  (${TradeUtil.profitPercent(position)}%)`,
                callback_data: position.symbol
            })
        }
        return buttons
    }

    private getOpenOrdersButtons(): TelegramBot.InlineKeyboardButton[] {
        if (this.order !== 0 || !this.openOrders?.length) return []
        const buttons: TelegramBot.InlineKeyboardButton[] = [{
            text: `Open orders:`,
            callback_data: WizBtn.AVOID_BUTTON_CALLBACK
        }]
        for (const o of this.openOrders) {
            const trade = this.findMatchingOrderTrade(o)
            buttons.push({
                text: `${TradeUtil.orderMsgHeader(o)} [${trade.variant.leverMax}x]`,
                callback_data: o.symbol
            })
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
        return matchingTrades[0]
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
        return ['Trade not selected...']
    }


    
    private selectedOrderMessage(): string[] {
        if (this.selectedTrade) {
            return [`TODO selected order message`]
        }
        return ['Order not selected...']
    }




    //     return [{
    //         order: 0,
    //         message: [
    //             `sl - to see open stop losses`,
    //             `tp - to see open take profits`,
    //             `stop - to interrupt`
    //         ],
    //         process: async (input: string) => {
    //             if ('sl' === input) {
    //                 this.order = 1
    //                 return [this.slOrders?.map(o => `${o.symbol} ${parseFloat(o.stopPrice)}$`).join(`\n`)]
    //             }
    //             return 0
    //         }
    //     }, {
    //         order: 1,
    //         message: [
    //             'provide token to move stop loss',
    //         ],
    //         process: async (input: string) => {
    //             const symbol = input.includes('usdt') ? input.toUpperCase() : `${input.toUpperCase()}USDT`
    //             const sl = this.slOrders.find(s => s.symbol === symbol)
    //             if (sl) {
    //                 this.selectedOrder = sl
    //                 return 2
    //             }
    //             return 0
    //         }
    //     }, {
    //         order: 2,
    //         message: [`Provide new SL stop price`],
    //         process: async (input: string) => {
    //             input = input.replace(',', '.')
    //             const price = Number(input)
    //             if (isNaN(price)) {
    //                 return [`${input} is not a number!`]
    //             }

    //             const response = await this.services.binance.moveStopLoss(
    //                 this.selectedOrder,
    //                 price,
    //                 this.unit
    //             )
    //             return response === 'success' ? 3 : 4
    //         }
    //     }, {
    //         order: 3,
    //         message: ['success'],
    //         close: true
    //     }, {
    //         order: 4,
    //         message: ['error'],
    //         close: true
    //     }]
    // }

}
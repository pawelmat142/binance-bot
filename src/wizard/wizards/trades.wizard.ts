import { Unit } from "src/unit/unit"
import { ServicesService } from "../services.service"
import { WizardStep } from "../wizard"
import { UnitWizard } from "./unit-wizard"
import { FuturesResult, Trade } from "src/binance/model/trade"
import { isBinanceError } from "src/binance/model/binance.error"
import { TradeType } from "src/binance/model/model"
import { WizBtn } from "./wizard-buttons"
import { Logger } from "@nestjs/common"
import TelegramBot from "node-telegram-bot-api"
import { Position } from "src/binance/wizard-binance.service"

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

    protected _init = async () => {
        const [trades, positions, openOrders] = await Promise.all([
            this.fetchTrades(),
            this.fetchPositions(),
            this.fetchOpenOrders(),
        ])

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
        const buttons: TelegramBot.InlineKeyboardButton[] = []
        if (this.openOrders?.length) buttons.push({
            text: `Open orders (${this.openOrders.length})`,
            callback_data: WizBtn.openOrders
        })
        if (this.pendingPositions?.length) buttons.push({
            text: `Pending positions (${this.pendingPositions?.length})`,
            callback_data: WizBtn.pendingPositions
        })

        return [{
            order: 0,
            message: [buttons.length ? `Orders and positions:` : `You have no orders or positions`],
            buttons: buttons,
            process: async (input: string) => {
                switch (input) {
                    case WizBtn.pendingPositions:
                        console.log(this.pendingPositions)
                        return 0
                        return 1

                    case WizBtn.openOrders:
                        return 2

                    default: return 0
                }
            }
        }, {
            order: 1,
            message: [`Open positions`],
            close: true
        }, {
            order: 2,
            message: [`Orders`],
            close: true
        }, {
            order: 3,
            message: [`rabbish`],
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
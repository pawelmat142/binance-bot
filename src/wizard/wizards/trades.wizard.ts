import { Unit } from "src/unit/unit"
import { ServicesService } from "../services.service"
import { WizardStep } from "../wizard"
import { UnitWizard } from "./unit-wizard"
import { FuturesResult } from "src/binance/model/trade"
import { BinanceError, isBinanceError } from "src/binance/model/binance.error"
import { TradeType } from "src/binance/model/model"

export class TradesWizard extends UnitWizard {

    constructor(unit: Unit, services: ServicesService) {
        super(unit, services)
    }

    openOrders: FuturesResult[]

    trades: FuturesResult[]

    selectedOrder: FuturesResult


    error: BinanceError

    protected _init = async () => this.initOpenOrders()

    public getSteps(): WizardStep[] {
        return [{
            order: 0,
            message: [
                `sl - to see open stop losses`,
                `tp - to see open take profits`,
                `stop - to interrupt`
            ],
            process: async (input: string) => {
                if ('sl' === input) {
                    this.order = 1
                    return [this.slOrders?.map(o => `${o.symbol} ${parseFloat(o.stopPrice)}$`).join(`\n`)]
                }
                return 0
            }
        }, {
            order: 1,
            message: [
                'provide token to move stop loss',
            ],
            process: async (input: string) => {
                const symbol = input.includes('usdt') ? input.toUpperCase() : `${input.toUpperCase()}USDT`
                const sl = this.slOrders.find(s => s.symbol === symbol)
                console.log(sl)
                if (sl) {
                    this.selectedOrder = sl
                    return 2
                }
                return 0
            }
        }, {
            order: 2,
            message: [`Provide new SL stop price`],
            process: async (input: string) => {
                input = input.replace(',', '.')
                const price = Number(input)
                if (isNaN(price)) {
                    return [`${input} is not a number!`]
                }

                const response = await this.services.binance.moveStopLoss(
                    this.selectedOrder,
                    price,
                    this.unit
                )
                return response === 'success' ? 3 : 4
            }
        }, {
            order: 3,
            message: ['success'],
            close: true
        }, {
            order: 4,
            message: ['error'],
            close: true
        }]
    }

    private get slOrders(): FuturesResult[] {
        return this.openOrders?.filter(o => o.type === TradeType.STOP_MARKET)
    }

    private async initOpenOrders() {
        const trades = await this.services.binance.fetchOpenOrders(this.unit)
        console.log(trades)
        if (Array.isArray(trades)) {
            this.openOrders = trades
        }
        if (isBinanceError(trades)) {
            this.error = trades
        }
    }


    private async initTrades() {
        const trades = await this.services.binance.fetchTrades(this.unit)
        if (Array.isArray(trades)) {
            this.trades = trades
        }
        if (isBinanceError(trades)) {
            this.error = trades
        }
    }

}
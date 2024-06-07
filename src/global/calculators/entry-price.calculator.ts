import { Logger } from "@nestjs/common";
import { Signal } from "src/signal/signal";
import { SignalUtil } from "src/signal/signal-util";
import { LimitOrder, TradeVariant } from "../../binance/model/trade-variant";
import { CalculationsService } from "src/binance/calculations.service";
import { Calculator } from "./calculator";
import { Http } from "../http/http.service";

export class EntryPriceCalculator extends Calculator {

    public static async start(signal: Signal, service: CalculationsService) {
        const calculator = new EntryPriceCalculator(service)
        calculator.initSignal(signal)
        await calculator.calculate()
    }

    private readonly logger = new Logger(this.constructor.name)

    private readonly DEFAULT_ORDERS_NUMBER = 2

    public initSignal(signal: Signal) {
        if (this.signal) throw new Error(`Signal already set`)
        this.signal = signal
    }

    private signal: Signal


    private get variant(): TradeVariant {
        return this.signal.variant
    }

    private get symbol(): string {
        return this.variant.symbol
    }

    private entryPriceDifference: number

    private limitPrices: number[] = []

    private limitOrders: LimitOrder[] = []

    public async calculate() {
        this.log('START')
        await this.fetchMarketPrice()
        this.resolveEntryByMarket()
        if (this.variant.entryByMarket) {
            this.log(`Enter by MARKET`)
            return
        }

        this.log(`Enter by ${this.DEFAULT_ORDERS_NUMBER} LIMIT orders`)

        this.calculateOrdersPrices()

        this.sortLimitOrderPrices()

        this.limitOrders = this.limitPrices.map((price, i) => {
            return {
                order: i,
                price: price
            }
        })

        this.variant.limitOrders = this.limitOrders

        this.log(`Enter by LIMIT orders with calculated prices: ${SignalUtil.limitOrderPricesString(this.variant)}`)

        this.log('STOP')
    }


    private calculateOrdersPrices() {

        this.entryPriceDifference = Math.abs(this.variant.entryZoneStart - this.variant.entryZoneEnd) 
            / (this.DEFAULT_ORDERS_NUMBER + 1)

        this.log(`Limit Orders price difference: ${this.entryPriceDifference.toFixed(2)}`)
        let entryPrice = Math.min(this.variant.entryZoneStart, this.variant.entryZoneEnd)

        for (let i = 0; i < this.DEFAULT_ORDERS_NUMBER; i++) {
            entryPrice += this.entryPriceDifference
            const orderPrice = this.service.fixPricePrecision(entryPrice, this.symbol)
            
            if (!orderPrice) {
                throw new Error(`Limit Orders price error ${orderPrice}`)
            }
            
            this.limitPrices.push(orderPrice)

        }
    }


    private sortLimitOrderPrices() {
        if (this.variant.side === 'BUY') {
            this.sortAscending()
        } else {
            this.sortDescending()
        }
    }

    private sortAscending() {
        this.limitPrices.sort((a, b) => a - b)
    }

    private sortDescending() {
        this.limitPrices.sort((a, b) => b - a)
    }

    private resolveEntryByMarket() {
        if (this.variant.side === 'BUY') {
            this.variant.entryByMarket = this.variant.marketPriceOnCalculate < this.variant.entryZoneEnd
        } else if (this.variant.side === 'SELL') {
            this.variant.entryByMarket = this.variant.marketPriceOnCalculate > this.variant.entryZoneEnd
        } else {
            throw new Error('mode error?')
        }
    }


    public async fetchMarketPrice() {
        const symbol = this.signal.variant.symbol
        try {
            const marketPrice = await this.service.fetchMarketPrice(symbol)
            this.signal.variant.marketPriceOnCalculate = marketPrice
            this.signal.variant.calculationTimestamp = new Date()
            SignalUtil.addLog(`Found Market Price: ${marketPrice.toFixed(2)} USDT`, this.signal, this.logger)
        } catch (error) {
            const msg = Http.handleErrorMessage(error)
            throw new Error(msg)
        }
    }


    private log(msg: string) {
        const log = `[${this.constructor.name}] - ${msg}`
        SignalUtil.addLog(log, this.signal, this.logger)
    }

    private error(msg: string) {
        const log = `[${this.constructor.name}] - ${msg}`
        SignalUtil.addError(log, this.signal, this.logger)
    }

    private warn(msg: string) {
        const log = `[${this.constructor.name}] - ${msg}`
        SignalUtil.addWarning(log, this.signal, this.logger)
    }


}
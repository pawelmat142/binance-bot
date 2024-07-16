import { LimitOrder, TradeVariant } from "../../binance/model/trade-variant";
import { Calculator } from "./calculator";
import { Http } from "../http/http.service";
import { Signal } from "../../signal/signal";
import { CalculationsService } from "../../binance/calculations.service";
import { LimitOrderUtil } from "../../binance/utils/limit-order-util";
import { SignalUtil } from "../../signal/signal-util";

export class EntryPriceCalculator extends Calculator<void> {

    public static start(signal: Signal, service: CalculationsService): Promise<void> {
        const calculator = new EntryPriceCalculator(service, signal.variant.symbol)
        calculator.initSignal(signal)
        return calculator.calculate()
    }


    private initSignal(signal: Signal) {
        if (this.signal) throw new Error(`Signal already set`)
        this.signal = signal
    }

    private signal: Signal


    private get variant(): TradeVariant {
        return this.signal.variant
    }


    private entryPriceDifference: number

    private limitPrices: number[] = []

    private limitOrders: LimitOrder[] = []

    protected async calculate(): Promise<void> {
        this.log('START')

        await this.fetchMarketPrice()
        this.log(`Found Market Price: ${this.signal.variant.marketPriceOnCalculate.toFixed(2)} USDT`)

        this.resolveEntryByMarket()

        if (this.variant.entryByMarket) {
            this.log(`Enter by MARKET`)
            return
        }

        this.log(`Enter by ${LimitOrderUtil.DEFAULT_ORDERS_NUMBER} LIMIT orders`)

        this.calculateOrdersPrices()

        this.sortLimitOrderPrices()

        this.limitOrders = this.limitPrices.map((price, i) => {
            return {
                order: i,
                price: price
            } as LimitOrder
        })

        this.variant.limitOrders = this.limitOrders
        this.log(`Enter by LIMIT orders with calculated prices: ${SignalUtil.limitOrderPricesString(this.variant)}`)
        this.log('STOP')
    }




    private calculateOrdersPrices() {
        if (this.variant.entryZoneStart === this.variant.entryZoneEnd) {
            this.addLimitPrice(this.variant.entryZoneStart)
            this.log(`Single entry Limit Order at ${this.variant.entryZoneStart.toFixed(2)}`)
            return
        }

        const diff = Math.abs(this.variant.entryZoneStart - this.variant.entryZoneEnd)
        this.entryPriceDifference = diff / (LimitOrderUtil.DEFAULT_ORDERS_NUMBER + 1)

        this.log(`Limit Orders price difference: ${this.entryPriceDifference.toFixed(2)}`)
        let entryPrice = Math.min(this.variant.entryZoneStart, this.variant.entryZoneEnd)

        for (let i = 0; i < LimitOrderUtil.DEFAULT_ORDERS_NUMBER; i++) {
            entryPrice += this.entryPriceDifference
            this.addLimitPrice(entryPrice)
        }
    }

    private addLimitPrice(entryPrice: number) {
        let orderPrice = this.fixPricePrecision(entryPrice)
        orderPrice = this.roundToTickSize(orderPrice)
        
        if (!orderPrice) {
            throw new Error(`Limit Orders price error ${orderPrice}`)
        }
        
        this.limitPrices.push(orderPrice.toNumber())
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
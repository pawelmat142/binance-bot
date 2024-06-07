import { Logger } from "@nestjs/common";
import { Signal } from "src/signal/signal";
import { SignalUtil } from "src/signal/signal-util";
import { TradeVariant } from "../../binance/model/trade-variant";

export class EntryPriceCalculator {

    public static async start(signal: Signal) {
        const calculator = new EntryPriceCalculator()
        calculator.initSignal(signal)
        await calculator.calculate()
    }

    private readonly logger = new Logger(this.constructor.name)

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



    public async calculate() {
        this.log('START')
        this.resolveEntryByMarket()
        if (this.variant.entryByMarket) {
            this.log(`Enter by MARKET`)
            return
        }

        // TODO
        console.log('multiple orders')

        this.log('STOP')
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
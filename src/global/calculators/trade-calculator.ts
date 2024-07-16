import Decimal from "decimal.js"
import { CalculationsService } from "../../binance/calculations.service"
import { Trade } from "../../binance/model/trade"
import { TradeCtx, TradeVariant } from "../../binance/model/trade-variant"
import { TradeUtil } from "../../binance/utils/trade-util"
import { Calculator } from "./calculator"
import { Logger } from "@nestjs/common"

export interface CalculatorParams {
    forcedPrice?: number
}

export class TradeCalculator<T> extends Calculator<T> {

    // T = Type should be equal

    public static start<Type>(ctx: TradeCtx, service: CalculationsService, params?: CalculatorParams): Promise<Type> {
        const calculator = new this(service, ctx.symbol)
        calculator.params = params || {}
        calculator.initTradeCtx(ctx)
        return calculator.calculate() as Promise<Type>
    }

    protected ctx: TradeCtx
    protected params: CalculatorParams

    protected get identifier(): string {
        return this.ctx.unit.identifier
    }

    protected get tradeAmount(): number {
        const testValue = this.getTestTradeAmount()
        if (testValue) {
            return testValue
        }

        let signalSource = this.ctx.trade.variant.signalSource
        if (!signalSource) {
            throw new Error(`Missing signal source`)
        }
        const amount = this.ctx.unit.tradeAmounts.get(signalSource)
        if (!amount) {
            throw new Error(`Not found trade amount for ${signalSource}`)
        }
        return amount
    }

    private getTestTradeAmount(): number {
        const env = process.env.TEST_TRADE_AMOUNT
        if (env) {
            const value = Number(env)
            if (!isNaN(value)) {
                new Logger.warn(`used ${value} USDT TEST_TRADE_AMOUNT`)
                return value
            }
        }
    }

    protected get trade(): Trade {
        return this.ctx.trade
    }

    protected get variant(): TradeVariant {
        return this.ctx.trade.variant
    }
    
    protected get lever(): number {
        return this.ctx.lever
    }


    private initTradeCtx(ctx: TradeCtx) {
        this.ctx = ctx
        this.init()
    }

    protected init() {
        // may be overrided
    }


    protected roundWithFraction (input: Decimal, fraction: Decimal) {
        return new Decimal(Math.ceil(input.div(fraction).toNumber())).times(fraction)
    }

    protected findMax (...values: Decimal[])  {
        return new Decimal(Math.max(...values.map(v => v.toNumber())))
    }



    protected log(msg: string) {
        const log = `[${this.constructor.name}] - ${msg}`
        TradeUtil.addLog(log, this.ctx, this.logger)
    }

    protected error(msg: string) {
        const log = `[${this.constructor.name}] - ${msg}`
        TradeUtil.addError(log, this.ctx, this.logger)
    }

    protected warn(msg: string) {
        const log = `[${this.constructor.name}] - ${msg}`
        TradeUtil.addWarning(log, this.ctx, this.logger)
    }


    protected findTradeAmount(): Decimal {
        let tradeAmount = new Decimal(this.tradeAmount)

        if (tradeAmount.times(this.lever).lessThan(this.minNotional)) {
            if (this.ctx.unit.allowMinNotional) {
                tradeAmount = this.minNotional.div(this.lever) 
            } else {
                throw new Error(`USDT per transaction is not enough for this position`)
            }
        }

        if (!tradeAmount || tradeAmount.equals(0)) throw new Error(`usdtAmount not found or 0`)
        if (!this.variant.marketPriceOnCalculate) throw new Error(`Missing market price`)

        return tradeAmount
    }

}
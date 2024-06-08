import Decimal from "decimal.js"
import { CalculationsService } from "../../binance/calculations.service"
import { FuturesExchangeInfoSymbol } from "../../binance/model/model"
import { Trade } from "../../binance/model/trade"
import { TradeCtx, TradeVariant } from "../../binance/model/trade-variant"
import { TradeUtil } from "../../binance/utils/trade-util"
import { Calculator } from "./calculator"

export class TradeCalculator<T> extends Calculator<T> {

    // T === Type !!

    public static start<Type>(ctx: TradeCtx, service: CalculationsService): Promise<Type> {
        const calculator = new this(service)
        calculator.initTradeCtx(ctx)
        return calculator.calculate() as Promise<Type>
    }

    protected result: T

    protected ctx: TradeCtx

    protected get identifier(): string {
        return this.ctx.unit.identifier
    }

    protected get usdtPerTransaction(): number {
        return this.ctx.unit.usdtPerTransaction
    }



    protected get trade(): Trade {
        return this.ctx.trade
    }

    protected get variant(): TradeVariant {
        return this.ctx.trade.variant
    }
    
    protected get symbol(): string {
        return this.variant.symbol
    }

    protected get lever(): number {
        return this.ctx.lever
    }


    protected symbolInfo: FuturesExchangeInfoSymbol
    protected minNotional: Decimal
    protected minQty: Decimal
    protected stepSize: Decimal

    private initTradeCtx(ctx: TradeCtx) {
        this.ctx = ctx
        this.symbolInfo = this.service.getExchangeInfo(this.symbol)
        this.minNotional = this.service.getMinNotional(this.symbolInfo)
        const { minQty, stepSize } = this.service.getLotSize(this.symbolInfo)
        this.minQty = minQty 
        this.stepSize = stepSize
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


    protected findUsdtAmount(): Decimal {
        let usdtAmount = new Decimal(this.usdtPerTransaction)

        if (usdtAmount.times(this.lever).lessThan(this.minNotional)) {
            if (this.ctx.unit.allowMinNotional) {
                usdtAmount = this.minNotional.div(this.lever) 
            } else {
                throw new Error(`USDT per transaction is not enough for this position`)
            }
        }

        if (!usdtAmount || usdtAmount.equals(0)) throw new Error(`usdtAmount not found or 0`)
        if (!this.variant.marketPriceOnCalculate) throw new Error(`Missing market price`)

        return usdtAmount
    }

}
import { CalculationsService } from "src/binance/calculations.service"
import { Calculator } from "./calculator"
import { Trade } from "src/binance/model/trade"
import { TradeCtx, TradeVariant } from "src/binance/model/trade-variant"
import { TradeUtil } from "src/binance/trade-util"
import { FuturesExchangeInfoSymbol } from "src/binance/model/model"
import Decimal from "decimal.js"

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
    }



    protected roundWithFraction (input: Decimal, fraction: Decimal) {
        return new Decimal(Math.ceil(input.div(fraction).toNumber())).times(fraction)
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

}
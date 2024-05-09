import { Prop } from "@nestjs/mongoose";
import { FuturesResult, Trade } from "./trade";
import { TradeStatus } from "./model";
import { Unit } from "src/unit/unit";
import Decimal from "decimal.js";

export type TradeSide = 'BUY' | 'SELL'


export interface TakeProfit {
    order: number
    price: number
    closePercent: number

    quantity?: number
    reuslt?: FuturesResult
    resultTime?: Date
}

export class TradeVariant {
    @Prop() side: TradeSide
    @Prop() symbol: string
    @Prop() entryZoneStart: number
    @Prop() entryZoneEnd: number
    @Prop() takeProfits: TakeProfit[]
    @Prop() stopLoss: number
    @Prop() leverMin: number
    @Prop() leverMax: number
    @Prop() risk: boolean
    @Prop() highRisk: boolean
    @Prop() percentOfBalance?: number
}

export interface TradeContext {
    trade: Trade
    unit: Unit
}

export class TradeCtx implements TradeContext {

    trade: Trade
    unit: Unit

    constructor(ctx: TradeContext) {
        this.trade = ctx.trade
        this.unit = ctx.unit
    }

    public error = false

    public get filled(): boolean {
        return this.trade?.futuresResult?.status === 'FILLED'
    }
    
    public get placedOnly(): boolean {
        return this.trade?.futuresResult?.status === 'NEW'
    }

    public get status(): string {
        return this.trade?.futuresResult?.status
    }

    public get symbol(): string {
        return this.trade?.variant?.symbol
    }

    public get side(): string {
        return this.trade?.variant?.side
    }

    public get stopLossSide(): TradeSide {
        const side = this.trade?.variant?.side
        if (!side) {
            throw new Error('this.trade?.variant?.side - falsy')
        }
        return this.trade?.variant.side === 'BUY' ? 'SELL' : 'BUY'
    }

    public get takeProfitSide(): TradeSide {
        return this.stopLossSide
    }

    public get origQuantity(): Decimal {
        const origQuantity = this.trade.futuresResult.origQty
        if (!origQuantity) {
            throw new Error(`origQuantity could not be found`)
        }
        return new Decimal(origQuantity)
    }

    public get takeProfitQuentitesSum(): Decimal {
        var sum = new Decimal(0)
        this.trade.variant.takeProfits.forEach(tp => {
            if (tp.quantity) {
                sum = sum.add(new Decimal(tp.quantity))
            }
        })
        return sum
    }

    public get takeProfitOrigQuentitesSum(): number {
        return this.trade.variant.takeProfits
        .reduce((acc, tp) => acc + (Number(tp.reuslt?.origQty ??0)), 0)
    }

    public get lever(): number {
        return this.trade.variant.leverMin
    }

    public get stopLossProvided(): boolean {
        return !!this.trade.variant.stopLoss
    }

    public get stopLossPlaced(): boolean {
        return [TradeStatus.NEW].includes(this.trade.stopLossResult?.status)
    }

    public get stopLossFilled(): boolean {
        return [TradeStatus.FILLED].includes(this.trade.stopLossResult?.status)
    }

    public getTakeProfit(order: number): TakeProfit {
        const tp = this.trade.variant.takeProfits[order]
        if (!tp) {
            throw new Error(`Theres no take profit with order: ${order}`)
        }
        return tp
    }

    public takeProfitPlaced(order: number): boolean {
        const tp = this.getTakeProfit(order)
        return [TradeStatus.NEW].includes(tp.reuslt?.status)
    }
    
    public takeProfitFilled(order: number): boolean {
        const tp = this.getTakeProfit(order)
        return [TradeStatus.FILLED].includes(tp.reuslt?.status)
    }

}

import { Prop } from "@nestjs/mongoose";
import { FuturesResult, Trade, TradeStatus } from "./trade";
import { Unit } from "src/unit/unit";
import Decimal from "decimal.js";
import { Position } from "../wizard-binance.service";
import { VariantSide, VariantUtil } from "../utils/variant-util";

export class TakeProfit {
    @Prop() order: number
    @Prop() price: number
    @Prop() closePercent: number

    @Prop() quantity?: number
    @Prop() reuslt?: FuturesResult
    @Prop() resultTime?: Date
    @Prop() takeSomeProfitFlag?: boolean
}

export class TradeVariant {
    @Prop() side: VariantSide
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

    @Prop() marketPriceOnCalculate: number
    @Prop() calculationTimestamp: Date
    @Prop() entryByMarket: boolean
    @Prop() limitOrders?: LimitOrder[]
}

export interface LimitOrder {
    price: number
    order: number
    
    quantity?: number
    result?: FuturesResult
}

export interface TradeContext {
    trade: Trade
    unit: Unit
}

export class TradeCtx implements TradeContext {

    trade: Trade
    unit: Unit
    position?: Position

    constructor(ctx: TradeContext) {
        this.trade = ctx.trade
        this.unit = ctx.unit
    }

    public error = false

    public get filled(): boolean {
        return this.trade?.futuresResult?.status === 'FILLED'
    }
    
    public get status(): string {
        return this.trade?.futuresResult?.status
    }

    public get symbol(): string {
        return this.trade?.variant?.symbol
    }

    public get side(): VariantSide {
        return this.trade?.variant?.side
    }

    public get origQuantity(): Decimal {
        const origQuantity = this.trade.futuresResult.origQty
        if (!origQuantity) {
            throw new Error(`origQuantity could not be found`)
        }
        return new Decimal(origQuantity)
    }


    public get takeProfitOrigQuentitesSum(): number {
        return this.trade.variant.takeProfits
        .reduce((acc, tp) => acc + (Number(tp.reuslt?.origQty ??0)), 0)
    }

    public get lever(): number {
        return VariantUtil.lever(this.trade.variant)
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

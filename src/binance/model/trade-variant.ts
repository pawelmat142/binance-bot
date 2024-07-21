import { Prop } from "@nestjs/mongoose";
import { FuturesResult, Trade, TradeStatus } from "./trade";
import Decimal from "decimal.js";
import { Position } from "../wizard-binance.service";
import { SignalSource, VariantSide, VariantUtil } from "../utils/variant-util";
import { Unit } from "../../unit/unit";
import { LimitOrderUtil } from "../utils/limit-order-util";
import { Document } from 'mongoose';
import { BinanceError } from "./binance.error";

export class TakeProfit extends Document {
    @Prop() order: number
    @Prop() price: number
    @Prop() closePercent: number

    @Prop() quantity?: number
    @Prop({ type: FuturesResult }) result?: FuturesResult
    @Prop() resultTime?: Date
    @Prop() takeSomeProfitFlag?: boolean
}

export class LimitOrder extends Document {
    @Prop() price: number
    @Prop() order: number
    
    @Prop() quantity?: number
    @Prop({ type: FuturesResult }) result?: FuturesResult
    @Prop({ type: Object }) error?: BinanceError
}

export class TradeVariant extends Document {
    @Prop() signalSource: SignalSource
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

    public get status(): string {
        return this.trade?.marketResult?.status
    }

    public get symbol(): string {
        return this.trade?.variant?.symbol
    }

    public get side(): VariantSide {
        return this.trade?.variant?.side
    }

    public get entryByMarket(): boolean {
        return this.trade.variant.entryByMarket
    }

    public get filledQuantity(): Decimal {
        return this.trade.variant.entryByMarket
            ? this.marketFilledQuantity
            : this.limitFilledQuantity
    }

    public get marketFilledQuantity(): Decimal {
        const origQuantity = this.trade.marketResult.origQty
        if (!origQuantity) {
            throw new Error(`origQuantity could not be found`)
        }
        return new Decimal(origQuantity)
    }

    public get limitFilledQuantity(): Decimal {
        if (!this.trade.variant.limitOrders) {
            throw new Error(`Limit Orders not found`)
        }
        return LimitOrderUtil.limitOrderQuantitiesFilledSum(this.trade.variant)
    }


    public get takeProfitOrigQuentitesSum(): number {
        return this.trade.variant.takeProfits
            .reduce((acc, tp) => acc + (Number(tp.result?.origQty ??0)), 0)
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
        return [TradeStatus.NEW].includes(tp.result?.status)
    }
    
    public takeProfitFilled(order: number): boolean {
        const tp = this.getTakeProfit(order)
        return [TradeStatus.FILLED].includes(tp.result?.status)
    }

}

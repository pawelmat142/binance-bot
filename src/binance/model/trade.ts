import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { Expose } from "class-transformer"
import { HydratedDocument } from "mongoose"
import { TradeVariant } from "./trade-variant"


export abstract class TradeStatus {
    public static readonly FILLED = 'FILLED'
    public static readonly NEW = 'NEW'
    public static readonly CANCELED = 'CANCELED'
    public static readonly CLOSED_MANUALLY = 'CLOSED_MANUALLY'
}

export abstract class TradeType {
    public static readonly MARKET = 'MARKET' // market order is an order to buy or sell at the best available price
    public static readonly LIMIT = 'LIMIT' //A limit order is an order to buy or sell at a specific price or better
    public static readonly STOP_MARKET = 'STOP_MARKET' //A stop market order will become a market order to buy or sell once the stop price is reached.
    public static readonly TAKE_PROFIT_MARKET = 'TAKE_PROFIT_MARKET' //A take profit market order will become a market order to buy or sell once the take profit price is reached
}

export type TradeDocument = HydratedDocument<Trade>

export class FuturesResult {
    @Expose() @Prop({ type: 'string' }) orderId: BigInt // The unique identifier for the order  zamieniam typ przez buga z BigInt  https://github.com/jaggedsoft/node-binance-api/issues/539
    @Expose() @Prop() symbol: string // The trading pair symbol for the order (e.g., ‘BTCUSDT’).
    @Expose() @Prop() status: string // The current status of the order (e.g., ‘FILLED’, ‘NEW’).
    @Expose() @Prop() clientOrderId: string //The unique identifier for the order provided by the client
    @Expose() @Prop() price: string // The price per unit for the order
    @Expose() @Prop() averagePrice: string // The time the order was last updated
    @Expose() @Prop() origQty: string //The original quantity of the order
    @Expose() @Prop() executedQty: string // The quantity of the order that has been executed
    @Expose() @Prop() cumQuote: string // The cumulative quote asset transacted quantity
    @Expose() @Prop() timeInForce: string // The time in force policy of the order
    @Expose() @Prop() type: string // The type of the order
    @Expose() @Prop() reduceOnly: boolean // A boolean indicating if the order is reduce only
    @Expose() @Prop() closePosition: boolean // A boolean indicating if the order is to close the position
    @Expose() @Prop() side: string // The side of the order (e.g., ‘BUY’, ‘SELL’).
    @Expose() @Prop() stopPrice: string // The stop price for the order
    @Expose() @Prop() priceProtect: boolean // A boolean indicating if the order has price protection
    @Expose() @Prop() origType: string // The original type of the order
    @Expose() @Prop() updateTime: number // The time the order was last updated
    @Expose() @Prop() timestamp: Date
}

@Schema()
export class Trade {

    public static readonly testName = `${Trade.name}-test`

    @Expose() 
    @Prop({ required: true })
    _id: string

    @Expose() 
    @Prop()
    signalObjectId: string

    @Expose() 
    @Prop({ required: true })
    logs: string[]
    
    
    @Expose() 
    @Prop({ required: true, type: Object })
    variant: TradeVariant

    @Expose() 
    @Prop()
    unitIdentifier: string

    @Expose() 
    @Prop()
    timestamp: Date

    @Expose() 
    @Prop()
    futuresResult: FuturesResult

    
    @Expose()
    @Prop()
    stopLossResult: FuturesResult

    @Expose()
    @Prop()
    stopLossTime: Date

    @Expose()
    @Prop()
    closed: boolean
}

export const TradeSchema = SchemaFactory.createForClass(Trade)


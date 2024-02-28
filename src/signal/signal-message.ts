import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import { Expose } from "class-transformer";
import { TradeVariant } from "src/binance/model/trade-variant";

export type SignalDocument = HydratedDocument<SignalMessage>

export type SignalTradeMode = 'PROGRESS' | 'STOP_LOST' | 'WINNING' | 'WON' | 'ERROR' | 'STOPPED'

@Schema()
export class SignalMessage {

    @Prop()
    _id: string

    @Expose() 
    @Prop({ required: true })
    content: string

    @Expose() 
    @Prop({ required: true })
    timestamp: Date

    @Expose() 
    @Prop()
    telegramMessageId: string
    
    @Prop()
    @Expose() 
    tradeVariant: TradeVariant

    @Expose() 
    @Prop()
    valid: boolean

    @Expose()
    @Prop()
    stopLossUngiven: boolean //if stopLossUngiven===true -> stopLoss is calculated as 30% of min entry

    @Expose()
    @Prop()
    logs: string[]

}

export const SignalMessageSchema = SchemaFactory.createForClass(SignalMessage)

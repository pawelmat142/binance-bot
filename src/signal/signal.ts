import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import { Expose } from "class-transformer";
import { TradeVariant } from "src/binance/model/trade-variant";

export type SignalDocument = HydratedDocument<Signal>

export class OtherSignalAction {
    @Expose() @Prop() takeSomgeProfit?: boolean
    @Expose() @Prop() manualClose?: boolean
    @Expose() @Prop() moveSl?: boolean
    @Expose() @Prop() moveSlToEntryPoint?: boolean
}

@Schema()
export class Signal {

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
    logs: string[]
    
    @Expose()
    @Prop()
    otherSignalAction?: OtherSignalAction
}



export const SignalSchema = SchemaFactory.createForClass(Signal)

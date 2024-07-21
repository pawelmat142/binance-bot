import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import { SignalSource } from "../binance/utils/variant-util";

export type UnitDocument = HydratedDocument<Unit>

@Schema()
export class Unit {

    @Prop()
    _id: string

    @Prop({ required: true })
    identifier: string

    @Prop()
    active: boolean

    @Prop()
    listenJsons: string[]

    @Prop()
    tradeAmounts: Map<string, number> //key: signal source, value: usdt amount per trade

    @Prop()
    binanceApiKey: string

    @Prop()
    binanceApiSecret: string


    @Prop()
    telegramChannelId?: string


    @Prop()
    listenKey?: string

    @Prop()
    allowMinNotional?: boolean

    @Prop()
    adminSignalSource?: SignalSource
}

export const UnitSchema = SchemaFactory.createForClass(Unit)

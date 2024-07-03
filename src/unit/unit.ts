import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

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
    usdtPerTransaction: number

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
}

export const UnitSchema = SchemaFactory.createForClass(Unit)

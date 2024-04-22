import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import { WebSocket } from 'ws';

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
    tradeObjectIds: string[]

    @Prop()
    usdtPerTransaction: number

    @Prop()
    allow100perBtcTransaction: boolean

    @Prop()
    binanceApiKey: string

    @Prop()
    binanceApiSecret: string


    @Prop()
    telegramChannelId?: string


    @Prop()
    listenKey?: string

    socket?: WebSocket
}

export const UnitSchema = SchemaFactory.createForClass(Unit)

import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { FuturesResult, Trade, TradeStatus } from "./model/trade";
import { Model } from "mongoose";
import { Unit } from "src/unit/unit";
import { TradeCtx } from "./model/trade-variant";
import { TradeUtil } from "./trade-util";
import { newObjectId } from "src/global/util";
import { Signal } from "src/signal/signal";

@Injectable()
export class TradeRepository {

    private readonly logger = new Logger(TradeRepository.name)

    constructor(
        @InjectModel(Trade.name) private tradeModel: Model<Trade>,
    ) {}

    public findBySymbol(ctx: TradeCtx): Promise<Trade[]> {
        return this.tradeModel.find({
            unitIdentifier: ctx.unit.identifier,
            closed: { $ne: true },
            "variant.symbol": ctx.trade.variant.symbol
        })
    }

    public findByUnit(unit: Unit): Promise<Trade[]> {
        return this.tradeModel.find({
            unitIdentifier: unit.identifier,
            closed: { $ne: true }
        }).exec()
    }

    public findBySignal(signal: Signal, unit: Unit): Promise<Trade> {
        return this.tradeModel.findOne({
            closed: { $ne: true },
            unitIdentifier: unit.identifier,
            "variant.symbol": signal.tradeVariant.symbol
        }).exec()
    }

    public findByTradeEvent(eventTradeResult: FuturesResult, unit: Unit): Promise<Trade> {
        return this.tradeModel.findOne({
            unitIdentifier: unit.identifier,
            closed: { $ne: true },
            $or: [
                { "futuresResult.orderId": eventTradeResult.orderId },
                { "stopLossResult.orderId": eventTradeResult.orderId },
                { "variant.takeProfits.reuslt.orderId": eventTradeResult.orderId },
            ]
        }).exec()
    }

    public findInProgress(ctx: TradeCtx): Promise<Trade> {
        return this.tradeModel.findOne({
            "unitIdentifier": ctx.unit.identifier,
            "futuresResult.side": ctx.side,
            "futuresResult.symbol": ctx.symbol,
            "futuresResult.status": { $in: [ TradeStatus.NEW, TradeStatus.FILLED ] },
            closed: { $ne: true }
        })
    }

    public async save(ctx: TradeCtx) {
        if (process.env.SKIP_SAVE_TRADE === 'true') {
            this.logger.debug('[SKIP] Saved trade')
        }
        ctx.trade._id = newObjectId()
        ctx.trade.timestamp = new Date()
        const newTrade = new this.tradeModel(ctx.trade)
        newTrade.testMode = process.env.TEST_MODE === 'true'

        TradeUtil.addLog(`Saving trade ${newTrade._id}`, ctx, this.logger)
        const saved = await newTrade.save()
        return saved
    }

    public update(ctx: TradeCtx) {
        if (process.env.SKIP_SAVE_TRADE === 'true') {
            this.logger.debug('[SKIP] Updated trade')
        }
        ctx.trade.timestamp = new Date()
        TradeUtil.addLog(`Updating trade ${ctx.trade._id}`, ctx, this.logger)
        return this.tradeModel.updateOne(
            { _id: ctx.trade._id },
            { $set: ctx.trade }
        ).exec()
    }

    public prepareTrade(signal: Signal): Trade {
        const variant = signal.tradeVariant
        const trade = new this.tradeModel({
            signalObjectId: signal._id,
            logs: signal.logs || [],
            variant: variant,
        })
        return trade
    }

    public closeTrade(ctx: TradeCtx) {
        ctx.trade.closed = true
        if (ctx.trade.futuresResult) {
            ctx.trade.futuresResult.status = TradeStatus.CLOSED_MANUALLY
        }
        if (ctx.trade.stopLossResult) {
            ctx.trade.stopLossResult.status = TradeStatus.CLOSED_MANUALLY
        }
        for (let tp of ctx.trade.variant.takeProfits || []) {
            if (tp.reuslt) {
                tp.reuslt.status = TradeStatus.CLOSED_MANUALLY
            }
        }
        return this.update(ctx)
    }

}
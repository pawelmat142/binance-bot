import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { FuturesResult, Trade, TradeStatus } from "./model/trade";
import { Model } from "mongoose";
import { Unit } from "src/unit/unit";
import { TradeCtx } from "./model/trade-variant";
import { TradeUtil } from "./utils/trade-util";
import { newObjectId } from "src/global/util";
import { Signal } from "src/signal/signal";

@Injectable()
export class TradeRepository {

    private readonly logger = new Logger(TradeRepository.name)

    private model: Model<Trade>

    constructor(
        @InjectModel(Trade.name) private tradeModel: Model<Trade>,
        @InjectModel(Trade.testName) private testTradeModel: Model<Trade>,
    ) {
        if (process.env.TEST_TRADE_COLLECTION === 'true') {
            this.logger.warn(`TEST_TRADE_COLLECTION ON`)
            this.model = this.testTradeModel
        } else {
            this.logger.warn(`TEST_TRADE_COLLECTION OFF`)
            this.model = this.tradeModel
        }
    }

    public findBySymbol(ctx: TradeCtx): Promise<Trade[]> {
        return this.model.find({
            unitIdentifier: ctx.unit.identifier,
            closed: { $ne: true },
            "variant.symbol": ctx.trade.variant.symbol
        })
    }

    public findByUnit(unit: Unit): Promise<Trade[]> {
        return this.model.find({
            unitIdentifier: unit.identifier,
            closed: { $ne: true }
        }).exec()
    }

    public findBySignal(signal: Signal, unit: Unit): Promise<Trade[]> {
        return this.model.find({
            closed: { $ne: true },
            unitIdentifier: unit.identifier,
            "variant.symbol": signal.variant.symbol
        }).exec()
    }

    public findByTradeEvent(eventTradeResult: FuturesResult, unit: Unit): Promise<Trade> {
        return this.model.findOne({
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
        return this.model.findOne({
            "unitIdentifier": ctx.unit.identifier,
            "futuresResult.side": ctx.side,
            "futuresResult.symbol": ctx.symbol,
            "futuresResult.status": { $in: [ TradeStatus.NEW, TradeStatus.FILLED ] },
            closed: { $ne: true }
        })
    }

    public async save(ctx: TradeCtx) {
        if (process.env.SKIP_SAVE_TRADE === 'true') {
            this.logger.warn('[SKIP] Saved trade')
        }
        ctx.trade._id = newObjectId()
        ctx.trade.timestamp = new Date()
        const newTrade = new this.model(ctx.trade)

        TradeUtil.addLog(`Saving trade ${newTrade._id}`, ctx, this.logger)
        const saved = await newTrade.save()
        return saved
    }

    public update(ctx: TradeCtx) {
        if (process.env.SKIP_SAVE_TRADE === 'true') {
            this.logger.warn('[SKIP] Updated trade')
        }
        ctx.trade.timestamp = new Date()
        TradeUtil.addLog(`Updating trade ${ctx.trade._id}`, ctx, this.logger)
        return this.model.updateOne(
            { _id: ctx.trade._id },
            { $set: ctx.trade }
        ).exec()
    }

    public prepareTrade(signal: Signal, unitIdentifier: string): Trade {
        const trade = new this.model({
            signalObjectId: signal._id,
            logs: signal.logs || [],
            variant: signal.variant,
            unitIdentifier: unitIdentifier
        })
        return trade
    }

    public closeTradeManual(ctx: TradeCtx) {
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

    public findOpenOrdersForPriceTicker() {
        return this.model.find({
            closed: { $ne: true },
            "futuresResult.status": TradeStatus.NEW,
        }, { 
            "variant.symbol": true, 
            "variant.side": true, 
            "variant.takeProfits": true
        }).exec()
    }

    public findOpenOrdersBySymbol(symbol: string) {
        return this.model.find({
            closed: { $ne: true },
            "futuresResult.status": TradeStatus.NEW,
            "futuresResult.symbol": symbol
        }).exec()
    }

}
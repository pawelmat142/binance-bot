import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { FuturesResult, Trade, TradeStatus } from "./model/trade";
import { Model } from "mongoose";
import { Signal } from "../signal/signal";
import { Unit } from "../unit/unit";
import { TradeCtx } from "./model/trade-variant";
import { TradeUtil } from "./utils/trade-util";
import { Util } from "./utils/util";
import { Position } from "./wizard-binance.service";

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

    public findBySymbol(unit: Unit, symbol: string): Promise<Trade[]> {
        return this.model.find({
            unitIdentifier: unit.identifier,
            closed: { $ne: true },
            "variant.symbol": symbol
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

    public findByPosition(position: Position, unit: Unit): Promise<Trade[]> {
        return this.model.find({
            closed: { $ne: true },
            unitIdentifier: unit.identifier,
            "variant.symbol": position.symbol
        }).exec()
    }


    public findByFilledMarketOrder(eventTradeResult: FuturesResult, unit: Unit): Promise<Trade> {
        return this.model.findOne({
            unitIdentifier: unit.identifier,
            "marketResult.clientOrderId": eventTradeResult.clientOrderId
        })
    }
    
    public findByFilledStopLoss(eventTradeResult: FuturesResult, unit: Unit): Promise<Trade> {
        return this.model.findOne({
            unitIdentifier: unit.identifier,
            "stopLossResult.clientOrderId": eventTradeResult.clientOrderId
        })
    }
    
    public findByFilledTakeProfit(eventTradeResult: FuturesResult, unit: Unit): Promise<Trade> {
        return this.model.findOne({
            unitIdentifier: unit.identifier,
            "variant.takeProfits.result.clientOrderId": eventTradeResult.clientOrderId
        })
    }
    
    public findByFilledLimitOrder(eventTradeResult: FuturesResult, unit: Unit): Promise<Trade> {
        return this.model.findOne({
            unitIdentifier: unit.identifier,
            "variant.limitOrders.result.clientOrderId": eventTradeResult.clientOrderId
        })
    }

    public findInProgress(ctx: TradeCtx): Promise<Trade> {
        return this.model.findOne({
            closed: { $ne: true },
            "unitIdentifier": ctx.unit.identifier,
            "variant.side": ctx.side,
            "variant.symbol": ctx.symbol,
            $or: [
                { "marketResult.status": TradeStatus.FILLED },
                { "variant.limitOrders.result.status": { $in: [ TradeStatus.NEW, TradeStatus.FILLED ] } }
            ],
        })
    }

    public async save(ctx: TradeCtx) {
        if (process.env.SKIP_SAVE_TRADE === 'true') {
            this.logger.warn('[SKIP] Saved trade')
        }
        this.convertBigIntOrderIdsToString(ctx.trade)
        ctx.trade._id = Util.newObjectId()
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
        this.convertBigIntOrderIdsToString(ctx.trade)
        ctx.trade.timestamp = new Date()
        TradeUtil.addLog(`Updating trade ${ctx.trade._id}`, ctx, this.logger)
        return this.model.updateOne(
            { _id: ctx.trade._id },
            { $set: ctx.trade }
        ).exec()
    }

    private convertBigIntOrderIdsToString(trade: Trade) {
        if (trade.marketResult) {
            trade.marketResult.orderId = trade.marketResult.orderId.toString()
        }
        if (trade.stopLossResult) {
            trade.stopLossResult.orderId = trade.stopLossResult.orderId.toString()
        }
        for (let lo of (trade?.variant?.limitOrders || [])) {
            if (lo.result?.orderId) {
                lo.result.orderId = lo.result.orderId.toString()
            }
        }
        for (let tp of (trade?.variant?.takeProfits || [])) {
            if (tp.result?.orderId) {
                tp.result.orderId = tp.result.orderId.toString()
            }
        }
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
        if (ctx.trade.marketResult) {
            ctx.trade.marketResult.status = TradeStatus.CLOSED_MANUALLY
        }
        if (ctx.trade.stopLossResult) {
            ctx.trade.stopLossResult.status = TradeStatus.CLOSED_MANUALLY
        }
        for (let tp of ctx.trade.variant.takeProfits || []) {
            if (tp.result) {
                tp.result.status = TradeStatus.CLOSED_MANUALLY
            }
        }
        for (let lo of ctx.trade.variant.limitOrders || []) {
            if (lo.result) {
                lo.result.status = TradeStatus.CLOSED_MANUALLY
            }
        }
        return this.update(ctx)
    }

    public findOpenOrdersForPriceTicker() {
        return this.model.find({
            closed: { $ne: true },
            "variant.limitOrders.result.status": TradeStatus.NEW,
        }, { 
            "variant.symbol": true, 
            "variant.side": true, 
            "variant.takeProfits": true
        }).exec()
    }

    public findOpenOrdersBySymbol(symbol: string) {
        return this.model.find({
            closed: { $ne: true },
            "variant.limitOrders.result.status": TradeStatus.NEW,
            "variant.symbol": symbol
        }).exec()
    }

}
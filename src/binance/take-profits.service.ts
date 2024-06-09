import { Injectable, Logger } from "@nestjs/common";
import { TradeService } from "./trade.service";
import { CalculationsService } from "./calculations.service";
import { TakeProfit, TradeCtx } from "./model/trade-variant";
import { FuturesResult, TradeStatus, TradeType } from "./model/trade";
import { TradeRepository } from "./trade.repo";
import { TradeUtil } from "./utils/trade-util";
import { TPUtil } from "./utils/take-profit-util";
import { TelegramService } from "../telegram/telegram.service";
import { TakeProfitsQuantityCalculator } from "../global/calculators/take-profits-quantity.calculator";
import { VariantUtil } from "./utils/variant-util";
import Decimal from "decimal.js";

@Injectable()
export class TakeProfitsService {

    private readonly logger = new Logger(this.constructor.name)

    constructor(
        private readonly tradeService: TradeService,
        private readonly calculationsService: CalculationsService,
        private readonly tradeRepo: TradeRepository,
        private readonly telegramService: TelegramService,
    ) {}


    public async openFirstTakeProfit(ctx: TradeCtx) {
        if (!ctx.trade.variant.takeProfits?.length) {
            TradeUtil.addLog(`Take Profits empty, skipped opening`, ctx, this.logger)
            return
        }
        TradeUtil.addLog(`Opening first Take Profit`, ctx, this.logger)
        await TakeProfitsQuantityCalculator.start(ctx, this.calculationsService)
        await this.openNextTakeProfit(ctx)
    }

    public async openNextTakeProfit(ctx: TradeCtx) {
        TPUtil.sort(ctx)
        const takeProfits = ctx.trade.variant.takeProfits
        for (let tp of takeProfits) {
            if (!tp.reuslt && tp.quantity) {
                await this.takeProfitRequest(ctx, tp)
                return
            }
        }
    }

    public async closePendingTakeProfit(ctx: TradeCtx) {
        const takeProfits = ctx.trade.variant.takeProfits
        for (let tp of takeProfits) {
            if (tp.reuslt?.status === TradeStatus.NEW) {
                const tpOrderId = tp.reuslt.orderId
                tp.reuslt = null // delete result prevents triggers onFilledTakeProfit
                await this.tradeRepo.update(ctx)
                tp.reuslt = await this.tradeService.closeOrder(ctx, tpOrderId)
                TradeUtil.addLog(`Closed take profit with order: ${tp.order}`, ctx, this.logger)
            }
        }
    }

    private async takeProfitRequest(ctx: TradeCtx, takeProfit: TakeProfit, forcedQuantity?: number): Promise<void> {
        const quantity = forcedQuantity ?? takeProfit.quantity
        TradeUtil.addLog(`Placing Take Profit order: ${takeProfit.order} with quantity: ${quantity}`, ctx, this.logger)
        if (this.takeProfitQuantitiesFilled(ctx) || !quantity) {
            return
        }
        const params = TPUtil.takeProfitRequestParams(ctx, takeProfit.price, quantity)
        const result = await this.tradeService.placeOrder(params, ctx)
        takeProfit.reuslt = result
        takeProfit.resultTime = new Date()
    }

    private takeProfitQuantitiesFilled(ctx: TradeCtx): boolean {
        if (ctx.filledQuantity.equals(new Decimal(ctx.takeProfitOrigQuentitesSum))) {
            return true
        } else if (new Decimal(TPUtil.takeProfitsFilledQuantitySum(ctx.trade)).greaterThan(ctx.marketFilledQuantity)) {
            throw new Error(`Take profit quantities sum > origQuantity`)
        }
        return false
    }



    public async takeSomeProfit(ctx: TradeCtx): Promise<boolean> {
        try {
            this.calculationsService.calculateSingleTakeProfitQuantityIfEmpty(ctx)
            TPUtil.sort(ctx)
            const takeProfits = ctx.trade.variant.takeProfits
            for (let i = takeProfits.length-1; i >= 0; i--) {
                const tp = takeProfits[i]
                const quantity = Number(tp.quantity)
                if ((!tp.reuslt || tp.reuslt.status === TradeStatus.NEW) && quantity) {
                    if (tp.reuslt?.status === TradeStatus.NEW) {
                        await this.closePendingTakeProfit(ctx)
                    }
                    delete tp.reuslt
                    tp.takeSomeProfitFlag = true
                    const result = await this.takeSomeProfitRequest(ctx, tp)
                    result.status = TradeStatus.FILLED
                    result.executedQty = result.origQty
                    tp.reuslt = result
                    this.onFilledTakeSomeProfit(ctx)
                    return !!result
                }
            }
            throw new Error(`Take profits are empty`)
        } catch (error) {
            this.tradeService.handleError(error, `TAKE SOME PROFIT ERROR`, ctx)
            return false
        }
    }

    private async takeSomeProfitRequest(ctx: TradeCtx, tp: TakeProfit): Promise<FuturesResult> {
        const params = {
            symbol: ctx.trade.variant.symbol,
            side: VariantUtil.opositeSide(ctx.trade.variant.side),
            type: TradeType.MARKET,
            quantity: Number(tp.quantity),
            timestamp: Date.now(),
            reduceOnly: true,
            recvWindow: TradeUtil.DEFAULT_REC_WINDOW
        }
        const result = await this.tradeService.placeOrder(params, ctx)
        TradeUtil.addLog(`Took profit with order ${tp.order}, price: ${result.price}, unit: ${ctx.unit.identifier}, symbol: ${result.symbol}`, ctx, this.logger)
        return result
    }

    private async onFilledTakeSomeProfit(ctx: TradeCtx) {
        if (TPUtil.positionFullyFilled(ctx)) {
            await this.tradeService.closeStopLoss(ctx)
            await this.closePendingTakeProfit(ctx)
            TradeUtil.addLog(`Every take profit filled, stop loss closed ${ctx.trade._id}`, ctx, this.logger)
            this.telegramService.onClosedPosition(ctx)
        } else {
            const stopLossPrice = Number(ctx.trade.stopLossResult?.stopPrice)
            await this.tradeService.moveStopLoss(ctx, isNaN(stopLossPrice) ? undefined : stopLossPrice)
            TradeUtil.addLog(`Moved stop loss`, ctx, this.logger)
            this.telegramService.onFilledTakeProfit(ctx)
        }
        const saved = await this.tradeRepo.update(ctx)
    }


}
import { Injectable, Logger } from "@nestjs/common";
import { CalculationsService } from "./calculations.service";
import { TradeCtx } from "./model/trade-variant";
import { LimitOrdersQuantityCalculator } from "src/global/calculators/limit-orders-quantity.calculator";

@Injectable()
export class MultiOrderService {

    private readonly logger = new Logger(this.constructor.name)

    constructor(
        private readonly calculationsService: CalculationsService
    ) {}

    public async openLimitOrders(ctx: TradeCtx) {

        await LimitOrdersQuantityCalculator.start(ctx, this.calculationsService)

        this.logger.warn(`TODO open limit orders!!`)
    }



    // private async tradeRequestLimit(ctx: TradeCtx): Promise<void> {
    //     const params = TradeUtil.tradeRequestLimitParams(ctx.trade)
    //     const result = await this.placeOrder(params, ctx)
    //     ctx.trade.timestamp = new Date()
    //     ctx.trade.futuresResult = result
    //     if (this.testNetwork) {
    //         ctx.trade.futuresResult.origQty = ctx.trade.quantity.toString()
    //         ctx.trade.futuresResult.status = 'NEW'
    //     }
    //     this.verifyOrigQuantity(ctx)
    // }

    // public static tradeRequestLimitParams = (trade: Trade): string => {
    //     return queryParams({
    //         symbol: trade.variant.symbol,
    //         side: trade.variant.side,
    //         type: TradeType.LIMIT,
    //         quantity: trade.quantity,
    //         price: trade.entryPrice,
    //         timestamp: Date.now(),
    //         timeInForce: 'GTC',
    //         recvWindow: TradeUtil.DEFAULT_REC_WINDOW
    //     })
    // }
}
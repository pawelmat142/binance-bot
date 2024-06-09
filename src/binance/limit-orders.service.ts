import { Injectable, Logger } from "@nestjs/common";
import { CalculationsService } from "./calculations.service";
import { TradeCtx } from "./model/trade-variant";
import { PlaceOrderParams } from "./model/model";
import { LimitOrdersQuantityCalculator } from "../global/calculators/limit-orders-quantity.calculator";
import { Http } from "../global/http/http.service";
import { Util } from "./utils/util";
import { BinanceResultOrError, isBinanceError } from "./model/binance.error";
import { LimitOrderUtil } from "./utils/limit-order-util";
import { FuturesResult, TradeStatus } from "./model/trade";
import { TradeUtil } from "./utils/trade-util";
import { TakeProfitsQuantityCalculator } from "../global/calculators/take-profits-quantity.calculator";
import { TPUtil } from "./utils/take-profit-util";
import { HttpMethod } from "../global/type";
import { timeStamp } from "console";
import { TradeRepository } from "./trade.repo";

@Injectable()
export class LimitOrdersService {

    private readonly logger = new Logger(this.constructor.name)

    constructor(
        private readonly calculationsService: CalculationsService,
        private readonly tradeRepo: TradeRepository,
        private readonly http: Http,
    ) {}


    public async openLimitOrders(ctx: TradeCtx) {
        await LimitOrdersQuantityCalculator.start(ctx, this.calculationsService)
        const results = await this.openMultipleOrders(ctx, LimitOrderUtil.prepareOrderParams(ctx))
        LimitOrderUtil.parseOrderResults(ctx, results)
    }

    
    public async onFilledLimitOrder(ctx: TradeCtx, eventTradeResult: FuturesResult) {
        try {
            TradeUtil.addLog(`Filled Limit Order with orderId ${ctx.trade.stopLossResult.orderId}, price: ${eventTradeResult.price}`, ctx, this.logger)
            ctx.trade.variant.limitOrders.forEach(lo => {
                if (lo.result?.orderId === eventTradeResult.orderId) {
                    lo.result = eventTradeResult
                }
            })

            await this.closeTakeProfitAndStopLossIfOpen(ctx)

            // TODO
            // set stop loss if every lo filled
            // recalculate takeprofit quantities
            // recalculate stop loss if every LO filled
            // open TP + SL
        } 
        catch (error) {
            const msg = Http.handleErrorMessage(error)
            TradeUtil.addError(msg, ctx, this.logger)
        }
        finally {
            this.tradeRepo.update(ctx)
        }
    }

    private async closeTakeProfitAndStopLossIfOpen(ctx: TradeCtx) {
        const orderIdList: BigInt[] = []
        const openedTakeProfit = ctx.trade.variant.takeProfits.find(tp => tp.reuslt?.status === TradeStatus.NEW)
        if (openedTakeProfit) {
            orderIdList.push(openedTakeProfit.reuslt.orderId)
        }
        if (ctx.trade.stopLossResult?.status === TradeStatus.NEW) {
            orderIdList.push(ctx.trade.stopLossResult.orderId)
        }

        if (orderIdList.length) {
            const results = await this.closeMultipleOrders(ctx, orderIdList)
            results.forEach(result => {
                if (isBinanceError(result)) {
                    TradeUtil.addError(result.msg, ctx, this.logger)
                } 
                else if (result.orderId === openedTakeProfit.reuslt?.orderId) {
                    openedTakeProfit.reuslt = result
                    TradeUtil.addLog(`Closed Take Profit ${openedTakeProfit.order+1}, orderId: ${result.orderId}`, ctx, this.logger)
                } 
                else if (result.orderId === ctx.trade.stopLossResult?.orderId) {
                    ctx.trade.stopLossResult = result
                    TradeUtil.addLog(`Closed Stop Loss, orderId: ${result.orderId}`, ctx, this.logger)
                } 
                else {
                    TradeUtil.addError(`Close order result ${result.orderId} doesnt match`, ctx, this.logger)
                }
            })
        } else {
            TradeUtil.addLog(`No Stop Loss or Take Profit to close`, ctx, this.logger)
        }
    }

    private async prepareTakeProfitParams(ctx: TradeCtx): Promise<PlaceOrderParams> {
        TPUtil.sort(ctx)
        await TakeProfitsQuantityCalculator.start(ctx, this.calculationsService)
        for (let tp of ctx.trade.variant.takeProfits) {
            if (!tp.reuslt || tp.reuslt.status === TradeStatus.NEW) {
                let params = TPUtil.takeProfitRequestParams(ctx, tp.price, tp.quantity)
                return TradeUtil.removeMultiOrderProperties(params)
            }
        }
    }

    private async prepareStopLossParams(ctx: TradeCtx) {
        const quantity = TradeUtil.calculateStopLossQuantity(ctx)
        const price = ctx.trade.variant.stopLoss
        // TODO stop loss calculator
    }




    // REQUESTS

    private closeMultipleOrders(ctx: TradeCtx, orderIdList: BigInt[]): Promise<BinanceResultOrError[]> {
        const params = {
            symbol: ctx.symbol,
            orderIdList: orderIdList,
            timeStamp: Date.now()
        }
        return this.placeMultipleOrders(ctx, params, 'DELETE')
    }

    private openMultipleOrders(ctx: TradeCtx, ordersParams: PlaceOrderParams[]): Promise<BinanceResultOrError[]> {
        const params = {
            batchOrders: JSON.stringify(ordersParams),
            timestamp: Date.now(),
        }
        return this.placeMultipleOrders(ctx, params, 'POST')
    }

    private placeMultipleOrders(ctx: TradeCtx, params: Object, method: HttpMethod): Promise<BinanceResultOrError[]> {
        return this.http.fetch<BinanceResultOrError[]>({
            url: Util.sign(`https://fapi.binance.com/fapi/v1/batchOrders`, params, ctx.unit),
            method: method,
            headers: Util.getHeaders(ctx.unit),
        })
    }
}
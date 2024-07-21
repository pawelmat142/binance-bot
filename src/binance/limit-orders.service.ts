import { Injectable, Logger } from "@nestjs/common";
import { CalculationsService } from "./calculations.service";
import { TradeCtx } from "./model/trade-variant";
import { PlaceOrderParams } from "./model/model";
import { LimitOrdersQuantityCalculator } from "../global/calculators/limit-orders-quantity.calculator";
import { Http } from "../global/http/http.service";
import { Util } from "./utils/util";
import { BinanceResultOrError, isBinanceError } from "./model/binance.error";
import { LimitOrderUtil } from "./utils/limit-order-util";
import { TradeStatus, TradeType } from "./model/trade";
import { TradeUtil } from "./utils/trade-util";
import { TakeProfitsQuantityCalculator } from "../global/calculators/take-profits-quantity.calculator";
import { TPUtil } from "./utils/take-profit-util";
import { HttpMethod } from "../global/type";
import { TradeRepository } from "./trade.repo";
import { StopLossCalculator } from "../global/calculators/stop-loss.calculator";
import { ClientOrderId, ClientOrderIdUtil } from "./utils/client-order-id-util";

@Injectable()
export class LimitOrdersService {

    /*
        Management of Limit Orders position path
        When signal is triggered and market price exceeds entry zone then Limit Orders should be placed instead of market order

        When Limit Order is placed:
            * Stop Loss is recalculated and placed if every Limit Orders are filled
            * Take Profits are recalculated and first is placed or next one if there is any filled one found
    */

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

    
    public async onFilledLimitOrder(ctx: TradeCtx) {
        try {
            await this.closeAllOpenOrders(ctx)
            await this.openStopLossAndTakeProfitIfNeeded(ctx)
        } 
        catch (error) {
            const msg = Http.handleErrorMessage(error)
            TradeUtil.addError(msg, ctx, this.logger)
        }
        finally {
            this.tradeRepo.update(ctx)
        }
    }

    public async closeAllOpenOrders(ctx: TradeCtx) {
        const clinetOrderIds = this.openOrderClientOrderIds(ctx)

        if (clinetOrderIds.length) {
            const results = await this.closeMultipleOrders(ctx, clinetOrderIds)
            this.updateMultipleOrderResults(ctx, results)
        } else {
            TradeUtil.addLog(`No Stop Loss or Take Profit to close`, ctx, this.logger)
        }
    }

    private openOrderClientOrderIds(ctx: TradeCtx) {
        const orderIdList: string[] = []
        for (let tp of ctx.trade.variant?.takeProfits || []) {
            if (tp.result?.status === TradeStatus.NEW) {
                orderIdList.push(tp.result.clientOrderId)
            }
        }

        for (let lo of ctx.trade.variant?.limitOrders || []) {
            if (lo.result?.status === TradeStatus.NEW) {
                orderIdList.push(lo.result.clientOrderId)
            }
        }

        if (ctx.trade.stopLossResult?.status === TradeStatus.NEW) {
            orderIdList.push(ctx.trade.stopLossResult.clientOrderId)
        }
        return orderIdList
    }

    

    private updateMultipleOrderResults(ctx: TradeCtx, results: BinanceResultOrError[]) {
        for (let result of results) {

            if (isBinanceError(result)) {
                TradeUtil.addError(result.msg, ctx, this.logger)
                continue
            } 
                
            const orderType = ClientOrderIdUtil.orderTypeByClientOrderId(result.clientOrderId)
            TradeUtil.addLog(`Set result of type ${result.type}, orderType: ${orderType} with clientOrderId ${result.clientOrderId}`, ctx, this.logger)
            ClientOrderIdUtil.updaResult(ctx, result)
        }
    }



    private async openStopLossAndTakeProfitIfNeeded(ctx: TradeCtx) {
        const orders: PlaceOrderParams[] = [
            await this.prepareStopLossParams(ctx),
            await this.prepareTakeProfitParams(ctx)
        ].filter(params => !!params)

        if (!orders.length) {
            TradeUtil.addError(`Not found any order to open`, ctx, this.logger)
            return
        }

        const results = await this.openMultipleOrders(ctx, orders)
        this.updateMultipleOrderResults(ctx, results)
    }

    private async prepareStopLossParams(ctx: TradeCtx): Promise<PlaceOrderParams> {
        const stopLossParams = await StopLossCalculator.start<PlaceOrderParams>(ctx, this.calculationsService)
        if (stopLossParams) {
            TradeUtil.removeMultiOrderProperties(stopLossParams)
        }
        return stopLossParams
    }

    private async prepareTakeProfitParams(ctx: TradeCtx): Promise<PlaceOrderParams> {
        TPUtil.sort(ctx)
        await TakeProfitsQuantityCalculator.start(ctx, this.calculationsService)
        const tp = TPUtil.firstTakeProfitToOpen(ctx.trade.variant)
        if (!tp) {
            TradeUtil.addError(`Not found Take Profit to open`, ctx, this.logger)
            return null
        }
        const params = TPUtil.takeProfitRequestParams(ctx, tp.price, tp.quantity, tp.order)
        TradeUtil.removeMultiOrderProperties(params)
        return params
    }



    // REQUESTS

    private closeMultipleOrders(ctx: TradeCtx, orderIdList: string[]): Promise<BinanceResultOrError[]> {
        const params = {
            symbol: ctx.symbol,
            origClientOrderIdList: orderIdList,
            timeStamp: Date.now()
        }
        return this.placeMultipleOrders(ctx, params, 'DELETE')
    }

    private async openMultipleOrders(ctx: TradeCtx, ordersParams: PlaceOrderParams[]): Promise<BinanceResultOrError[]> {
        const params = {
            batchOrders: JSON.stringify(ordersParams),
            timestamp: Date.now(),
        }
        return this.placeMultipleOrders(ctx, params, 'POST')
    }

    private async placeMultipleOrders(ctx: TradeCtx, params: Object, method: HttpMethod): Promise<BinanceResultOrError[]> {
        return this.http.fetch<BinanceResultOrError[]>({
            url: Util.sign(`https://fapi.binance.com/fapi/v1/batchOrders`, params, ctx.unit),
            method: method,
            headers: Util.getHeaders(ctx.unit),
        })
    }
}
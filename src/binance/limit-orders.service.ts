import { Injectable, Logger } from "@nestjs/common";
import { CalculationsService } from "./calculations.service";
import { TradeCtx } from "./model/trade-variant";
import { PlaceOrderParams } from "./model/model";
import { LimitOrdersQuantityCalculator } from "../global/calculators/limit-orders-quantity.calculator";
import { Http } from "../global/http/http.service";
import { Util } from "./utils/util";
import { BinanceResultOrError, isBinanceError } from "./model/binance.error";
import { LimitOrderUtil } from "./utils/limit-order-util";
import { FuturesResult, TradeStatus, TradeType } from "./model/trade";
import { TradeUtil } from "./utils/trade-util";
import { TakeProfitsQuantityCalculator } from "../global/calculators/take-profits-quantity.calculator";
import { TPUtil } from "./utils/take-profit-util";
import { HttpMethod } from "../global/type";
import { TradeRepository } from "./trade.repo";
import { StopLossCalculator } from "../global/calculators/stop-loss.calculator";

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
            await this.closeTakeProfitAndStopLossIfOpen(ctx)
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

    private async closeTakeProfitAndStopLossIfOpen(ctx: TradeCtx) {
        const orderIdList: string[] = []
        const openedTakeProfit = ctx.trade.variant.takeProfits.find(tp => tp.result?.status === TradeStatus.NEW)
        if (openedTakeProfit) {
            orderIdList.push(openedTakeProfit.result.clientOrderId)
        }
        if (ctx.trade.stopLossResult?.status === TradeStatus.NEW) {
            orderIdList.push(ctx.trade.stopLossResult.clientOrderId)
        }

        if (orderIdList.length) {
            const results = await this.closeMultipleOrders(ctx, orderIdList)
            results.forEach(result => {
                if (isBinanceError(result)) {
                    TradeUtil.addError(result.msg, ctx, this.logger)
                } 
                else if (result.clientOrderId === openedTakeProfit.result?.clientOrderId) {
                    openedTakeProfit.result = result
                    TradeUtil.addLog(`Closed Take Profit ${openedTakeProfit.order+1}, clientOrderId: ${result.clientOrderId}`, ctx, this.logger)
                } 
                else if (result.clientOrderId === ctx.trade.stopLossResult?.clientOrderId) {
                    ctx.trade.stopLossResult = result
                    TradeUtil.addLog(`Closed Stop Loss, clientOrderId: ${result.clientOrderId}`, ctx, this.logger)
                } 
                else {
                    TradeUtil.addError(`Close order result ${result.clientOrderId} doesnt match`, ctx, this.logger)
                }
            })
        } else {
            TradeUtil.addLog(`No Stop Loss or Take Profit to close`, ctx, this.logger)
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

        results.forEach(result => {
            if (isBinanceError(result)) {
                TradeUtil.addError(result.msg, ctx, this.logger)
            } 
            else if (result.type === TradeType.TAKE_PROFIT_MARKET) {
                const tp = TPUtil.firstTakeProfitToOpen(ctx.trade.variant)
                if (!tp) {
                    TradeUtil.addError(`Not found Take Profit to place result`, ctx, this.logger)
                    return null
                }
                tp.result = result
                TradeUtil.addLog(`Opened Take Profit ${tp.order+1}, stop price ${result.stopPrice}, clientOrderId ${result.clientOrderId}`, ctx, this.logger)
            } 
            else if (result.type === TradeType.STOP_MARKET) {
                ctx.trade.stopLossResult = result
                TradeUtil.addLog(`Opened Stop Loss, stop price ${result.stopPrice}, clientOrderId: ${result.clientOrderId}`, ctx, this.logger)
            } 
            else {
                TradeUtil.addError(`Opened order result ${result.clientOrderId} doesnt match`, ctx, this.logger)
            }
        })
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
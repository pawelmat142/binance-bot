import { Injectable, Logger } from "@nestjs/common";
import { CalculationsService } from "./calculations.service";
import { TradeCtx } from "./model/trade-variant";
import { LimitOrdersQuantityCalculator } from "src/global/calculators/limit-orders-quantity.calculator";
import { PlaceOrderParams, TradeType } from "./model/model";
import { getHeaders, getSignature } from "src/global/util";
import { TradeUtil } from "./trade-util";
import { Http } from "src/global/http/http.service";
import { FuturesResult } from "./model/trade";

@Injectable()
export class MultiOrderService {

    private readonly logger = new Logger(this.constructor.name)

    constructor(
        private readonly calculationsService: CalculationsService,
        private readonly http: Http,
    ) {}

    public async openLimitOrders(ctx: TradeCtx) {

        await LimitOrdersQuantityCalculator.start(ctx, this.calculationsService)

        const params: PlaceOrderParams[] = ctx.trade.variant.limitOrders.map(lo => {
            return {
                type: TradeType.LIMIT,
                timeInForce: "GTC",
                price: lo.price.toString(),
                quantity: lo.quantity.toString(),
                side: ctx.trade.variant.side,
                symbol: ctx.trade.variant.symbol,
            }
        })

        const json = JSON.stringify(params)
        console.log('json')
        console.log(json)
        
        const queryString = `batchOrders=${json}$timestamp=${Date.now()}`
        console.log('queryString')
        console.log(queryString)

        const url = `${TradeUtil.futuresUri}/batchOrders?${queryString}`
        console.log('url')
        console.log(url)
        
        const signature = getSignature(queryString, ctx.unit)
        console.log('signature')
        console.log(signature)
        
        const full = `${url}$signature=${signature}`
        console.log('full')
        console.log(full)
        
        const results = await this.http.fetch<FuturesResult[]>({
            url: full,
            method: 'GET',
            headers: getHeaders(ctx.unit)
        })

        console.log(results)
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
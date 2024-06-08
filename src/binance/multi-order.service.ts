import { Injectable, Logger } from "@nestjs/common";
import { CalculationsService } from "./calculations.service";
import { TradeCtx } from "./model/trade-variant";
import { PlaceOrderParams } from "./model/model";
import { FuturesResult, TradeType } from "./model/trade";
import { LimitOrdersQuantityCalculator } from "../global/calculators/limit-orders-quantity.calculator";
import { Http } from "../global/http/http.service";
import * as crypto from 'crypto'
import { Util } from "./utils/util";

@Injectable()
export class MultiOrderService {

    private readonly logger = new Logger(this.constructor.name)

    constructor(
        private readonly calculationsService: CalculationsService,
        private readonly http: Http,
    ) {}

    public async openLimitOrders(ctx: TradeCtx) {

        await LimitOrdersQuantityCalculator.start(ctx, this.calculationsService)

        const orders: PlaceOrderParams[] = ctx.trade.variant.limitOrders.map(lo => {
            return {
                symbol: ctx.trade.variant.symbol,
                side: ctx.trade.variant.side,
                type: TradeType.LIMIT,
                quantity: lo.quantity.toString(),
                price: lo.price.toString(),
                timeInForce: "GTC",
            }
        })
                
        const body = {
            batchOrders: JSON.stringify(orders),
            timestamp: Date.now(),
        }


        const queryString = Object.entries(body).map(([key, val]) => `${key}=${encodeURIComponent(val)}`).join('&');
        
        body['signature'] = crypto.createHmac('sha256', ctx.unit.binanceApiSecret).update(queryString).digest('hex')
        
        const signedQueryString = Object.entries(body).map(([key, val]) => `${key}=${val}`).join('&')

        const uri = `https://fapi.binance.com/fapi/v1/batchOrders?${signedQueryString}`
        console.log('uri')
        console.log(uri)

        try {
            const results = await this.http.fetch<FuturesResult[]>({
                url: Util.sign(`https://fapi.binance.com/fapi/v1/batchOrders`, Util.payload(body), ctx.unit),
                method: 'POST',
                headers: Util.getHeaders(ctx.unit),
            })
            console.log(results)
        } catch (error) {
            const msg = Http.handleErrorMessage(error)
            console.log(msg)
        }

        this.logger.warn(`TODO open limit orders!!`)
    }


}
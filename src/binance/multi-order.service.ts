import { Injectable, Logger } from "@nestjs/common";
import { CalculationsService } from "./calculations.service";
import { TradeCtx } from "./model/trade-variant";
import { PlaceOrderParams } from "./model/model";
import { LimitOrdersQuantityCalculator } from "../global/calculators/limit-orders-quantity.calculator";
import { Http } from "../global/http/http.service";
import { Util } from "./utils/util";
import { BinanceResultOrError } from "./model/binance.error";
import { LimitOrderUtil } from "./utils/limit-order-util";

@Injectable()
export class MultiOrderService {

    constructor(
        private readonly calculationsService: CalculationsService,
        private readonly http: Http,
    ) {}

    public async openLimitOrders(ctx: TradeCtx) {
        await LimitOrdersQuantityCalculator.start(ctx, this.calculationsService)
        const results = await this.placeMultipleOrders(ctx, LimitOrderUtil.prepareOrderParams(ctx))
        LimitOrderUtil.parseOrderResults(ctx, results)
    }

    private placeMultipleOrders(ctx: TradeCtx, ordersParams: PlaceOrderParams[]): Promise<BinanceResultOrError[]> {
        const params = {
            batchOrders: JSON.stringify(ordersParams),
            timestamp: Date.now(),
        }
        return this.http.fetch<BinanceResultOrError[]>({
            url: Util.sign(`https://fapi.binance.com/fapi/v1/batchOrders`, params, ctx.unit),
            method: 'POST',
            headers: Util.getHeaders(ctx.unit),
        })
    }


}
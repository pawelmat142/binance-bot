import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { FuturesResult, Trade } from "./model/trade";
import { Model } from "mongoose";
import { TradeService } from "./trade.service";
import { Unit } from "src/unit/unit";
import { getHeaders, queryParams, sign } from "src/global/util";
import { TradeUtil } from "./trade-util";
import { BinanceError } from "./model/binance.error";
import { TradeCtx } from "./model/trade-variant";
import { BinanceService } from "./binance.service";

@Injectable()
export class WizardBinanceService {

    private readonly logger = new Logger(WizardBinanceService.name)

    constructor(
        @InjectModel(Trade.name) private tradeModel: Model<Trade>,
        private readonly tradeService: TradeService,
        private readonly binanceService: BinanceService,
    ) {}


    public async fetchTrades(unit: Unit): Promise<FuturesResult[] | BinanceError> {
        const params = queryParams({
            timestamp: Date.now()
        })
        const url = sign(`${TradeUtil.futuresUri}/allOrders`, params, unit)
        const request = await fetch(url, {
            method: 'GET',
            headers: getHeaders(unit)
        })
        return request.json()
    }


    public async fetchOpenOrders(unit: Unit): Promise<FuturesResult[] | BinanceError> {
        const params = queryParams({
            timestamp: Date.now()
        })
        const url = sign(`${TradeUtil.futuresUri}/openOrders`, params, unit)
        const request = await fetch(url, {
            method: 'GET',
            headers: getHeaders(unit)
        })
        return request.json()
    }


    public async moveStopLoss(order: FuturesResult, stopLossPrice: number, unit: Unit): Promise<string> {
        try {
            const trade = await this.tradeModel.findOne({
                unitIdentifier: unit.identifier,
                "stopLossResult.orderId": order.orderId
            }).exec()
            if (!trade) {
                return `Trade not found`
            }
            const ctx = new TradeCtx({ unit, trade })
            await this.tradeService.moveStopLoss(ctx, stopLossPrice)
            const update = await this.binanceService.update(ctx)
            return 'success'
        } catch(error) {
            return 'error'
        }
    } 

}
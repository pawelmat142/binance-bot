import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { FuturesResult, Trade, TradeStatus } from "./model/trade";
import { Model } from "mongoose";
import { TradeService } from "./trade.service";
import { Unit } from "src/unit/unit";
import { getHeaders, queryParams, sign } from "src/global/util";
import { TradeUtil } from "./trade-util";
import { BinanceError } from "./model/binance.error";
import { TradeCtx } from "./model/trade-variant";
import { BinanceService } from "./binance.service";

export interface BinanceFuturesAccountInfo {
    accountAlias: string;
    asset: string;
    balance: string;
    crossWalletBalance: string;
    crossUnPnl: string;
    availableBalance: string;
    maxWithdrawAmount: string;
    marginAvailable: boolean;
    updateTime: number;
}

export interface Position {
    symbol: string;
    positionAmt: string; //quantity
    entryPrice: string;
    breakEvenPrice: string;
    markPrice: string;
    unRealizedProfit: string; //PNL USDT
    liquidationPrice: string;
    leverage: string;
    maxNotionalValue: string;
    marginType: string;
    isolatedMargin: string;
    isAutoAddMargin: string;
    positionSide: string;
    notional: string;
    isolatedWallet: string;  //wallet (Margin)
    updateTime: number;
    isolated: boolean;
    adlQuantile: number;
}

@Injectable()
export class WizardBinanceService {

    private readonly logger = new Logger(WizardBinanceService.name)

    constructor(
        @InjectModel(Trade.name) private tradeModel: Model<Trade>,
        private readonly tradeService: TradeService,
        private readonly binanceService: BinanceService,
    ) {}


    public async fetchAllOrders(unit: Unit): Promise<FuturesResult[] | BinanceError> {
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

    public async fetchPositions(unit: Unit): Promise<Position[] | BinanceError> {
        const params = queryParams({
            timestamp: Date.now()
        })
        const url = sign(`${TradeUtil.futuresUriV2}/positionRisk`, params, unit)
        const request = await fetch(url, {
            method: 'GET',
            headers: getHeaders(unit)
        })
        
        return request.json()
    }


    public async getBalance(unit: Unit): Promise<BinanceFuturesAccountInfo> {
        const params = queryParams({
            timestamp: Date.now()
        })
        const url = sign(`${TradeUtil.futuresUriV2}/balance`, params, unit)
        const request = await fetch(url, {
            method: 'GET',
            headers: getHeaders(unit)
        })
        const accountInfos: BinanceFuturesAccountInfo[] = await request.json()
        return (accountInfos || []).find(info => info.asset === 'USDT')
    }

    public async fetchTrades(unit: Unit) {
        const trades = await this.tradeModel.find({
            unitIdentifier: unit.identifier,
            closed: { $ne: true }
        }).exec()
        return trades
    }

    public async closeOrder(ctx: TradeCtx) {
        await this.tradeService.closeOrder(ctx, ctx.trade.futuresResult.orderId)
        await this.closeTrade(ctx)
    }

    public closeTrade(ctx: TradeCtx) {
        ctx.trade.closed = true
        if (ctx.trade.futuresResult) {
            ctx.trade.futuresResult.status = TradeStatus.CLOSED_MANUALLY
        }
        if (ctx.trade.stopLossResult) {
            ctx.trade.stopLossResult.status = TradeStatus.CLOSED_MANUALLY
        }
        for (let tp of ctx.trade.variant.takeProfits || []) {
            if (tp.reuslt) {
                tp.reuslt.status = TradeStatus.CLOSED_MANUALLY
            }
        }
        return this.binanceService.update(ctx)
    }

}
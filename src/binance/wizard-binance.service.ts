import { Injectable, Logger } from "@nestjs/common";
import { FuturesResult } from "./model/trade";
import { TradeService } from "./trade.service";
import { Unit } from "src/unit/unit";
import { getHeaders, queryParams, sign } from "src/global/util";
import { TradeUtil } from "./trade-util";
import { BinanceError } from "./model/binance.error";
import { TradeCtx } from "./model/trade-variant";
import { TradeRepository } from "./trade.repo";

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
        private readonly tradeService: TradeService,
        private readonly tradeRepo: TradeRepository,
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
        const trades = await this.tradeRepo.findByUnit(unit)
        return trades
    }

    public async closeOrder(ctx: TradeCtx) {
        await this.tradeService.closeOrder(ctx, ctx.trade.futuresResult.orderId)
        await this.tradeRepo.closeTrade(ctx)
    }

    public async moveStopLoss(order: FuturesResult, stopLossPrice: number, unit: Unit): Promise<boolean> {
        const trade = await this.tradeRepo.findBySlOrderId(order.orderId, unit)
        const ctx = new TradeCtx({ unit, trade: trade })
        if (!trade) {
            return false
        }
        try {
            await this.tradeService.moveStopLoss(ctx, stopLossPrice)
            TradeUtil.addLog(`Moved stop loss for unit: ${unit.identifier}, ${trade.variant.symbol} to level: ${stopLossPrice} USDT`, ctx, this.logger)
            await this.tradeRepo.update(ctx)
        } catch (error) {
            TradeUtil.addError(error, ctx, this.logger)
            return false
        }
    }

}
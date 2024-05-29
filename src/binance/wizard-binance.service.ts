import { Injectable, Logger } from "@nestjs/common";
import { FuturesResult } from "./model/trade";
import { TradeService } from "./trade.service";
import { Unit } from "src/unit/unit";
import { getHeaders, queryParams, sign } from "src/global/util";
import { TradeUtil } from "./trade-util";
import { BinanceError } from "./model/binance.error";
import { TradeCtx } from "./model/trade-variant";
import { TradeRepository } from "./trade.repo";
import { Http } from "src/global/http/http.service";

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
        private readonly http: Http,
    ) {}


    public async fetchAllOrders(unit: Unit): Promise<FuturesResult[]> {
        const params = queryParams({
            timestamp: Date.now()
        })
        return this.http.fetch<FuturesResult[]>({
            url: sign(`${TradeUtil.futuresUri}/allOrders`, params, unit),
            method: 'GET',
            headers: getHeaders(unit)
        })
    }

    public async getBalance(unit: Unit): Promise<BinanceFuturesAccountInfo> {
        const params = queryParams({
            timestamp: Date.now()
        })
        const accountInfos = await this.http.fetch<BinanceFuturesAccountInfo[]>({
            url: sign(`${TradeUtil.futuresUriV2}/balance`, params, unit),
            method: 'GET',
            headers: getHeaders(unit)
        })
        return (accountInfos || []).find(info => info.asset === 'USDT')
    }

    public async fetchTrades(unit: Unit) {
        return this.tradeRepo.findByUnit(unit)
    }

    public async closeOrder(ctx: TradeCtx, orderId: BigInt) {
        await this.tradeService.closeOrder(ctx, orderId)
        await this.tradeRepo.closeTrade(ctx)
    }

    public async moveStopLoss(ctx: TradeCtx, stopLossPrice: number): Promise<boolean> {
        try {
            await this.tradeService.moveStopLoss(ctx, stopLossPrice)
            TradeUtil.addLog(`Moved stop loss for unit: ${ctx.unit.identifier}, ${ctx.trade.variant.symbol} to level: ${stopLossPrice} USDT`, ctx, this.logger)
            await this.tradeRepo.update(ctx)
            return true
        } catch(error) {
            const errorMsg = this.http.handleErrorMessage(error)
            TradeUtil.addError(errorMsg, ctx, this.logger)
            return false
        }
    }

}
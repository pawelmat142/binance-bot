import { Injectable, Logger } from "@nestjs/common";
import { FuturesResult, Trade, TradeStatus, TradeType } from "./model/trade";
import { TradeService } from "./trade.service";
import { VariantSide } from "./utils/variant-util";
import { Http } from "../global/http/http.service";
import { queryParams, sign, getHeaders } from "../global/util";
import { Unit } from "../unit/unit";
import { TradeCtx, TradeVariant } from "./model/trade-variant";
import { TradeRepository } from "./trade.repo";
import { TradeUtil } from "./utils/trade-util";

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

    public async closeOpenOrder(ctx: TradeCtx, orderId: BigInt) {
        await this.tradeService.closeOrder(ctx, orderId)
        await this.tradeRepo.closeTradeManual(ctx)
        this.tradeService.closeOrderEvent(ctx)
    }

    public async moveStopLoss(ctx: TradeCtx, stopLossPrice: number): Promise<boolean> {
        try {
            await this.tradeService.moveStopLoss(ctx, stopLossPrice)
            TradeUtil.addLog(`Moved stop loss for unit: ${ctx.unit.identifier}, ${ctx.trade.variant.symbol} to level: ${stopLossPrice} USDT`, ctx, this.logger)
            await this.tradeRepo.update(ctx)
            return true
        } catch(error) {
            const errorMsg = Http.handleErrorMessage(error)
            TradeUtil.addError(errorMsg, ctx, this.logger)
            return false
        }
    }

    public async closePositionWithoutTrade(position: Position, unit: Unit): Promise<string> {
        try {
            const amount = Number(position.positionAmt)
            if (isNaN(amount)) {
                throw new Error(`Position amount is not a number`)
            }
            const side: VariantSide = amount > 0 ? 'SELL' : 'BUY';
            const quantity = Math.abs(amount)
            const params = queryParams({
                symbol: position.symbol,
                side: side,
                type: TradeType.MARKET,
                quantity: quantity,
                reduceOnly: true,
                timestamp: Date.now()
            })
            const result = await this.tradeService.placeOrderByUnit(params, unit, 'POST')
            result.status = TradeStatus.CLOSED_MANUALLY
            const trade = {
                futuresResult: result,
                unitIdentifier: unit.identifier,
                closed: true,
                variant: { 
                    symbol: position.symbol,
                    side: side
                } as TradeVariant,
            } as Trade

            const ctx = new TradeCtx({ trade, unit})
            TradeUtil.addLog(`Closed position without trade`, ctx, this.logger)
            await this.tradeRepo.save(ctx)
            return ''
        } catch (error) {
            const msg = Http.handleErrorMessage(error)
            this.logger.error(msg)
            return msg
        }
    }

    public async closeOrderWithoutTrade(order: FuturesResult, unit: Unit): Promise<string> {
        try {
            const params = queryParams({
                symbol: order.symbol,
                orderId: order.orderId,
                timestamp: Date.now(),
                timeInForce: 'GTC',
                recvWindow: TradeUtil.DEFAULT_REC_WINDOW,
            })
            const result = await this.tradeService.placeOrderByUnit(params, unit, 'DELETE')
            result.status = TradeStatus.CLOSED_MANUALLY
            const trade = {
                futuresResult: result,
                unitIdentifier: unit.identifier,
                closed: true,
                variant: { 
                    symbol: order.symbol,
                    side: order.side
                } as TradeVariant,
            } as Trade
            const ctx = new TradeCtx({ trade, unit})
            TradeUtil.addLog(`Closed order without trade`, ctx, this.logger)
            await this.tradeRepo.save(ctx)
            return ''
        } catch (error) {
            const msg = Http.handleErrorMessage(error)
            this.logger.error(msg)
            return msg
        }
    }


}
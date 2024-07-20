import { TradeRepository } from "./trade.repo";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { WebSocket, Event, MessageEvent, CloseEvent, ErrorEvent } from 'ws';
import { Trade } from "./model/trade";
import { TradeService } from "./trade.service";
import { TradeCtx } from "./model/trade-variant";
import { TradeUtil } from "./utils/trade-util";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Subscription } from "rxjs";
import { VariantSide, VariantUtil } from "./utils/variant-util";
import { TPUtil } from "./utils/take-profit-util";
import { Http } from "../global/http/http.service";
import { TelegramService } from "../telegram/telegram.service";
import { UnitService } from "../unit/unit.service";
import { UnitUtil } from "../unit/unit.util";

export interface PriceTickerParams {
    symbol: string
    side: VariantSide
    closeOrderLimit: number
}

export interface PriceTicker {
    params: PriceTickerParams
    socket: WebSocket
    marketPrice?: number
}


interface MarketPriceUpdateMessage {
    e: string;  // Event type
    E: number;  // Event time
    s: string;  // Symbol
    p: string;  // Mark price
    P: string;  // Index price
    i: string;  // Estimated setttlement price
    r: string;  // Funding rate
    T: number;  // Next funding time
}

export interface MarketPriceUpdate {
    eventType: string;          // Event type
    eventTime: number;          // Event time
    symbol: string;             // Symbol
    markPrice: string;          // Mark price
    indexPrice: string;         // Index price
    estimatedSettlePrice: string; // Estimated settlement price
    fundingRate: string;        // Funding rate
    nextFundingTime: number;    // Next funding time
}

@Injectable()
export class AutoCloseService implements OnModuleDestroy, OnModuleInit {

    /*
        Open Limit Orders should be closed automatically when market price reaches second Take Profit price level
    */


    private readonly logger = new Logger(this.constructor.name)

    private readonly markPriceUpdate = 'markPriceUpdate'

    constructor(
        private readonly tradeRepo: TradeRepository,
        private readonly tradeService: TradeService,
        private readonly unitService: UnitService,
        private readonly telegramService: TelegramService,
    ) {}
    
    private priceTickers: PriceTicker[] = []

    private closeOrderEventSubscription: Subscription
    
    onModuleInit() {
        this.openPriceTikersForOpenOrders()
        if (!this.closeOrderEventSubscription) {
            this.closeOrderEventSubscription = this.tradeService.closeOrderEvent$.subscribe(symbol => {
                this.closePriceTickerIfNoOrders(symbol)
            })
        }
    }


    onModuleDestroy() {
        this.priceTickers.forEach(priceTicker => {
            this.closePriceTicker(priceTicker.params.symbol)
        })
        if (this.closeOrderEventSubscription) {
            this.closeOrderEventSubscription.unsubscribe()
            this.closeOrderEventSubscription = null
        }
    }

    @Cron(CronExpression.EVERY_6_HOURS)
    logOpenPriceTickers() {
        const symbols = this.priceTickers.map(pt => pt.params.symbol).join(', ')
        this.logger.warn(`Opened Price Tickers : [${symbols}]`)
    }


    public openPriceTicker(params: PriceTickerParams) {
        if (this.exists(params.symbol)) {
            this.logger.warn(`${this.tickerLabel(params.symbol)} already opened`)
            return
        }
        this.openSocketFor(params)
    } 

    public closePriceTicker(symbol: string) {
        const priceTicker = this.find(symbol)
        if (!priceTicker) {
            this.logger.warn(`Not found ${this.tickerLabel(symbol)}`)
        }
        priceTicker.socket.close()
    }


    private async closePriceTickerIfNoOrders(symbol: string) {
        this.logger.log(`${this.tickerLabel(symbol)} closePriceTickerIfNoOrders [START]`)
        if (this.exists(symbol)) {
            this.logger.log(`${this.tickerLabel(symbol)} closePriceTickerIfNoOrders ticker exists`)
            const orders = await this.tradeRepo.findOpenOrdersBySymbol(symbol)
            this.logger.log(`${this.tickerLabel(symbol)} closePriceTickerIfNoOrders found ${orders.length} open orders`)

            // TODO missing closing orders!

            if (orders.length) {
                this.closePriceTicker(symbol)
                this.logger.log(`${this.tickerLabel(symbol)} closePriceTickerIfNoOrders closing...`)
            }
        }
        this.logger.log(`${this.tickerLabel(symbol)} closePriceTickerIfNoOrders [STOP]`)
    }


    private async openPriceTikersForOpenOrders() {
        const openOrders: Trade[] = await this.tradeRepo.findOpenOrdersForPriceTicker()

        for (let order of openOrders) {
            const symbol = order.variant.symbol
            if (!TPUtil.takeProfits(order).length) {
                this.logger.error(`Mising take profits for order ${VariantUtil.label(order.variant)}, ${order._id}`)
                continue
            }
            if (this.exists(symbol)) {
                continue
            }
            const closeOrderLimit = this.findOrderCloseLimit(order)
            this.openPriceTicker({
                symbol: symbol,
                side: order.variant.side,
                closeOrderLimit: closeOrderLimit
            })
        }
    }

    private findOrderCloseLimit(order: Trade): number {
        const takeProfits = TPUtil.takeProfits(order)
        const takeProfitOrder = takeProfits.length > 1 ? 1 : TPUtil.takeProfits(order).length - 1
        const takeProfit = takeProfits.find(tp => tp.order === takeProfitOrder)
        return takeProfit.price
    }



    private openSocketFor(params: PriceTickerParams) {
        const ws = new WebSocket(`${UnitUtil.socketUri}/${params.symbol.toLowerCase()}@markPrice`)
        // const ws = new WebSocket(`${UnitUtil.socketUri}/${symbol.toLowerCase()}@ticker`)

        ws.onopen = (event: Event) => {
            this.priceTickers.push({
                params: params,
                socket: ws,
            })
            this.logger.log(`Opened ${this.tickerLabel(params.symbol)} with closeOrderLimit: ${params.closeOrderLimit}`)
        }
        
        ws.onclose = (event: CloseEvent) => {
            this.remove(params.symbol)
            this.logger.warn(`Closed ${this.tickerLabel(params.symbol)}`)
        }
        
        ws.onerror = (event: ErrorEvent) => {
            this.remove(params.symbol)
            this.logger.error(`Error ${this.tickerLabel(params.symbol)}`)
        }

        ws.onmessage = (event: MessageEvent) => {
            const marketPriceUpdate = this.parseMessage(event)
            this.updateSymbolPrice(marketPriceUpdate)
        }
    }

    private updateSymbolPrice(marketPriceUpdate: MarketPriceUpdate) {
        const priceTicker = this.find(marketPriceUpdate.symbol)
        if (!priceTicker) {
            this.logger.error(`Not found ${this.tickerLabel(marketPriceUpdate.symbol)}`)
            return
        }
        const marketPrice = Number(marketPriceUpdate.markPrice)
        if (isNaN(marketPrice)) {
            this.logger.error(`Market price ${marketPrice} is not a number - ${this.tickerLabel(marketPriceUpdate.symbol)}`)
            return
        }
        priceTicker.marketPrice = marketPrice
        this.closeOrdersIfLimitExceeded(priceTicker)
    }

    private closeOrdersIfLimitExceeded(priceTicker: PriceTicker) {
        const side = priceTicker.params.side
        if (side === 'BUY') {
            if (priceTicker.marketPrice > priceTicker.params.closeOrderLimit) {
                this.closeOrders(priceTicker)
            }
        } else {
            if (priceTicker.marketPrice < priceTicker.params.closeOrderLimit) {
                this.closeOrders(priceTicker)
            }
        }
    }

    private async closeOrders(priceTicker: PriceTicker) {
        const symbol = priceTicker.params.symbol
        this.logger.warn(`${this.tickerLabel(symbol)} - limit exceeded - closing orders`)

        const openOrders: Trade[] = await this.tradeRepo.findOpenOrdersBySymbol(symbol)
        
        for (let order of openOrders) {
            const unit = this.unitService.units.find(u => u.identifier === order.unitIdentifier)
            if (!unit) {
                this.logger.warn(`${this.tickerLabel(symbol)} - Not found unit ${order.unitIdentifier} to close order ${order.marketResult.orderId}`)
                continue
            }

            const ctx = new TradeCtx({
                unit: unit,
                trade: order
            })
            await this.closeUnitOrder(ctx)
        }
    }

    private async closeUnitOrder(ctx: TradeCtx) {
        try {
            TradeUtil.addLog(`Closing order by Price Ticker`, ctx, this.logger)

            for (let lo of ctx.trade.variant.limitOrders) {
                if (lo.result) {
                    const result = await this.tradeService.closeOrder(ctx, lo.result.clientOrderId)
                    ctx.trade.closed = true
                    lo.result = result
                    this.telegramService.sendUnitMessage(ctx, [VariantUtil.label(ctx.trade.variant), `Closed order bcs price limit exceeded`])
                }
            }
            
        } 
        catch (error) {
            const msg = Http.handleErrorMessage(error)
            TradeUtil.addError(msg, ctx, this.logger)
            this.telegramService.sendUnitMessage(ctx, [VariantUtil.label(ctx.trade.variant), `Error trying close order bcs price limit exceeded`])
        }
        finally {
            this.tradeRepo.update(ctx)
        }
    }


    private exists(symbol: string): boolean {
        return this.priceTickers.some(pt => pt.params.symbol === symbol)
    }

    private find(symbol: string): PriceTicker {
        return this.priceTickers.find(pt => pt.params.symbol === symbol)
    }

    private remove(symbol: string) {
        this.priceTickers = this.priceTickers.filter(pt => pt.params.symbol !== symbol)
    }

    private tickerLabel = (symbol: string): string => `Price Ticker [${symbol}]`


    private parseMessage(event: MessageEvent): MarketPriceUpdate {
        if (event.data) {
            const message = JSON.parse(event.data as string) as MarketPriceUpdateMessage
            if (message.e === this.markPriceUpdate) {
                return {
                    eventType: message.e,
                    eventTime: message.E,
                    symbol: message.s,
                    markPrice: message.p,
                    indexPrice: message.P,
                    estimatedSettlePrice: message.i,
                    fundingRate: message.r,
                    nextFundingTime: message.T
                }
            } else {
                this.logger.error(`[${this.constructor.name}] MarkPriceUpdateMessage is not markPriceUpdate`)
            }
        } else {
            this.logger.error(`[${this.constructor.name}] MessageEvent data missing`)
        }
        return null
    }

}
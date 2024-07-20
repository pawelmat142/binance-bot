import { Injectable, Logger } from "@nestjs/common";
import { Unit } from "../unit/unit";
import { BinanceService } from "./binance.service";
import { UnitService } from "../unit/unit.service";
import { UnitUtil } from "../unit/unit.util";
import { ListeKeyResponse, TradeEventData } from "./model/model";
import * as JSONbig from 'json-bigint';
import { TradeUtil } from "./utils/trade-util";
import { WebSocket, Event, MessageEvent, CloseEvent, ErrorEvent } from 'ws';
import { DuplicateService } from "./duplicate.service";
import { FuturesResult, Trade, TradeStatus } from "./model/trade";
import { TradeCtx } from "./model/trade-variant";
import { TradeRepository } from "./trade.repo";
import { TradeService } from "./trade.service";
import { Http } from "../global/http/http.service";
import { TelegramService } from "../telegram/telegram.service";
import { LimitOrdersService } from "./limit-orders.service";
import { TakeProfitsService } from "./take-profits.service";
import { HttpMethod } from "../global/type";
import { Util } from "./utils/util";
import { ClientOrderId, ClientOrderIdUtil } from "./utils/client-order-id-util";
import { TPUtil } from "./utils/take-profit-util";
import { LimitOrderUtil } from "./utils/limit-order-util";


@Injectable()
export class BinanceUnitListener {

    private readonly logger = new Logger(this.constructor.name)

    private readonly WEBSOCKET_ONLY_FOR = process.env.WEBSOCKET_ONLY_FOR

    constructor(
        private readonly unit: Unit,
        private readonly unitService: UnitService,
        private readonly binanceService: BinanceService,
        private readonly tradeService: TradeService,
        private readonly duplicateService: DuplicateService,
        private readonly tradeRepo: TradeRepository,
        private readonly telegramService: TelegramService,
        private readonly limitOrdersService: LimitOrdersService,
        private readonly takeProfitsService: TakeProfitsService,
        private readonly http: Http,
    ) {}

    private socket: WebSocket

    public get identifier(): string {
        return this.unit.identifier
    }

    onModuleInit() {
        this.startListening()
    }

    onModuleDestroy() {
        this.stopListening()
    }



    private startBinanceUserWebSocket() {
        this.socket = new WebSocket(`${UnitUtil.socketUri}/${this.unit.listenKey}`)

        this.socket.onopen = (event: Event) => {
            this.log(`Opened socket`)
        }

        this.socket.onclose = (event: CloseEvent) => {
            this.log(`Closed socket`)
        }
        
        this.socket.onerror = (event: ErrorEvent) => {
            this.log(`Error on socket`)
            this.log(`event.error`)
            this.log(event.error)
            this.unitService.removeListenKey(this.unit)
        }

        this.socket.onmessage = async (event: MessageEvent) => {
            this.removeListenKeyIfMessageIsAboutClose(event)

            const tradeEvent: TradeEventData = JSONbig.parse(event.data as string)
            this.logger.log(`[${this.unit.identifier}] Biannce Event ${tradeEvent.e} received`)

            if (TradeUtil.isTradeEvent(tradeEvent)) {
                const eventTradeResult = TradeUtil.parseToFuturesResult(tradeEvent)

                if (TradeUtil.isFilledOrder(eventTradeResult)) {
                    this.filledOrderAction(eventTradeResult)
                }
            }
        }
    }


    private async filledOrderAction(eventTradeResult: FuturesResult) {
        if (this.duplicateService.preventDuplicate(eventTradeResult, this.unit)) {
            return
        }

        const orderType = ClientOrderIdUtil.orderTypeByClientOrderId(eventTradeResult.clientOrderId)
        switch (orderType) {
            case ClientOrderId.MARKET_ORDER: return this.onFilledPosition(eventTradeResult)

            case ClientOrderId.LIMIT_ORDER: return this.onFilledLimitOrder(eventTradeResult)

            case ClientOrderId.TAKE_PROFIT: return this.onFilledTakeProfit(eventTradeResult)

            case ClientOrderId.STOP_LOSS: return this.onFilledStopLoss(eventTradeResult)

            default: 
                this.logger.error(`Found trade but matching error! clientOrderId: ${eventTradeResult.clientOrderId}, orderId: ${eventTradeResult.orderId}`)
        }

    }


    private async onFilledPosition(eventTradeResult: FuturesResult) {
        await this.waitUntilSaveTrade()
        const trade = await this.tradeRepo.findByFilledMarketOrder(eventTradeResult, this.unit)
        if (!trade) {
            this.logger.error(`[${this.unit.identifier}] not found trade when filled position, clientOrderId: ${eventTradeResult.clientOrderId}`)
            return
        }
        const ctx = this.tradeContext(trade)
        TradeUtil.addLog(`Found trade on filled position ${ctx.trade.marketResult.clientOrderId}}`, ctx, this.logger)
        try {
            const wasOpenOrder = ctx.trade.marketResult?.status === TradeStatus.NEW
            if (wasOpenOrder) {
                TradeUtil.addLog(`Was open order`, ctx, this.logger)
                this.tradeService.closeOrderEvent(ctx)
            }
            ctx.trade.marketResult = eventTradeResult
            await this.tradeService.placeStopLoss(ctx)
            await this.takeProfitsService.openFirstTakeProfit(ctx)
        } catch (error) {
            const msg = Http.handleErrorMessage(error)
            TradeUtil.addError(msg, ctx, this.logger)
        } finally {
            const saved = await this.tradeRepo.update(ctx)
            this.telegramService.onFilledPosition(ctx)
        }
    }

    private async onFilledStopLoss(eventTradeResult: FuturesResult) {
        const trade = await this.tradeRepo.findByFilledStopLoss(eventTradeResult, this.unit)
        if (!trade) {
            this.logger.error(`[${this.unit.identifier}] not found trade when filled Stop Loss`)
            return
        }
        const ctx = this.tradeContext(trade)
        TradeUtil.addLog(`Found trade on filled Stop Loss ${ctx.trade.marketResult.clientOrderId}}`, ctx, this.logger)
        try {
            ctx.trade.closed = true
            ctx.trade.stopLossResult = eventTradeResult
            const takeProfits = ctx.trade.variant.takeProfits
            for (let tp of takeProfits) {
                if (tp.result && tp.result.status === TradeStatus.NEW) {
                    const closeResult = await this.tradeService.closeOrder(ctx, tp.result.clientOrderId)
                    tp.result = closeResult
                    TradeUtil.addLog(`Closed take profit with order: ${tp.order}`, ctx, this.logger)
                }
            }
        } catch (error) {
            const msg = Http.handleErrorMessage(error)
            TradeUtil.addError(msg, ctx, this.logger)
        } finally {
            const saved = await this.tradeRepo.update(ctx)
            this.telegramService.onFilledStopLoss(ctx)
        }
    }

    private async onFilledLimitOrder(eventTradeResult: FuturesResult) {
        const trade = await this.tradeRepo.findByFilledLimitOrder(eventTradeResult, this.unit)
        if (!trade) {
            this.logger.error(`[${this.unit.identifier}] not found trade when filled Limit Order`)
            return
        }
        const ctx = this.tradeContext(trade)

        const limitOrder =LimitOrderUtil.updateFilledLimitOrder(ctx, eventTradeResult)
        TradeUtil.addLog(`Filled ${limitOrder.order} Limit Order: ${eventTradeResult.clientOrderId}, averagePrice: ${limitOrder.result?.averagePrice}`, ctx, this.logger)

        this.limitOrdersService.onFilledLimitOrder(ctx)
    }

    private async onFilledTakeProfit(eventTradeResult: FuturesResult) {
        const trade = await this.tradeRepo.findByFilledTakeProfit(eventTradeResult, this.unit)
        if (!trade) {
            this.logger.error(`[${this.unit.identifier}] not found trade when filled Take Profit`)
            return
        }
        const ctx = this.tradeContext(trade)

        const takeProfit = TPUtil.updateFilledTakeProfit(eventTradeResult, ctx)
        TradeUtil.addLog(`Filled take profit order: ${takeProfit.order}, averagePrice: ${takeProfit.result?.averagePrice}`, ctx, this.logger)
        
        this.takeProfitsService.onFilledTakeProfit(ctx)
    }


    private tradeContext(trade: Trade) {
        return new TradeCtx({ trade: trade, unit: this.unit })
    }

    private async waitUntilSaveTrade() {
        return new Promise(resolve => setTimeout(resolve, 1000))
    }

    private log(log: string) {
        this.logger.warn(`[${this.unit.identifier}] ${log}`)
    }

    private errorLog(log: string) {
        this.logger.error(`[${this.unit.identifier}] ${log}`)
    }





// listenkey

    public startListening = async () => {
        if (this.WEBSOCKET_ONLY_FOR) {
            if (this.unit.identifier !== this.WEBSOCKET_ONLY_FOR) {
                return
            }
        }
        this.log('startListening')
        if (this.socketOpened()) {
            this.log(`Socket already opened`)
            return
        }

        await this.getNewListenKey()
        if (!this.unit.listenKey) {
            this.errorLog(`No listen key when starting listening`)
        }


        this.startBinanceUserWebSocket()
    }

    public async keepAliveListenKey() {
        if (process.env.SKIP_WEBSOCKET_LISTEN === 'true') {
            this.log(`[SKIP] keep alive listen keys`)
            return
        }
        if (this.WEBSOCKET_ONLY_FOR) {
            this.log(`Keep alive only for ${this.WEBSOCKET_ONLY_FOR}`)
            if (this.unit.identifier !== this.WEBSOCKET_ONLY_FOR) {
                return
            }
        }
        const listenKey = await this.listenKeyRequest('PUT')
        if (!listenKey) {
            this.errorLog(`Listen key not valid when keeping alive`)
            await this.getNewListenKey()
            return
        }
        this.unit.listenKey = listenKey
        await this.unitService.updateListenKey(this.unit)
        this.log('Listen key kept alive')
    }


    private async getNewListenKey() {
        const listenKey = await this.listenKeyRequest('POST')
        if (!listenKey) {
            this.log(`Listen key not found`)
            return
        }
        this.unit.listenKey = listenKey
        this.unitService.updateListenKey(this.unit)
    }


    public stopListening() {
        this.listenKeyRequest('DELETE')
    }

    public removeListenKeyIfMessageIsAboutClose(event: MessageEvent) {
        try {
            const data = JSON.parse(event?.data.toString())
            if (data?.e === 'listenKeyExpired') {
                if (this.socketOpened()) {
                    this.unitService.removeListenKey(this.unit)
                    this.socket.close()
                    this.errorLog(`LISTENER CLOSED`)
                }
            }
        } catch {
            return
        }
    }

    private async listenKeyRequest(method: HttpMethod): Promise<string> {
        try {
            const response = await this.http.fetch<ListeKeyResponse>({
                url: this.signUrlWithParams(`/listenKey`, this.unit, ''),
                method: method,
                headers: Util.getHeaders(this.unit)
            })
            return response.listenKey
        } catch (error) {
            const message = Http.handleErrorMessage(error)
            this.logger.error(message)
            return ''
        }
    }

    private signUrlWithParams(path: string, unit: Unit, queryString: string) {
        const url = `${TradeUtil.futuresUri}${path}`
        return Util.sign(url, queryString, unit)
    }

    private socketOpened(): boolean {
        const readyState = this.socket?.readyState
        this.log(`state: ${readyState}`)
        if (WebSocket.OPEN === readyState || WebSocket.CONNECTING === readyState) {
            return true
        }
        return false
    }
    
}
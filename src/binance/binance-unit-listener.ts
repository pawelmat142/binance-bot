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
import { FuturesResult, TradeStatus } from "./model/trade";
import { TradeCtx } from "./model/trade-variant";
import { TradeRepository } from "./trade.repo";
import { TradeService } from "./trade.service";
import { Http } from "../global/http/http.service";
import { TelegramService } from "../telegram/telegram.service";
import { LimitOrderUtil } from "./utils/limit-order-util";
import { LimitOrdersService } from "./limit-orders.service";
import { TakeProfitsService } from "./take-profits.service";
import { TPUtil } from "./utils/take-profit-util";
import { Cron, CronExpression } from "@nestjs/schedule";
import { HttpMethod } from "../global/type";
import { Util } from "./utils/util";


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
        
        const listenKey = await this.listenKeyRequest('POST')
        if (!listenKey) {
            this.log(`Listen key not found`)
            return
        }

        this.unit.listenKey = listenKey
        this.startBinanceUserWebSocket()
        this.unitService.updateListenKey(this.unit)
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
            this.log(`Listen key not found when keeping alive`)
            return
        }
        this.unit.listenKey = listenKey
        await this.unitService.updateListenKey(this.unit)
        this.log('Listen key kept alive')
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
                    if (this.duplicateService.preventDuplicate(eventTradeResult, this.unit)) {
                        return
                    }
                    const ctx = await this.prepareTradeContext(eventTradeResult)
                    if (ctx) {
                        this.onFilledOrder(ctx, eventTradeResult)
                    }
                }
            }
        }
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






    private async onFilledOrder(ctx: TradeCtx, eventTradeResult: FuturesResult) {
        if (ctx.trade.marketResult?.orderId === eventTradeResult.orderId) {
            this.onFilledPosition(ctx, eventTradeResult)

        } else if (LimitOrderUtil.orderIds(ctx).includes(eventTradeResult.orderId)) {
            this.limitOrdersService.onFilledLimitOrder(ctx, eventTradeResult)
            
        } else if (ctx.trade.stopLossResult.orderId === eventTradeResult.orderId) {
            this.onFilledStopLoss(ctx, eventTradeResult)

        } else if (TPUtil.orderIds(ctx).includes(eventTradeResult.orderId)) {
            this.takeProfitsService.onFilledTakeProfit(ctx, eventTradeResult)

        } else {
            TradeUtil.addLog(`Found trade but matching error! ${eventTradeResult.orderId}`, ctx, this.logger)
        }
    }

    private async onFilledPosition(ctx: TradeCtx, eventTradeResult: FuturesResult) {
        TradeUtil.addLog(`Found trade with result id ${ctx.trade.marketResult.orderId} match trade event with id ${eventTradeResult.orderId}`, ctx, this.logger)
        try {
            const wasOpenOrder = ctx.trade.marketResult?.status === TradeStatus.NEW
            if (wasOpenOrder) {
                TradeUtil.addLog(`Was open order`, ctx, this.logger)
                this.tradeService.closeOrderEvent(ctx)
            }
            ctx.trade.marketResult = eventTradeResult
            await this.tradeService.stopLossRequest(ctx)
            await this.takeProfitsService.openFirstTakeProfit(ctx)
        } catch (error) {
            const msg = Http.handleErrorMessage(error)
            TradeUtil.addError(msg, ctx, this.logger)
        } finally {
            const saved = await this.tradeRepo.update(ctx)
            this.telegramService.onFilledPosition(ctx)
        }
    }

    private async onFilledStopLoss(ctx: TradeCtx, eventTradeResult: FuturesResult) {
        TradeUtil.addLog(`Filled Stop Loss with orderId ${ctx.trade.stopLossResult.orderId}, stopPrice: ${eventTradeResult.stopPrice}`, ctx, this.logger)
        try {
            ctx.trade.closed = true
            ctx.trade.stopLossResult = eventTradeResult
            const takeProfits = ctx.trade.variant.takeProfits
            for (let tp of takeProfits) {
                if (tp.result && tp.result.status === TradeStatus.NEW) {
                    const closeResult = await this.tradeService.closeOrder(ctx, tp.result.orderId)
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

    private async prepareTradeContext(eventTradeResult: FuturesResult): Promise<TradeCtx> {
        await this.waitUntilSaveTrade() //workaound to prevent finding trade before save Trade entity
        let trade = await this.tradeRepo.findByTradeEvent(eventTradeResult, this.unit)
        if (!trade) {
            this.logger.error(`[${this.unit.identifier}] Not found matching trade - on filled order ${eventTradeResult.orderId}, ${eventTradeResult.side}, ${eventTradeResult.symbol}`)
            return
        }
        return new TradeCtx({ unit: this.unit, trade })
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
    
}
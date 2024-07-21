import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TradeUtil } from './utils/trade-util';
import { TradeStatus, TradeType } from './model/trade';
import { CalculationsService } from './calculations.service';
import { TradeService } from './trade.service';
import { TradeCtx } from './model/trade-variant';
import { Subscription } from 'rxjs';
import { DuplicateService } from './duplicate.service';
import { TradeRepository } from './trade.repo';
import { EntryPriceCalculator } from '../global/calculators/entry-price.calculator';
import { Http } from '../global/http/http.service';
import { Signal } from '../signal/signal';
import { SignalUtil } from '../signal/signal-util';
import { SignalService } from '../signal/signal.service';
import { TelegramService } from '../telegram/telegram.service';
import { Unit } from '../unit/unit';
import { UnitService } from '../unit/unit.service';
import { LimitOrdersService } from './limit-orders.service';
import { LimitOrderUtil } from './utils/limit-order-util';
import { TPUtil } from './utils/take-profit-util';
import { VariantUtil } from './utils/variant-util';
import { TakeProfitsService } from './take-profits.service';
import { BinanceUnitListener } from './binance-unit-listener';
import { Cron, CronExpression } from '@nestjs/schedule';


@Injectable()
export class BinanceService implements OnModuleInit, OnModuleDestroy {

    private readonly logger = new Logger(BinanceService.name)

    constructor(
        private readonly calculationsService: CalculationsService,
        private readonly signalService: SignalService,
        private readonly tradeService: TradeService,
        private readonly telegramService: TelegramService,
        private readonly unitService: UnitService,
        private readonly duplicateService: DuplicateService,
        private readonly tradeRepo: TradeRepository,
        private readonly limitOrdersService: LimitOrdersService,
        private readonly takeProfitsService: TakeProfitsService,
        private readonly http: Http,
    ) {}


    private unitListeners: BinanceUnitListener[] = []

    private signalSubscription: Subscription

    public update(ctx: TradeCtx) {
        return this.tradeRepo.update(ctx)
    }


    onModuleInit(): void {
        if (!this.signalSubscription) {
            this.signalSubscription = this.signalService.tradeObservable$.subscribe({
                next: this.onSignalEvent,
                error: this.logger.error
            })
        }
        this.unitService.units$.subscribe(units => this.initBinanceUnitListeners(units))
    }

    public async initBinanceUnitListeners(units: Unit[]) {
        if (process.env.SKIP_WEBSOCKET_LISTEN === 'true') {
            this.logger.warn(`SKIP_WEBSOCKET_LISTEN`)
            return
        }

        this.deactivateInactiveUnitListeners(units)

        this.unitListeners = units
            .filter(u => u.active)
            .map(u => this.createBinanceUnitListenerInstance(u))
    }

    private deactivateInactiveUnitListeners(activeUnits: Unit[]) {
        const activeUnitIdentifiers = activeUnits.map(u => u.identifier)
        this.unitListeners.filter(unitListener => !activeUnitIdentifiers.includes(unitListener.identifier)).forEach(unitListener => {
            unitListener.stopListening()
        })
    }

    private createBinanceUnitListenerInstance = (unit: Unit): BinanceUnitListener => {
        const instance = new BinanceUnitListener(unit, 
            this.unitService, 
            this,
            this.tradeService,
            this.duplicateService,
            this.tradeRepo,
            this.telegramService,
            this.limitOrdersService,
            this.takeProfitsService,
            this.http
        )
        instance.onModuleInit()
        return instance
    }

    @Cron(CronExpression.EVERY_30_MINUTES)
    private async keepAliveListenKeys() {
        (this.unitListeners || []).forEach(u => u.keepAliveListenKey())
    }


    onModuleDestroy() {
        this.logger.log(`[${this.constructor.name}] onModuleDestroy`)
        if (this.signalSubscription) {
            this.signalSubscription.unsubscribe()
            this.signalSubscription = undefined
        }
    }

    private onSignalEvent = async (signal: Signal) => {
        if (signal.valid) {

            await EntryPriceCalculator.start(signal, this.calculationsService)

            if (SignalUtil.entryCalculated(signal)) {
                this.openTradesPerUnit(signal)
            }
        } 
        else if (SignalUtil.anyOtherAction(signal)) {
            this.otherSignalActionsPerUnit(signal)
        } else {
            SignalUtil.addError(`Signal validation error!`, signal, this.logger)
        }
        this.signalService.updateLogs(signal)
    }

    private openTradesPerUnit = async (signal: Signal) => {
        if (process.env.SKIP_TRADE === 'true') {
            SignalUtil.addWarning(`SKIP_TRADE`, signal, this.logger)
            return
        }
        
        const units = this.unitService.units || []
        for (let unit of units) {

            const trade = this.tradeRepo.prepareTrade(signal, unit.identifier)
            const ctx = new TradeCtx({ trade, unit })
            if (await this.duplicateService.preventDuplicateTradeInProgress(ctx)) {
                continue
            }
            this.tradeLog(ctx, `Opening trade`)
            trade.timestamp = new Date()
            await this.openTradeForUnit(ctx)
        }
    }

    private async openTradeForUnit(ctx: TradeCtx) {
        const tradeOnlyFor = process.env.TRADE_ONLY_FOR
        if (tradeOnlyFor && ctx.unit.identifier !== tradeOnlyFor) {
            this.tradeLog(ctx, `[SKIP TRADE]`)
            return
        }
        try {
            await this.tradeService.setIsolatedMode(ctx)
            await this.tradeService.setPositionLeverage(ctx)

            if (ctx.trade.variant.entryByMarket) {
                await this.tradeService.openPositionByMarket(ctx)
            } 
            else if (LimitOrderUtil.limitOrdersCalculated(ctx.trade.variant)) {
                await this.limitOrdersService.openLimitOrders(ctx)
            } 
            else {
                throw new Error(`Not by market and limits not calculated`)
            }
        } catch (error) {
            const msg = Http.handleErrorMessage(error)
            const log = TradeUtil.addError(msg, ctx, this.logger)
            this.telegramService.tradeErrorMessage(ctx, log)
        } finally {
            const saved = await this.tradeRepo.save(ctx)
        }
    }

    private async otherSignalActionsPerUnit(signal: Signal) {
        const units = this.unitService.units || []

        for (let unit of units) {
            const trades = await this.tradeRepo.findBySignal(signal, unit)
            if (!(trades || []).length) {
                SignalUtil.addLog(`Could not find trade ${signal.variant.side} ${signal.variant.symbol} for other signal action, unit: ${unit.identifier}`, signal, this.logger)
                this.signalService.updateLogs(signal)
                continue
            }
            for (let trade of trades) {
                const ctx = new TradeCtx({ trade, unit })
                await this.otherSignalActionForUnit(ctx, signal)
            }
        }
    }

    private async otherSignalActionForUnit(ctx: TradeCtx, signal: Signal) {
        try {
            if (signal.otherSignalAction.manualClose) {
                if (ctx.trade.marketResult?.status === TradeStatus.FILLED) {
                    await this.manualClosePositionFull(ctx)
                }
                else if (ctx.trade.marketResult?.status === TradeStatus.NEW) {
                    await this.manualCloseOpenOrder(ctx)
                    this.tradeService.closeOrderEvent(ctx)
                } else {
                    TradeUtil.addError(`wrong trade status: ${ctx.trade.marketResult?.status} when manual close`, ctx, this.logger)
                } 
            } 
            else if (signal.otherSignalAction.tradeDone) {
                this.telegramService.sendUnitMessage(ctx, [`${VariantUtil.label(ctx.trade.variant)}`, `Trade done, closing...`])
                await this.manualClosePositionFull(ctx)
            } 
            else {
                if (signal.otherSignalAction.takeSomgeProfit) {
                    TradeUtil.addLog(`[START] take some profit`, ctx, this.logger)
                    await this.takeProfitsService.takeSomeProfit(ctx)
                    TradeUtil.addLog(`[STOP] take some profit`, ctx, this.logger)
                } 
                else if (signal.otherSignalAction.takeProfitFound && !TPUtil.anyPendingOrFilledTakeProfit(ctx)) {
                    TradeUtil.addLog(`[START] place take profits`, ctx, this.logger)
                    ctx.trade.variant.takeProfits = signal.variant.takeProfits
                    await this.takeProfitsService.openFirstTakeProfit(ctx)
                    TradeUtil.addLog(`[STOP] place take profits`, ctx, this.logger)
                }
                if (signal.otherSignalAction.moveSl) {
                    if (signal.otherSignalAction.moveSlToEntryPoint) {
                        TradeUtil.addLog(`[START] move stop loss to entry point`, ctx, this.logger)
                        const entryPrice = Number(ctx.trade.marketResult.averagePrice)
                        if (!entryPrice) {
                            TradeUtil.addError(`entry price to move SL not found: ${entryPrice}`, ctx, this.logger)
                            this.tradeRepo.update(ctx)
                        }
                        await this.tradeService.moveStopLoss(ctx, entryPrice)
                        TradeUtil.addLog(`[STOP] move stop loss to entry point`, ctx, this.logger)
                    } else {
                        TradeUtil.addError(`Move sl where??`, ctx, this.logger)
                    }
                }
                else if (signal.otherSignalAction.stopLossFound && isNaN(ctx.trade.variant.stopLoss)) {
                    TradeUtil.addLog(`[START] place stop loss`, ctx, this.logger)
                    ctx.trade.variant.stopLoss = signal.variant.stopLoss
                    await this.tradeService.placeStopLoss(ctx)
                    TradeUtil.addLog(`[STOP] place stop loss`, ctx, this.logger)
                }
                this.tradeRepo.update(ctx)
            }
        } catch (error) {
            const msg = Http.handleErrorMessage(error)
            TradeUtil.addError(msg, ctx, this.logger)
        }

    }


    public async manualClosePositionFull(ctx: TradeCtx) {
        const symbol = ctx.trade.variant.symbol
        const unit = ctx.unit
        this.tradeLog(ctx, `[START] Closing position`)

        const openOrders = await this.tradeService.fetchOpenOrders(ctx.unit, symbol)
        if (Array.isArray(openOrders)) {
            for (let order of openOrders) {
                const result = await this.tradeService.closeOrder(ctx.unit, ctx.symbol, order.clientOrderId)
                if (result.type === TradeType.STOP_MARKET) {
                    ctx.trade.stopLossResult = result
                    this.tradeLog(ctx, `Closed STOP LOSS  ${order.clientOrderId}`)
                } else if (result.type === TradeType.TAKE_PROFIT_MARKET) {
                    ctx.trade.variant.takeProfits
                        .filter(tp => tp.result?.clientOrderId === result.clientOrderId)
                        .forEach(tp => tp.result = result)
                    this.tradeLog(ctx, `Closed TAKE PROFIT ${order.clientOrderId}`)
                } else {
                    (ctx.trade.variant.limitOrders || [])
                        .filter(lo => lo.result?.clientOrderId === result.clientOrderId)
                        .forEach(lo => lo.result = result)

                    TradeUtil.addError(`Closed order: ${order.clientOrderId}, type: ${result.type}`, ctx, this.logger)
                }
            }
        } else {
            TradeUtil.addError(`Could not find open orders`, ctx, this.logger)
        }

        const result = await this.tradeService.closePosition(ctx)
        this.tradeLog(ctx, `Closed position`)

        const trades = await this.tradeRepo.findBySymbol(ctx.unit, symbol)
        this.tradeLog(ctx, `Found ${trades.length} open trades`)

        for (let trade of trades) {
            if (trade._id === ctx.trade._id) {
                trade.marketResult = result
                await this.tradeRepo.closeTradeManual(ctx)
                this.tradeLog(ctx, `Closed trade: ${trade._id}`)
            } else {
                const tradeCtx = new TradeCtx({ unit, trade })
                await this.tradeRepo.closeTradeManual(tradeCtx)
                this.tradeLog(tradeCtx, `Closed trade: ${trade._id}`)
            }
        }
        this.tradeLog(ctx, `[STOP] Closing position`)
    }

    private async manualCloseOpenOrder(ctx: TradeCtx) {
        try {
            const result = await this.tradeService.closeOrder(ctx.unit, ctx.symbol, ctx.trade.marketResult.clientOrderId)
            ctx.trade.marketResult = result
            ctx.trade.closed = true
        } catch (error) {
            const msg = Http.handleErrorMessage(error)
            TradeUtil.addError(`Error trying to close trade order ${ctx.trade.marketResult.clientOrderId} manualy`, ctx, this.logger)
            TradeUtil.addError(msg, ctx, this.logger)
        }
        finally {
            await this.update(ctx)
        }
    }

    private tradeLog(ctx: TradeCtx, log: string) {
        TradeUtil.addLog(log, ctx, this.logger)
    }
}

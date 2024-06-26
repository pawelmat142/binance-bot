import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TradeUtil } from './trade-util';
import { FuturesResult, Trade, TradeStatus } from './model/trade';
import { CalculationsService } from './calculations.service';
import { SignalService } from 'src/signal/signal.service';
import { TradeService } from './trade.service';
import { TradeCtx } from './model/trade-variant';
import { TelegramService } from 'src/telegram/telegram.service';
import { UnitService } from 'src/unit/unit.service';
import { Unit } from 'src/unit/unit';
import { Subscription } from 'rxjs';
import { DuplicateService } from './duplicate.service';
import { SignalUtil } from 'src/signal/signal-util';
import { TradeRepository } from './trade.repo';
import { Signal } from 'src/signal/signal';
import { TradeEventData, TradeType } from './model/model';
import { Http } from 'src/global/http/http.service';
import { TPUtil } from './take-profit-util';
import { VariantUtil } from './model/variant-util';


@Injectable()
export class BinanceService implements OnModuleInit, OnModuleDestroy {

    private readonly logger = new Logger(BinanceService.name)

    constructor(
        private readonly calcService: CalculationsService,
        private readonly signalService: SignalService,
        private readonly tradeService: TradeService,
        private readonly telegramService: TelegramService,
        private readonly unitService: UnitService,
        private readonly duplicateService: DuplicateService,
        private readonly tradeRepo: TradeRepository,
    ) {}


    private signalSubscription: Subscription
    private tradeEventSubscription: Subscription

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
        if (!this.tradeEventSubscription) {
            this.tradeEventSubscription = this.unitService.tradeEventObservable$.subscribe({
                next: async (tradeEvent: TradeEventData) => {
                    const eventTradeResult = TradeUtil.parseToFuturesResult(tradeEvent)
                    const unit = this.unitService.getUnit(tradeEvent.unitIdentifier)
            
                    if (TradeUtil.isFilledOrder(eventTradeResult)) {
                        if (this.duplicateService.preventDuplicate(eventTradeResult, unit)) {
                            return
                        }
                        const ctx = await this.prepareTradeContext(eventTradeResult, unit)
                        if (ctx) {
                            this.onFilledOrder(ctx, eventTradeResult)
                        }
                    }
                },
                error: console.error,
                complete: () => {}
            })
        }
    }

    onModuleDestroy() {
        if (this.signalSubscription) {
            this.signalSubscription.unsubscribe()
            this.signalSubscription = undefined
        }
        if (this.tradeEventSubscription) {
            this.tradeEventSubscription.unsubscribe()
            this.tradeEventSubscription = undefined
        }
    }

    private onSignalEvent = async (signal: Signal) => {
        if (signal.valid) {
            SignalUtil.addLog(`Signal ${signal._id} ${signal.variant.side} ${signal.variant.symbol}  is valid, opening trade per unit... `, signal, this.logger)
            this.openTradesPerUnit(signal)
        } 
        else if (SignalUtil.anyOtherAction(signal)) {
            this.otherActionsPerUnit(signal)
        } else {
            SignalUtil.addError(`Signal validation error!`, signal, this.logger)
        }
        this.signalService.updateLogs(signal)
    }

    private openTradesPerUnit = async (signal: Signal) => {
        if (process.env.SKIP_TRADE === 'true') {
            this.logger.warn('SKIP TRADE')
            return
        }
        
        const units = this.unitService.units || []
        for (let unit of units) {

            const trade = this.tradeRepo.prepareTrade(signal, unit.identifier)
            const ctx = new TradeCtx({ trade, unit })
            if (await this.findInProgressTrade(ctx)) {
                return
            }
            this.tradeLog(ctx, `Opening trade`)
            trade.timestamp = new Date()
            await this.openTradeForUnit(ctx)
        }
    }

    private async otherActionsPerUnit(signal: Signal) {
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
                await this.otherSignalAction(ctx, signal)
            }
        }
    }

    private async otherSignalAction(ctx: TradeCtx, signal: Signal) {
        try {
            if (signal.otherSignalAction.manualClose) {
                if (ctx.trade.futuresResult?.status === TradeStatus.FILLED) {
                    await this.manualClosePositionFull(ctx)
                }
                else if (ctx.trade.futuresResult?.status === TradeStatus.NEW) {
                    await this.manualCloseOpenOrder(ctx)
                    this.tradeService.closeOrderEvent(ctx)
                } else {
                    TradeUtil.addError(`wrong trade status: ${ctx.trade.futuresResult?.status} when manual close`, ctx, this.logger)
                } 
            } 
            else if (signal.otherSignalAction.tradeDone) {
                this.telegramService.sendUnitMessage(ctx, [`${VariantUtil.label(ctx.trade.variant)}`, `Trade done, closing...`])
                await this.manualClosePositionFull(ctx)
            } 
            else {
                if (signal.otherSignalAction.takeSomgeProfit) {
                    TradeUtil.addLog(`[START] take some profit`, ctx, this.logger)
                    await this.tradeService.takeSomeProfit(ctx)
                    TradeUtil.addLog(`[STOP] take some profit`, ctx, this.logger)
                } 
                else if (signal.otherSignalAction.takeProfitFound && !TPUtil.anyPendingOrFilledTakeProfit(ctx)) {
                    TradeUtil.addLog(`[START] place take profits`, ctx, this.logger)
                    ctx.trade.variant.takeProfits = signal.variant.takeProfits
                    await this.openFirstTakeProfit(ctx)
                    TradeUtil.addLog(`[STOP] place take profits`, ctx, this.logger)
                }
                if (signal.otherSignalAction.moveSl) {
                    if (signal.otherSignalAction.moveSlToEntryPoint) {
                        TradeUtil.addLog(`[START] move stop loss to entry point`, ctx, this.logger)
                        const entryPrice = Number(ctx.trade.futuresResult.averagePrice)
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
                    await this.tradeService.stopLossRequest(ctx)
                    TradeUtil.addLog(`[STOP] place stop loss`, ctx, this.logger)
                }
                this.tradeRepo.update(ctx)
            }
        } catch (error) {
            const msg = Http.handleErrorMessage(error)
            TradeUtil.addError(msg, ctx, this.logger)
        }

    }

    private async openTradeForUnit(ctx: TradeCtx) {
        const tradeOnlyFor = process.env.TRADE_ONLY_FOR
        if (tradeOnlyFor) {
            if (ctx.unit.identifier !== tradeOnlyFor) {
                this.tradeLog(ctx, `[SKIP TRADE]`)
                return
            }
        }
        try {
            await this.tradeService.setIsolatedMode(ctx)
            await this.tradeService.setPositionLeverage(ctx)
            await this.calcService.calculateEntryPrice(ctx)
            this.calcService.calculateTradeQuantity(ctx)
            await this.tradeService.openPosition(ctx)
        } catch (error) {
            const msg = Http.handleErrorMessage(error)
            const log = TradeUtil.addError(msg, ctx, this.logger)
            this.telegramService.tradeErrorMessage(ctx, log)
        } finally {
            const saved = await this.tradeRepo.save(ctx)
        }
    }

    private async onFilledOrder(ctx: TradeCtx, eventTradeResult: FuturesResult) {
        if (ctx.trade.futuresResult.orderId === eventTradeResult.orderId) {
            this.onFilledPosition(ctx, eventTradeResult)

        } else if (ctx.trade.stopLossResult.orderId === eventTradeResult.orderId) {
            this.onFilledStopLoss(ctx, eventTradeResult)

        } else if (this.takeProfitOrderIds(ctx.trade).includes(eventTradeResult.orderId)) {
            this.onFilledTakeProfit(ctx, eventTradeResult)

        } else {
            TradeUtil.addLog( `Found trade but matching error! ${eventTradeResult.orderId}, ${eventTradeResult.side}, ${eventTradeResult.symbol}`, ctx, this.logger)
        }
    }

    private takeProfitOrderIds(order: Trade): BigInt[] {
        return order.variant.takeProfits.filter(tp => !!tp.reuslt).map(tp => tp.reuslt?.orderId)
    }

    private async onFilledPosition(ctx: TradeCtx, eventTradeResult: FuturesResult) {
        TradeUtil.addLog(`Found trade with result id ${ctx.trade.futuresResult.orderId} match trade event with id ${eventTradeResult.orderId}`, ctx, this.logger)
        try {
            const wasOpenOrder = ctx.trade.futuresResult?.status === TradeStatus.NEW
            if (wasOpenOrder) {
                TradeUtil.addLog(`Was open order`, ctx, this.logger)
                this.tradeService.closeOrderEvent(ctx)
            }
            ctx.trade.futuresResult = eventTradeResult
            await this.tradeService.stopLossRequest(ctx)
            await this.openFirstTakeProfit(ctx)
        } catch (error) {
            const msg = Http.handleErrorMessage(error)
            TradeUtil.addError(msg, ctx, this.logger)
        } finally {
            const saved = await this.tradeRepo.update(ctx)
            this.telegramService.onFilledPosition(ctx)
        }
    }

    private async onFilledStopLoss(ctx: TradeCtx, eventTradeResult: FuturesResult) {
        TradeUtil.addLog(`Filled stop loss with orderId ${ctx.trade.stopLossResult.orderId}, stopPrice: ${eventTradeResult.stopPrice}`, ctx, this.logger)
        try {
            ctx.trade.closed = true
            ctx.trade.stopLossResult = eventTradeResult
            const takeProfits = ctx.trade.variant.takeProfits
            for (let tp of takeProfits) {
                if (tp.reuslt && tp.reuslt.status === TradeStatus.NEW) {
                    const closeResult = await this.tradeService.closeOrder(ctx, tp.reuslt.orderId)
                    tp.reuslt = closeResult
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

    private async onFilledTakeProfit(ctx: TradeCtx, eventTradeResult: FuturesResult) {
        try {
            this.updateFilledTakeProfit(eventTradeResult, ctx)

            if (TPUtil.positionFullyFilled(ctx)) {
                ctx.trade.closed = true
                await this.tradeService.closeStopLoss(ctx)
                await this.tradeService.closePendingTakeProfit(ctx)
                this.manualClosePositionFull(ctx)
                this.tradeLog(ctx, `Every take profit filled, stop loss closed ${ctx.trade._id}`)
                this.telegramService.onClosedPosition(ctx)
            }
            else {
                await this.tradeService.moveStopLoss(ctx)
                this.tradeLog(ctx, `Moved stop loss`)
                await this.tradeService.openNextTakeProfit(ctx)
                this.tradeLog(ctx, `Opened next take profit ${ctx.trade._id}`)
                this.telegramService.onFilledTakeProfit(ctx)
            }
        } catch (error) {
            const msg = Http.handleErrorMessage(error)
            TradeUtil.addError(msg, ctx, this.logger)
        } finally {
            const saved = await this.tradeRepo.update(ctx)
        }
    }

    public async openFirstTakeProfit(ctx: TradeCtx) {
        if (!ctx.trade.variant.takeProfits?.length) {
            TradeUtil.addLog(`Take Profits empty, skipped opening`, ctx, this.logger)
            return
        }
        TradeUtil.addLog(`Opening first Take Profit`, ctx, this.logger)
        this.calcService.calculateTakeProfitQuantities(ctx)
        await this.tradeService.openNextTakeProfit(ctx)
    }

    private updateFilledTakeProfit(eventTradeResult: FuturesResult, ctx: TradeCtx) {
        const takeProfits = ctx.trade.variant.takeProfits
        const tp = takeProfits.find(t => t.reuslt?.orderId === eventTradeResult.orderId)
        if (!tp) throw new Error(`Not found Take Profit orderId: ${eventTradeResult.orderId} in found trade ${ctx.trade._id}`)
        tp.reuslt = eventTradeResult
        this.tradeLog(ctx, `Filled take profit order: ${tp.order}, averagePrice: ${tp.reuslt?.averagePrice}`)
    }


    private async findInProgressTrade(ctx: TradeCtx): Promise<boolean> {
        if (process.env.SKIP_PREVENT_DUPLICATE === 'true') {
            this.logger.warn('SKIP PREVENT DUPLICATE TRADE IN PROGRESS')
            return false
        } 
        const trade = await this.tradeRepo.findInProgress(ctx)
        if (trade) {
            TradeUtil.addWarning(`Prevented duplicate trade, found objectId: ${trade._id}`, ctx, this.logger)
            return true
        }
        return false
    }

    private async prepareTradeContext(eventTradeResult: FuturesResult, unit: Unit): Promise<TradeCtx> {
        await this.waitUntilSaveTrade() //workaound to prevent finding trade before save Trade entity
        let trade = await this.tradeRepo.findByTradeEvent(eventTradeResult, unit)
        if (!trade) {
            this.logger.error(`[${unit.identifier}] Not found matching trade - on filled order ${eventTradeResult.orderId}, ${eventTradeResult.side}, ${eventTradeResult.symbol}`)
            return
        }
        return new TradeCtx({ unit, trade })
    }

    private async waitUntilSaveTrade() {
        return new Promise(resolve => setTimeout(resolve, 1000))
    }

    public async manualClosePositionFull(ctx: TradeCtx) {
        const symbol = ctx.trade.variant.symbol
        const unit = ctx.unit
        this.tradeLog(ctx, `[START] Closing position`)

        const openOrders = await this.tradeService.fetchOpenOrders(ctx.unit, symbol)
        if (Array.isArray(openOrders)) {
            for (let order of openOrders) {
                const result = await this.tradeService.closeOrder(ctx, order.orderId)
                if (result.type === TradeType.STOP_MARKET) {
                    ctx.trade.stopLossResult = result
                    this.tradeLog(ctx, `Closed STOP LOSS  ${order.orderId}`)
                } else if (result.type === TradeType.TAKE_PROFIT_MARKET) {
                    ctx.trade.variant.takeProfits
                        .filter(tp => tp.reuslt?.orderId === result.orderId)
                        .forEach(tp => tp.reuslt = result)
                    this.tradeLog(ctx, `Closed TAKE PROFIT ${order.orderId}`)
                } else {
                    TradeUtil.addError(`Closed order: ${order.orderId}, type: ${result.type}`, ctx, this.logger)
                }
            }
        } else {
            TradeUtil.addError(`Could not find open orders`, ctx, this.logger)
        }

        const result = await this.tradeService.closePosition(ctx)
        this.tradeLog(ctx, `Closed position`)

        const trades = await this.tradeRepo.findBySymbol(ctx)
        this.tradeLog(ctx, `Found ${trades.length} open trades`)

        for (let trade of trades) {
            if (trade._id === ctx.trade._id) {
                trade.futuresResult = result
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
            const result = await this.tradeService.closeOrder(ctx, ctx.trade.futuresResult.orderId)
            ctx.trade.futuresResult = result
            ctx.trade.closed = true
        } catch (error) {
            const msg = Http.handleErrorMessage(error)
            TradeUtil.addError(`Error trying to close trade order ${ctx.trade.futuresResult.orderId} manualy`, ctx, this.logger)
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

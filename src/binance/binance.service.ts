import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TradeUtil } from './trade-util';
import { FuturesResult, Trade, TradeStatus } from './model/trade';
import { CalculationsService } from './calculations.service';
import { SignalService } from 'src/signal/signal.service';
import { TradeService } from './trade.service';
import { TradeCtx } from './model/trade-variant';
import { TelegramService } from 'src/telegram/telegram.service';
import { UnitService } from 'src/unit/unit.service';
import { TradeEventData } from './model/trade-event-data';
import { Unit } from 'src/unit/unit';
import { Subscription } from 'rxjs';
import { DuplicateService } from './duplicate.service';
import { SignalUtil } from 'src/signal/signal-util';
import { TradeRepository } from './trade.repo';
import { Signal } from 'src/signal/signal';


// TODO close the trade signal 
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


    async listSignalsTest(): Promise<Signal[]> {
        const uri = 'http://193.56.240.228:8008/signal/list'
        const request = await fetch(uri)
        return request.json()
    }

    private signalSubscription: Subscription
    private tradeEventSubscription: Subscription

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
            SignalUtil.addLog(`Signal ${signal._id} is valid, opening trade per unit... `, signal, this.logger)
            this.openTradesPerUnit(signal)
        } 
        else if (SignalUtil.anyAction(signal)) {
            this.otherActionsPerUnit(signal)
        } else {
            SignalUtil.addError(`Signal validation error!`, signal, this.logger)
        }
        this.signalService.updateLogs(signal)
    }

    private openTradesPerUnit = async (signal: Signal) => {
        const trade = this.tradeRepo.prepareTrade(signal)
        if (!trade.logs) {
            trade.logs = []
        }
        const units = this.unitService.units || []
        for (let unit of units) {
            trade.unitIdentifier = unit.identifier
            const ctx = new TradeCtx({ trade, unit })
            if (await this.findInProgressTrade(ctx)) {
                return
            }
            TradeUtil.addLog(`Opening trade ${ctx.side} ${ctx.symbol}`, ctx, this.logger)
            trade.timestamp = new Date()
            await this.openTradeForUnit(ctx)
        }
    }

    private async otherActionsPerUnit(signal: Signal) {
        const units = this.unitService.units || []

        for (let unit of units) {
            const trade = await this.tradeRepo.findBySignal(signal, unit)
            const ctx = new TradeCtx({ trade, unit })

            if (signal.otherSignalAction.manualClose) {
                TradeUtil.addLog(`[START] manual close for unit ${unit.identifier}`, ctx, this.logger)
                TradeUtil.addLog(`[TODO] manual close per unit`, ctx, this.logger)
                TradeUtil.addLog(`[STOP] manual close for unit ${unit.identifier}`, ctx, this.logger)
            } else {
                if (signal.otherSignalAction.takeSomgeProfit) {
                    TradeUtil.addLog(`[START] take some profit for unit ${unit.identifier}`, ctx, this.logger)
                    await this.tradeService.takeSomeProfit(ctx)
                    TradeUtil.addLog(`[STOP] take some profit for unit ${unit.identifier}`, ctx, this.logger)
                }
                if (signal.otherSignalAction.moveSl) {
                    if (signal.otherSignalAction.moveSlToEntryPoint) {
                        TradeUtil.addLog(`[START] move stop loss to entry point for unit ${unit.identifier}`, ctx, this.logger)
                        const entryPrice = Number(ctx.trade.futuresResult.averagePrice)
                        if (!entryPrice) {
                            TradeUtil.addError(`entry price to move SL not found: ${entryPrice}`, ctx, this.logger)
                            this.tradeRepo.update(ctx)
                        }
                        await this.tradeService.moveStopLoss(ctx, entryPrice)
                        TradeUtil.addLog(`[STOP] move stop loss to entry point for unit ${unit.identifier}`, ctx, this.logger)
                    } else {
                        TradeUtil.addError(`Move sl where??`, ctx, this.logger)
                        this.tradeRepo.update(ctx)
                    }
                }
            }
        }
    }

    private async openTradeForUnit(ctx: TradeCtx) {
        if (process.env.SKIP_TRADE === 'true') {
            this.logger.debug('SKIP TRADE')
            return
        }
        try {
            await this.tradeService.setIsolatedMode(ctx)
            await this.tradeService.setPositionLeverage(ctx)
            await this.calcService.calculateEntryPrice(ctx)
            this.calcService.calculateTradeQuantity(ctx)
            await this.tradeService.openPosition(ctx)
        } catch (error) {
            TradeUtil.addError(error, ctx, this.logger)
            this.telegramService.tradeErrorMessage(ctx)
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

    private takeProfitOrderIds(order: Trade): number[] {
        return order.variant.takeProfits.filter(tp => !!tp.reuslt).map(tp => tp.reuslt?.orderId)
    }

    private async onFilledPosition(ctx: TradeCtx, eventTradeResult: FuturesResult) {
        TradeUtil.addLog(`Found trade with result id ${ctx.trade.futuresResult.orderId} match trade event with id ${eventTradeResult.orderId}`, ctx, this.logger)
        try {
            ctx.trade.futuresResult = eventTradeResult
            await this.tradeService.stopLossRequest(ctx)
            this.calcService.calculateTakeProfitQuantities(ctx)
            await this.tradeService.openNextTakeProfit(ctx)
        } catch (error) {
            TradeUtil.addError(error, ctx, this.logger)
        } finally {
            const saved = await this.tradeRepo.update(ctx)
            this.telegramService.onFilledPosition(ctx)
        }
    }

    private async onFilledStopLoss(ctx: TradeCtx, eventTradeResult: FuturesResult) {
        TradeUtil.addLog(`Filled stop loss with orderId ${ctx.trade.stopLossResult.orderId}`, ctx, this.logger)
        try {
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
            TradeUtil.addError(error, ctx, this.logger)
        } finally {
            const saved = await this.tradeRepo.update(ctx)
            this.telegramService.onFilledStopLoss(ctx)
        }
    }

    private async onFilledTakeProfit(ctx: TradeCtx, eventTradeResult: FuturesResult) {
        try {
            this.updateFilledTakeProfit(eventTradeResult, ctx)

            if (TradeUtil.positionFullyFilled(ctx)) {
                await this.tradeService.closeStopLoss(ctx)
                await this.tradeService.closePendingTakeProfit(ctx)
                TradeUtil.addLog(`Every take profit filled, stop loss closed ${ctx.trade._id}`, ctx, this.logger)
            } 
            else {
                await this.tradeService.moveStopLoss(ctx)
                TradeUtil.addLog(`Moved stop loss`, ctx, this.logger)
                await this.tradeService.openNextTakeProfit(ctx)
                TradeUtil.addLog(`Opened next take profit ${ctx.trade._id}`, ctx, this.logger)
            }
        } catch (error) {
            TradeUtil.addError(error, ctx, this.logger)
        } finally {
            const saved = await this.tradeRepo.update(ctx)
            this.telegramService.onFilledTakeProfit(ctx)
        }
    }


    private updateFilledTakeProfit(eventTradeResult: FuturesResult, ctx: TradeCtx) {
        const takeProfits = ctx.trade.variant.takeProfits
        const tp = takeProfits.find(t => t.reuslt?.orderId === eventTradeResult.orderId)
        if (!tp) throw new Error(`Could not find TP with orderId: ${eventTradeResult.orderId} in found trade ${ctx.trade._id}`)
        TradeUtil.addLog(`Filled take profit: ${tp.order}, averagePrice: ${tp.reuslt?.averagePrice}`, ctx, this.logger)
        tp.reuslt = eventTradeResult
    }


    // TODO move somewhere
    public async update(ctx: TradeCtx) {
        return this.tradeRepo.update(ctx)
    }

    private async findInProgressTrade(ctx: TradeCtx): Promise<boolean> {
        if (process.env.SKIP_PREVENT_DUPLICATE === 'true') {
            this.logger.debug('SKIP PREVENT DUPLICATE TRADE IN PROGRESS')
            return false
        } 
        const trade = await this.tradeRepo.findInProgress(ctx)
        if (trade) {
            this.unitService.addLog(ctx.unit, `Prevented duplicate trade: ${ctx.side} ${ctx.symbol}, found objectId: ${trade._id}`)
            return true
        }
        return false
    }

    private async prepareTradeContext(eventTradeResult: FuturesResult, unit: Unit): Promise<TradeCtx> {
        await this.waitUntilSaveTrade() //workaound to prevent finding trade before save Trade entity
        let trade = await this.tradeRepo.findByTradeEvent(eventTradeResult, unit)
        if (!trade) {
            this.unitService.addError(unit, `Could not find matching trade - on filled order ${eventTradeResult.orderId}, ${eventTradeResult.side}, ${eventTradeResult.symbol}`)
            return
        }
        return new TradeCtx({ unit, trade })
    }

    private async waitUntilSaveTrade() {
        return new Promise(resolve => setTimeout(resolve, 1000))
    }

}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TradeUtil } from './trade-util';
import { FuturesExchangeInfo, FuturesExchangeInfoSymbol, LotSize } from './model/model';
import { BehaviorSubject } from 'rxjs';
import { Cron, CronExpression } from '@nestjs/schedule';
import { findMax, getHeaders, queryParams, roundWithFraction, sign } from 'src/global/util';
import { isBinanceError } from './model/binance.error';
import { TradeCtx } from './model/trade-variant';
import { Decimal } from 'decimal.js'


@Injectable()
export class CalculationsService implements OnModuleInit {
    
    private readonly logger = new Logger(CalculationsService.name)

    constructor(
    ) {}

    private readonly _exchangeInfo$ = new BehaviorSubject<FuturesExchangeInfo | null>(null)
    
    async onModuleInit() {
        await this.loadExchangeInfo()
    }
    
    @Cron(CronExpression.EVERY_HOUR)
    private async loadExchangeInfo() {
        try {
            const request = await fetch(`${TradeUtil.futuresUri}/exchangeInfo`)
            this._exchangeInfo$.next(await request.json())
            this.logger.log(`EXCHANGE INFO INITIALIZED`)
        } catch (error) {
            this.logger.error('EXCHANGE INFO LOADING ERROR')
            this.logger.error(error)
        }
    }

    private get initialized(): boolean {
        return this._exchangeInfo$.value !== null
    }



    public getExchangeInfo(symbol: string): FuturesExchangeInfoSymbol {
        this.checkInitialized()
        const symbolInfo = this._exchangeInfo$.value?.symbols.find(s => s.symbol === symbol)
        if (!symbolInfo) {
            throw new Error(`exchange info not found for symbol ${symbol}`)
        }
        return symbolInfo
    }

    private checkInitialized() {
        if (!this.initialized) {
            throw new Error(`exchange info not initialized!`)
        }
    }

    public async calculateEntryPrice(ctx: TradeCtx): Promise<void> {
        const currentPrice = await this.getCurrentPrice(ctx)
        const entryPrice = this.findEntryPrice(ctx, currentPrice)
        ctx.trade.entryPrice = entryPrice
        ctx.trade.currentPrice = currentPrice
        TradeUtil.addLog(`calculated entry price: ${entryPrice}`, ctx, this.logger)
    }


    public async getCurrentPrice(ctx: TradeCtx): Promise<number> {
        const uri = sign(`${TradeUtil.futuresUri}/ticker/24hr`, queryParams({
            symbol: ctx.trade.variant.symbol,
            timestamp: Date.now()
        }), ctx.unit)

        
        const request = await fetch(uri, {
            headers: getHeaders(ctx.unit)
        })
        const response = await request.json()
        if (isBinanceError(response)) {
            throw new Error(response.msg)
        }
        const result = Number(response?.lastPrice)
        if (isNaN(result)) {
            throw new Error(`Current price error: ${result}`)
        }
        TradeUtil.addLog(`Found current price: ${result}`, ctx, this.logger)
        return result
    }

    private findEntryPrice(ctx: TradeCtx, currentPrice: number): number {
        const variant = ctx.trade.variant
        if (variant.side === 'BUY') {
            if (currentPrice < variant.entryZoneStart) {
                return variant.entryZoneStart
            } else if (currentPrice > variant.entryZoneEnd) {
                TradeUtil.addWarning(`currentPrice ${currentPrice} > signal.entryZoneEnd`, ctx, this.logger)
                return variant.entryZoneEnd
            } else {
                return currentPrice
            }
        } else if (variant.side === 'SELL') {
            if (currentPrice > variant.entryZoneStart) {
                return variant.entryZoneStart
            } else if (currentPrice < variant.entryZoneEnd) {
                TradeUtil.addError(`currentPrice < trade.entryZoneEnd`, ctx, this.logger)
                return variant.entryZoneEnd
            } else {
                return currentPrice
            }
        }
        throw new Error('mode error?')
    }


    public calculateTradeQuantity(ctx: TradeCtx): void {
        const symbol = ctx.trade.variant.symbol
        const symbolInfo = this.getExchangeInfo(symbol)
        var usdtAmount = new Decimal(0)
        if (process.env.TEST_MODE === 'true') {
            usdtAmount = new Decimal(7)
        } else {
            usdtAmount = new Decimal(ctx.unit.usdtPerTransaction)
        }
        if (!usdtAmount || usdtAmount.equals(0)) throw new Error(`usdtAmount not found or 0`)

        const entryPrice = new Decimal(ctx.trade.entryPrice)
        if (!entryPrice) throw new Error(`entryPrice not found or 0`)

        const calculatedQuantity = usdtAmount.times(TradeUtil.getLever(ctx)).div(entryPrice)
        const { minQty, stepSize } = this.getLotSize(symbolInfo)
        const quantityStep = roundWithFraction(calculatedQuantity, stepSize)
        const quantity = quantityStep
        if (quantity.lessThan(minQty)) {
            throw new Error(`quantity ${quantity} < minQty ${minQty}`)
        }
        const minNotional = this.getMinNotional(symbolInfo)
        if (usdtAmount.lessThan(minNotional)) {
            throw new Error(`usdtPerTransaction ${usdtAmount}  < MIN_NOTIONAL ${minNotional}`)
        }
        TradeUtil.addLog(`Calculated quantity: ${quantity}, step: ${stepSize}, minNotional: ${minNotional}`, ctx, this.logger)
        ctx.trade.quantity = quantity.toNumber()
    }
        
    public calculateTakeProfitQuantities(ctx: TradeCtx) {
        const length = ctx.trade.variant.takeProfits.length
        const symbol = ctx.trade.variant.symbol
        // const executedQuantity = ctx.executedQuantity
        const executedQuantity = ctx.origQuantity
        const symbolInfo = this.getExchangeInfo(symbol)
        const minNotional = this.getMinNotional(symbolInfo)
        const { minQty, stepSize } = this.getLotSize(symbolInfo)
        for (let i = 0; i < length; i++) {
            let breakLoop = false
            const tp = ctx.trade.variant.takeProfits[i]
            const minQuantityByNotional = roundWithFraction(minNotional.div(tp.price), stepSize)
            let quantity = roundWithFraction(executedQuantity.times(tp.closePercent).div(100), stepSize)
            quantity = findMax(quantity, minQuantityByNotional, minQty)
            const sum = ctx.takeProfitQuentitesSum.plus(quantity)
            if (sum.equals(executedQuantity)) {
                tp.quantity = quantity.toNumber()
                breakLoop = true
            } else if (sum.greaterThan(executedQuantity)) {
                const correctedQuantity = quantity.minus(sum.minus(executedQuantity)) 
                if (correctedQuantity.lessThan(minQuantityByNotional)) {
                    if (i > 0) {
                        const prevTp = ctx.trade.variant.takeProfits[i-1]
                        prevTp.quantity = new Decimal(prevTp.quantity).plus(correctedQuantity).toNumber()
                        tp.quantity = 0
                    } else throw new Error('quantity calculation error')
                } else {
                    tp.quantity = correctedQuantity.toNumber()
                }
                breakLoop = true
            } else {
                tp.quantity = quantity.toNumber()
            }
            if (breakLoop) break
        }
        const sum = ctx.takeProfitQuentitesSum
        const tpQtiesString = ctx.trade.variant.takeProfits
            .map(tp => tp.quantity)
            .filter(q => !!q)
            .join(', ')
        if (sum.equals(executedQuantity)) {
            TradeUtil.addLog(`Successfully calculated TP quantities: [${tpQtiesString}], sum: ${sum}, executed: ${executedQuantity}`, ctx, this.logger)
        } else throw new Error(`calculated TP quantities: [${tpQtiesString}], sum: ${sum}, executed: ${executedQuantity}`)
    }


    private getMinNotional(symbolInfo: FuturesExchangeInfoSymbol): Decimal { //returns min USDT needed to open trade
        const minNotionalFilter = (symbolInfo?.filters ?? []).find(f => f.filterType === 'MIN_NOTIONAL')
        if (!minNotionalFilter?.notional) {
            throw new Error(`could not find MIN_NOTIONAL for symbol ${symbolInfo.symbol}`)
        }
        const notionalNum = Number(minNotionalFilter.notional)
        if (isNaN(notionalNum)) {
            throw new Error(`notional ${notionalNum} is not a number fot symbol ${symbolInfo.symbol}`)
        }
        return new Decimal(notionalNum)
    }

    private getLotSize(symbolInfo: FuturesExchangeInfoSymbol): LotSize {
        const lotSizeFilter = (symbolInfo?.filters ?? []).find(f => f.filterType === 'LOT_SIZE')
        if (!lotSizeFilter) {
            throw new Error(`could not find LOT_SIZE for symbol ${symbolInfo.symbol}}`)
        }
        const minQty = Number(lotSizeFilter.minQty)
        if (isNaN(minQty)) {
            throw new Error(`LOT_SIZE.minQty isNaN for symbol ${symbolInfo.symbol}}`)
        }
        const stepSize = Number(lotSizeFilter.stepSize)
        if (isNaN(stepSize)) {
            throw new Error(`LOT_SIZE.stepSize isNaN for symbol ${symbolInfo.symbol}}`)
        }
        return { minQty: new Decimal(minQty), stepSize: new Decimal(stepSize) }
    }

    private getTickSize(symbol: string): number {
        const value = this.getExchangeInfo(symbol).filters.find(filter => filter.filterType === 'PRICE_FILTER')?.tickSize
        if (!value) {
            throw new Error(`Could not find tick size for symbol ${symbol}`)
        }
        const tickSize = Number(value)
        if (isNaN(tickSize)) {
            throw new Error(`Tick size isNaN - ${value}`)
        }
        return tickSize
    }
    
}
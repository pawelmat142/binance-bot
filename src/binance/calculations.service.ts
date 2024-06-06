import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TradeUtil } from './trade-util';
import { FuturesExchangeInfo, FuturesExchangeInfoSymbol, LotSize, Ticker24hResponse } from './model/model';
import { BehaviorSubject } from 'rxjs';
import { Cron, CronExpression } from '@nestjs/schedule';
import { findMax, getHeaders, queryParams, roundWithFraction, sign } from 'src/global/util';
import { TakeProfit, TradeCtx } from './model/trade-variant';
import { Decimal } from 'decimal.js'
import { Http } from 'src/global/http/http.service';
import * as fs from 'fs';
import { TradeStatus } from './model/trade';
import { TPUtil } from './take-profit-util';


@Injectable()
export class CalculationsService implements OnModuleInit {
    
    private readonly logger = new Logger(CalculationsService.name)

    constructor(
        private readonly http: Http
    ) {}

    private readonly _exchangeInfo$ = new BehaviorSubject<FuturesExchangeInfo | null>(null)
    
    async onModuleInit() {
        await this.loadExchangeInfo()
    }

    private readonly exchangeInfoFilename = 'exchange-info.json'

    private saveExchangeInfoInFile(info: FuturesExchangeInfo) {
        const json = JSON.stringify(info)
        fs.writeFileSync(this.exchangeInfoFilename, json, 'utf8');
    }

    private loadExchangeInfoFromFile() {
        try {
            const jsonData = fs.readFileSync(this.exchangeInfoFilename, 'utf8')
            const info = JSON.parse(jsonData) as FuturesExchangeInfo
            this._exchangeInfo$.next(info)
            this.logger.log(`EXCHANGE INFO INITIALIZED from file <<`)
        } catch (error) {
            this.logger.error('Could not load exchange info from file')
            const msg = Http.handleErrorMessage(error)
            this.logger.error(msg)
        }
    }
    
    @Cron(CronExpression.EVERY_12_HOURS)
    private async loadExchangeInfo() {
        if (process.env.SKIP_LOAD_EXCHANGE_INFO === 'true') {
            this.logger.warn(`[SKIP] EXCHANGE INFO LOADING`)
            this.loadExchangeInfoFromFile()
            return
        }
        try {
            const info = await this.http.fetch<FuturesExchangeInfo>({ url: `${TradeUtil.futuresUri}/exchangeInfo` })
            // this.saveExchangeInfoInFile(info) <- do it once in test env
            if (info) {
                this._exchangeInfo$.next(info)
                this.logger.log(`EXCHANGE INFO INITIALIZED`)
            } else {
                throw new Error(`Exchange info empty respone`)
            }
        } catch (error) {
            const msg = Http.handleErrorMessage(error)
            this.logger.error(msg)
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

    public fixPricePrecision(price: number, symbol: string): number {
        const info = this.getExchangeInfo(symbol)
        const precision = info.pricePrecision
        if (!precision) {
            this.logger.warn(`Could not find precission for symbol: ${symbol}`)
            return price
        }
        return Number(price.toFixed(precision))
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
        const params = queryParams({
            symbol: ctx.symbol,
            timestamp: Date.now()
        })
        const response = await this.http.fetch<Ticker24hResponse>({
            url: sign(`${TradeUtil.futuresUri}/ticker/24hr`, params, ctx.unit),
            method: 'GET',  
            headers: getHeaders(ctx.unit)
        })
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
        const minNotional = this.getMinNotional(symbolInfo)
        var usdtAmount = new Decimal(0)
        if (process.env.TEST_MODE === 'true') {
            usdtAmount = new Decimal(7)
        } else {
            usdtAmount = new Decimal(ctx.unit.usdtPerTransaction)

            // TODO - also in wizard
            if (usdtAmount.times(ctx.lever).lessThan(minNotional)) {
                if (ctx.unit.allowMinNotional) {
                    usdtAmount = minNotional.div(ctx.lever)
                } else {
                    throw new Error(`USDT per transaction is not enough for this position`)
                }
            }
        }
        if (!usdtAmount || usdtAmount.equals(0)) throw new Error(`usdtAmount not found or 0`)

        const entryPrice = new Decimal(ctx.trade.entryPrice)
        if (!entryPrice) throw new Error(`entryPrice not found or 0`)

        const calculatedQuantity = usdtAmount.times(ctx.lever).div(entryPrice)
        const { minQty, stepSize } = this.getLotSize(symbolInfo)
        const quantityStep = roundWithFraction(calculatedQuantity, stepSize)
        const quantity = quantityStep
        TradeUtil.addLog(`Calculated quantity: ${quantity}, step: ${stepSize}, minNotional: ${minNotional}`, ctx, this.logger)
        if (quantity.lessThan(minQty)) {
            throw new Error(`quantity ${quantity} < minQty ${minQty}`)
        }
        ctx.trade.quantity = quantity.toNumber()
    }
        
    public calculateTakeProfitQuantities(ctx: TradeCtx) {
        const length = ctx.trade.variant.takeProfits.length
        const symbol = ctx.trade.variant.symbol
        const quantityForCalculation = new Decimal(ctx.origQuantity).minus(TPUtil.takeProfitsFilledQuantitySum(ctx.trade))
        const symbolInfo = this.getExchangeInfo(symbol)
        const minNotional = this.getMinNotional(symbolInfo)
        const { minQty, stepSize } = this.getLotSize(symbolInfo)
        for (let i = 0; i < length; i++) {
            let breakLoop = false
            const tp = ctx.trade.variant.takeProfits[i]
            if (tp.reuslt?.status === TradeStatus.FILLED) {
                TradeUtil.addLog(`Skipped calculation for TP with order: ${tp.order}`, ctx, this.logger)
                continue
            }
            const minQuantityByNotional = roundWithFraction(minNotional.div(tp.price), stepSize)
            let quantity = roundWithFraction(ctx.origQuantity.times(tp.closePercent).div(100), stepSize)
            quantity = findMax(quantity, minQuantityByNotional, minQty)
            const sum = TPUtil.takeProfitsFilledQuantitySum(ctx.trade).plus(quantity)
            if (sum.equals(ctx.origQuantity)) {
                tp.quantity = quantity.toNumber()
                breakLoop = true
            } else if (sum.greaterThan(ctx.origQuantity)) {
                const correctedQuantity = quantity.minus(sum.minus(ctx.origQuantity)) 
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
        const sum = TPUtil.takeProfitsFilledQuantitySum(ctx.trade)
        const tpQtiesString = ctx.trade.variant.takeProfits
            .map(tp => tp.quantity)
            .filter(q => !!q)
            .join(', ')
        if (sum.equals(ctx.origQuantity)) {
            TradeUtil.addLog(`Successfully calculated TP quantities: [${tpQtiesString}], sum: ${sum}, origin: ${ctx.origQuantity}`, ctx, this.logger)
        } else {
            throw new Error(`calculated TP quantities: [${tpQtiesString}], sum: ${sum}, origin: ${ctx.origQuantity}`)
        }
    }

    private correctio

    public calculateSingleTakeProfitQuantityIfEmpty = (ctx: TradeCtx) => {
        const notFilledTakeProfits = ctx.trade.variant.takeProfits.filter(tp => tp.reuslt?.status !== TradeStatus.FILLED)
        if (!notFilledTakeProfits.length) {
            TradeUtil.addLog(`Take profits are empty, preparing one...`, ctx, this.logger)

            const tradeOriginQuantity = ctx.origQuantity
            let takeProfitQuantity = tradeOriginQuantity.div(3)
            const tradeQuantityLeft = tradeOriginQuantity.minus(TPUtil.takeProfitsFilledQuantitySum(ctx.trade))
            if (tradeQuantityLeft.lessThan(takeProfitQuantity)) {
                takeProfitQuantity = tradeQuantityLeft
            }
            const symbolInfo = this.getExchangeInfo(ctx.symbol)
            const { minQty, stepSize } = this.getLotSize(symbolInfo)
            let quantity = roundWithFraction(takeProfitQuantity, stepSize)
            quantity = findMax(quantity, minQty)
            
            const newTakeProfit: TakeProfit = {
                order: TPUtil.findNextTakeProfitOrder(ctx.trade),
                price: 0,
                closePercent: 0,
                quantity: quantity.toNumber(),
            }
            TradeUtil.addLog(`Calculated ${newTakeProfit.order}. take profit quantity: ${newTakeProfit.quantity}`, ctx, this.logger)
            ctx.trade.variant.takeProfits.push(newTakeProfit)
        }
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
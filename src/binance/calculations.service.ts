import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TradeUtil } from './trade-util';
import { FuturesExchangeInfo, FuturesExchangeInfoSymbol, LotSize, MarketPriceResponse } from './model/model';
import { BehaviorSubject } from 'rxjs';
import { Cron, CronExpression } from '@nestjs/schedule';
import { findMax, roundWithFraction } from 'src/global/util';
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


    public getMinNotional(symbolInfo: FuturesExchangeInfoSymbol): Decimal { //returns min USDT needed to open trade
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

    public getLotSize(symbolInfo: FuturesExchangeInfoSymbol): LotSize {
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

    public async fetchMarketPrice(symbol: string): Promise<number> {
        const response = await this.http.fetch<MarketPriceResponse>({
            url: `${TradeUtil.futuresUri}/premiumIndex?symbol=${symbol}`
        })
        const result = Number(response?.markPrice)
        if (isNaN(result)) {
            throw new Error(`Market price ${result} is not a number`)
        }
        return result
    }


}
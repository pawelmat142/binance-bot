import Decimal from "decimal.js"
import { FuturesExchangeInfoSymbol, LotSize } from "../model/model"
import { Logger } from "@nestjs/common"

export abstract class CalcUtil {

    public static getMinNotional(symbolInfo: FuturesExchangeInfoSymbol): Decimal { //returns min USDT needed to open trade
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

    public static getLotSize(symbolInfo: FuturesExchangeInfoSymbol): LotSize {
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

    public static getTickSize(symbolInfo: FuturesExchangeInfoSymbol): Decimal {
        const value = symbolInfo.filters.find(filter => filter.filterType === 'PRICE_FILTER')?.tickSize
        if (!value) {
            throw new Error(`Could not find tick size for symbol ${symbolInfo.symbol}`)
        }
        const tickSize = Number(value)
        if (isNaN(tickSize)) {
            throw new Error(`Tick size isNaN - ${value}`)
        }
        return new Decimal(tickSize)
    }

    
    public static fixPricePrecision(price: number, info: FuturesExchangeInfoSymbol): Decimal {
        const precision = info.pricePrecision
        if (!precision) {
            new Logger.warn(`Could not find precission for symbol: ${info.symbol}`)
            return new Decimal(price)
        }
        return new Decimal(price.toFixed(precision))
    }

    public static roundToTickSize(price: Decimal, info: FuturesExchangeInfoSymbol): Decimal {
        const tickSize = CalcUtil.getTickSize(info)
        return price.div(tickSize).ceil().times(tickSize)
    }


}
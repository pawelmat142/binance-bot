import Decimal from "decimal.js"

export interface BinancePrice {
    symbol: string
    price: number
}


export abstract class TradeType {
    public static readonly MARKET = 'MARKET' // market order is an order to buy or sell at the best available price
    public static readonly LIMIT = 'LIMIT' //A limit order is an order to buy or sell at a specific price or better
    public static readonly STOP_MARKET = 'STOP_MARKET' //A stop market order will become a market order to buy or sell once the stop price is reached.
    public static readonly TAKE_PROFIT_MARKET = 'TAKE_PROFIT_MARKET' //A take profit market order will become a market order to buy or sell once the take profit price is reached
}

export abstract class TradeSide {
    public static readonly BUY = 'BUY'
    public static readonly SELL = 'SELL'
}

export abstract class TradeStatus {
    public static readonly FILLED = 'FILLED'
    public static readonly NEW = 'NEW'
}


// exchange info
export interface FuturesExchangeInfo {
    rateLimits: any[]
    serverTime: number
    assets: any[]
    symbols: FuturesExchangeInfoSymbol[]
}

export interface FuturesExchangeInfoSymbol {
    symbol: string
    pair: string
    contractType: string
    deliveryDate: number
    onboardDate: number
    status: string
    baseAsset: string
    quoteAsset: string
    marginAsset: string
    pricePrecision: number
    quantityPrecision: number
    baseAssetPrecision: number
    quotePrecision: number
    underlyingType: string
    underlyingSubType: string[]
    settlePlan: number
    triggerProtect: string
    filters: BinanceExchangeInfoFilter[]
}

export interface BinanceExchangeInfoFilter {
    filterType: string
    minQty?: string
    maxQty?: string
    stepSize?: string
    limit?: number
    notional?: string 
    tickSize?: string 
}

export interface LotSize {
    minQty: Decimal
    stepSize: Decimal
}
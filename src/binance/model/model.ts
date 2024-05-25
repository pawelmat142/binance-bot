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

export interface Ticker24hResponse {
    symbol: string;
    priceChange: string;
    priceChangePercent: string;
    weightedAvgPrice: string;
    lastPrice: string;
    lastQty: string;
    openPrice: string;
    highPrice: string;
    lowPrice: string;
    volume: string;
    quoteVolume: string;
    openTime: number;
    closeTime: number;
    firstId: number;
    lastId: number;
    count: number;
}

export interface TradeEventData {
    unitIdentifier?: string

    e: string; // Event type
    T: number; // Trade time
    E: number; // Event time
    o: {
        s: string; // Symbol
        c: string; // Client order ID
        S: string; // Side (BUY/SELL)
        o: string; // Order type (LIMIT, MARKET, etc.)
        f: string; // Time in force
        q: string; // Quantity
        p: string; // Price
        ap: string; // Average price
        sp: string; // Stop price
        x: string; // Execution type
        X: string; // Order status
        i: number; // Order ID
        l: string; // Order last executed quantity
        z: string; // Order filled quantity
        L: string; // Last filled price
        n: string; // Commission asset
        N: string; // Commission asset
        T: number; // Order trade time
        t: number; // Trade ID
        b: string; // Bids notional value
        a: string; // Asks notional value
        m: boolean; // Is the buyer the market maker?
        R: boolean; // Reduce only
        wt: string; // Working type
        ot: string; // Original order type
        ps: string; // Position side
        cp: boolean; // Close position
        rp: string; // Realized profit
        pP: boolean; // Is maker buyer
        si: number; // Stop price working type
        ss: number; // Stop price trigger condition
        V: string; // Order type
        pm: string; // Time in force
        gtd: number; // Good till date
    };
}

export interface ListeKeyResponse {
    listenKey: string
}
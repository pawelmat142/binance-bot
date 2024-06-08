import Decimal from "decimal.js"
import { VariantSide } from "../utils/variant-util"
import { TradeType } from "./trade"

export interface BinancePrice {
    symbol: string
    price: number
}

export interface PlaceOrderParams {
    type: TradeType
    timeInForce?: string
    symbol: string
    side: VariantSide
    price: string
    quantity: string
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
        i: BigInt; // Order ID - ZAMIENIAM TYP number na string przez buga z parsowaniem BigInt! https://github.com/jaggedsoft/node-binance-api/issues/539
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

export interface MarketPriceResponse {
    symbol: string;
    markPrice: string;
    indexPrice: string;
    estimatedSettlePrice: string;
    lastFundingRate: string;
    interestRate: string;
    nextFundingTime: number;
    time: number;
}
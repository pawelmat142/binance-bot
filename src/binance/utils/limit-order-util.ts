import Decimal from "decimal.js";
import { LimitOrder, TradeCtx, TradeVariant } from "../model/trade-variant";
import { FuturesResult, TradeStatus, TradeType } from "../model/trade";
import { PlaceOrderParams } from "../model/model";
import { BinanceError, BinanceResultOrError, isBinanceError } from "../model/binance.error";
import { TradeUtil } from "./trade-util";
import { Logger } from "@nestjs/common";
import { ClientOrderId, ClientOrderIdUtil } from "./client-order-id-util";

export abstract class LimitOrderUtil {

    public static readonly DEFAULT_ORDERS_NUMBER = 2

    public static limitOrdersCalculated(variant: TradeVariant): boolean {
        return !!variant.limitOrders?.length && variant.limitOrders?.every(lo => !!lo.price)
    }

    public static limitOrdersQuantityCalculated(variant: TradeVariant): boolean {
        return this.limitOrdersCalculated(variant) && variant.limitOrders.every(lo => !!lo.quantity)
    }

    public static orderIds(ctx: TradeCtx): string[] {
        return (ctx.trade.variant.limitOrders || []).filter(lo => !!lo.result).map(lo => lo.result.orderId)
    }


    public static updateFilledLimitOrder(ctx: TradeCtx, eventTradeResult: FuturesResult): LimitOrder {
        for (let lo of ctx.trade.variant.limitOrders) {
            if (lo.result?.clientOrderId === eventTradeResult.clientOrderId) {
                lo.result = eventTradeResult
                return lo
            }
        }
        throw new Error(`Not found Limit Order ${eventTradeResult.clientOrderId}`)

    }

    public static filterOpened(variant: TradeVariant): LimitOrder[] {
        return (variant.limitOrders || [])
            .filter(lo => lo.result?.status === TradeStatus.NEW)
    }

    public static filterFilled(variant: TradeVariant): LimitOrder[] {
        return (variant.limitOrders || [])
            .filter(lo => lo.result?.status === TradeStatus.FILLED)
    }


    public static limitOrderQuantitiesSum(variant: TradeVariant): Decimal {
        return variant.limitOrders
            .map(lo => new Decimal(lo.quantity || 0))
            .reduce((sum, qty) => sum.plus(qty), new Decimal(0))
        }
        
    public static limitOrderQuantitiesFilledSum(variant: TradeVariant): Decimal {
        return this.filterFilled(variant)
            .map(lo => new Decimal(lo.result?.origQty || 0))
            .reduce((sum, qty) => sum.plus(qty), new Decimal(0))
    }
        
    public static limitOrderQuantitiesOrderedSum(variant: TradeVariant): Decimal {
        return this.filterOpened(variant)
            .map(lo => new Decimal(lo.result?.origQty || 0))
            .reduce((sum, qty) => sum.plus(qty), new Decimal(0))
    }


    public static areFilled(variant: TradeVariant) {
        return !!variant.limitOrders?.length && variant.limitOrders?.every(lo => lo.result?.status === TradeStatus.FILLED)
    }

    public static quantitiesString(variant: TradeVariant): string {
        return `[ ${variant.limitOrders.map(lo => lo.quantity).join(', ')} ]`
    }


    public static prepareOrderParams(ctx: TradeCtx): PlaceOrderParams[] {
        const symbol = ctx.trade.variant.symbol
        return ctx.trade.variant.limitOrders.map(lo => {
            const clientOrderId = ClientOrderIdUtil.generate(`${ClientOrderId.LIMIT_ORDER}${lo.order+1}`, ctx.unit, symbol)
            return {
                symbol: symbol,
                side: ctx.trade.variant.side,
                type: TradeType.LIMIT,
                quantity: lo.quantity.toString(),
                price: lo.price.toString(),
                timeInForce: "GTC",
                newClientOrderId: clientOrderId
            }
        })
    }


    public static parseOrderResults(ctx: TradeCtx, results: BinanceResultOrError[]) {
        const logger = new Logger('parseOrderResults')
        
        const errors: BinanceError[] = []
        const limitOrders = ctx.trade.variant.limitOrders
        
        for (let result of results) {
            if (isBinanceError(result)) {
                errors.push(result)
            } else {
                const resultPrice = Number(result.price)
                if (isNaN(resultPrice)) { 
                    throw new Error(`Limit Order result price is not a number`)
                }
                const limitOrder = limitOrders.find(lo => lo.price === resultPrice)
                if (!limitOrder) {
                    throw new Error(`Limit Order result parse error`)
                }
                limitOrder.result = result
            }
        }
        TradeUtil.addLog(`Opened ${this.filterOpened(ctx.trade.variant).length} Limit Orders succefully, ${errors.length} errors`, ctx, logger)
        errors.forEach(e => {
            TradeUtil.addError(e.msg, ctx, logger)
            const limitOrder = limitOrders.find(lo => !lo.result)
            limitOrder.error = e
        })
    }

    
}
import Decimal from "decimal.js";
import { TradeVariant } from "../model/trade-variant";
import { TradeStatus } from "../model/trade";

export abstract class LimitOrderUtil {

    public static readonly DEFAULT_ORDERS_NUMBER = 2

    public static limitOrdersCalculated(variant: TradeVariant): boolean {
        return !!variant.limitOrders?.length && variant.limitOrders?.every(lo => !!lo.price)
    }

    public static limitOrdersQuantityCalculated(variant: TradeVariant): boolean {
        return this.limitOrdersCalculated(variant) && variant.limitOrders.every(lo => !!lo.quantity)
    }


    public static limitOrderQuantitiesSum(variant: TradeVariant): Decimal {
        return variant.limitOrders
            .map(lo => new Decimal(lo.quantity || 0))
            .reduce((sum, qty) => sum.plus(qty), new Decimal(0))
        }
        
    public static limitOrderQuantitiesFilledSum(variant: TradeVariant): Decimal {
        return variant.limitOrders
            .filter(lo => lo.result?.status === TradeStatus.FILLED)
            .map(lo => new Decimal(lo.result?.origQty || 0))
            .reduce((sum, qty) => sum.plus(qty), new Decimal(0))
    }
        
    public static limitOrderQuantitiesOrderedSum(variant: TradeVariant): Decimal {
        return variant.limitOrders
            .filter(lo => lo.result?.status === TradeStatus.NEW)
            .map(lo => new Decimal(lo.result?.origQty || 0))
            .reduce((sum, qty) => sum.plus(qty), new Decimal(0))
    }

    public static quantitiesString(variant: TradeVariant): string {
        return `[ ${variant.limitOrders.map(lo => lo.quantity).join(', ')} ]`
    }

    
}
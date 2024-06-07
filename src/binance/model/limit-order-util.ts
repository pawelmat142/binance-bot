import { TradeVariant } from "./trade-variant";

export abstract class LimitOrderUtil {

    public static limitOrdersCalculated(variant: TradeVariant): boolean {
        return !!variant.limitOrders?.length && variant.limitOrders?.every(lo => !!lo.price)
    }

    public static limitOrdersQuantityCalculated(variant: TradeVariant): boolean {
        return this.limitOrdersCalculated(variant) && variant.limitOrders.every(lo => !!lo.quantity)
    }

    
}
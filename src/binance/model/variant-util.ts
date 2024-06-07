import Decimal from "decimal.js"
import { TradeUtil } from "../trade-util"
import { TradeVariant } from "./trade-variant"

export type VariantMode = 'SHORT' | 'LONG'

export type VariantSide = 'SELL' | 'BUY'

export abstract class VariantUtil {

    public static readonly DEFAULT_LEVER = 5

    public static label(variant: TradeVariant): string {
        return `${this.mode(variant.side)} ${variant.symbol} ${this.lever(variant)}x`
    }

    public static mode = (side: string): VariantMode => {
        if (side === 'BUY') {
            return 'LONG'
        }
        return 'SHORT'
    }

    public static lever(variant: TradeVariant): number {
        return variant.leverMax ?? this.DEFAULT_LEVER
    }

    public static getLever(variant: TradeVariant): Decimal {
        return new Decimal(variant?.leverMax ?? this.DEFAULT_LEVER)
    }

    public static opositeSide = (side: VariantSide): VariantSide => {
        if (side === 'BUY') {
            return 'SELL'
        }
        return 'BUY'
    }
}
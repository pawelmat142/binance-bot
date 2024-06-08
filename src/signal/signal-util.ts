import { Logger } from "@nestjs/common"
import { Signal } from "./signal"
import { toDateString } from "src/global/util"
import { VariantUtil } from "src/binance/utils/variant-util"
import { TradeVariant } from "src/binance/model/trade-variant"
import { LimitOrderUtil } from "src/binance/utils/limit-order-util"

export abstract class SignalUtil {

    // public readonly valueDolarRegex = /([\d\s]+([.,]\d+)?\s*\$)/g

    public static readonly valueDolarRegex = /([\d\s]+([.,]\d+)?\s*\$)/g
    // public static readonly dolarValueDolarRegex = /\s*\$\s*\d+\s*|\s*\d+\s*\$\s*/g;
    public static readonly dolarValueDolarRegex = /\s*\$\s*\d+([.,]\d+)?\s*|\s*\d+([.,]\d+)?\s*\$\s*/g

    public static readonly stopLossRegex = /\bstop\s*loss\b/i

    public static readonly dolarValueSpaceRegex = /\$ ?\d+[.,]?\d*|\d+[.,]?\d* ?\$/g //  [ 0,014033$ 0.014033$ 0,014033 $  0.014033 $  $0.014033  $ 0,014033 ] 


    public static mayBeOpened(signal: Signal): boolean {
        return signal.valid && this.entryCalculated(signal)
    }

    public static entryCalculated(signal: Signal): boolean {
        return signal.variant.entryByMarket || LimitOrderUtil.limitOrdersCalculated(signal.variant)
    }

    public static entryByLimitOrders(signal: Signal): boolean {
        if (LimitOrderUtil.limitOrdersCalculated(signal.variant)) {
            if (!signal.variant.entryByMarket) {
                return true
            }
            throw new Error(`Cannot entry by market and limit orders once`)
        }
    }

    public static addLog(msg: string, signal: Signal, logger: Logger) {
        const log = this.prepareLog(msg, signal)
        this.addToSignalLogs(log, signal)
        logger.log(log)
    }
    
    public static addError(msg: string, signal: Signal, logger: Logger) {
        const log = `[ERROR] ${this.prepareLog(msg, signal)}`
        this.addToSignalLogs(log, signal)
        logger.error(log)
    }

    public static addWarning(msg: string, signal: Signal, logger: Logger) {
        const log = `[WARN] ${this.prepareLog(msg, signal)}`
        this.addToSignalLogs(log, signal)
        logger.warn(log)
    }


    private static prepareLog(msg: string, signal: Signal): string {
        return signal.variant ? `${VariantUtil.label(signal.variant)} - ${msg}` : msg
    }

    private static addToSignalLogs(log: string, signal: Signal) {
        log = `[${toDateString(new Date())}] ${log}`
        signal.logs = signal.logs || []
        signal.logs.push(log)
    }

    public static anyOtherAction(signal: Signal): boolean {
        return Object.entries(signal?.otherSignalAction || {}).some(e => !!e[1])
    }

    public static withoutDollar(input: string): number {
        return Number(input?.trim().replace(',', '.').replace(' ', '').replace(/\$/g, ''))
    }

    public static limitOrderPricesString(variant: TradeVariant): string {
        return `[ ${variant.limitOrders.map(lo => lo.price).map(p => `${p}`).join(', ')} ]`
    }

}
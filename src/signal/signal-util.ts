import { Logger } from "@nestjs/common"
import { Signal } from "./signal"
import { toDateString } from "src/global/util"
import { TakeProfit } from "src/binance/model/trade-variant"

export abstract class SignalUtil {

    // public readonly valueDolarRegex = /([\d\s]+([.,]\d+)?\s*\$)/g

    public static readonly valueDolarRegex = /([\d\s]+([.,]\d+)?\s*\$)/g
    public static readonly stopLossRegex = /\bstop\s*loss\b/i


    public static addLog(msg: string, signal: Signal, logger: Logger) {
        const log = `[${toDateString(new Date())}] ${msg}`
        signal.logs.push(log)
        logger.log(msg)
    } 

    public static addError(msg: string, signal: Signal, logger: Logger) {
        const log = `[${toDateString(new Date())}] [ERROR] ${msg}`
        signal.logs.push(log)
        logger.error(msg)
    }

    public static addWarning(msg: string, signal: Signal, logger: Logger) {
        const log = `[${toDateString(new Date())}] [WARN] ${msg}`
        signal.logs.push(log)
        logger.error(msg)
    }

    public static takeProfitsPercentageSum(takeProfits: TakeProfit[]) {
        return takeProfits.reduce((sum, tp) => {
            return sum + tp.closePercent
        }, 0)
    }

    public static anyAction(signal: Signal): boolean {
        return Object.entries(signal?.otherSignalAction || {}).some(e => !!e[1])
    }

    public static withoutDollar(input: string): number {
        return Number(input?.trim().replace(' ', '').replace(/\$/g, ''))
    }

}
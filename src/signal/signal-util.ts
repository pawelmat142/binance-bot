import { Logger } from "@nestjs/common"
import { Signal } from "./signal"
import { toDateString } from "src/global/util"
import { TakeProfit } from "src/binance/model/trade-variant"

export abstract class SignalUtil {

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

    public static takeProfitsPercentageSum(takeProfits: TakeProfit[]) {
        return takeProfits.reduce((sum, tp) => {
            return sum + tp.closePercent
        }, 0)
    }

    public static anyAction(signal: Signal): boolean {
        return Object.entries(signal?.otherSignalAction || {}).some(e => !!e[1])
    }
}
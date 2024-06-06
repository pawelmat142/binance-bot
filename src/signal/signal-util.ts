import { Logger } from "@nestjs/common"
import { Signal } from "./signal"
import { toDateString } from "src/global/util"
import { VariantUtil } from "src/binance/model/variant-util"

export abstract class SignalUtil {

    // public readonly valueDolarRegex = /([\d\s]+([.,]\d+)?\s*\$)/g

    public static readonly valueDolarRegex = /([\d\s]+([.,]\d+)?\s*\$)/g
    // public static readonly dolarValueDolarRegex = /\s*\$\s*\d+\s*|\s*\d+\s*\$\s*/g;
    public static readonly dolarValueDolarRegex = /\s*\$\s*\d+([.,]\d+)?\s*|\s*\d+([.,]\d+)?\s*\$\s*/g

    public static readonly stopLossRegex = /\bstop\s*loss\b/i

    public static readonly dolarValueSpaceRegex = /\$ ?\d+[.,]?\d*|\d+[.,]?\d* ?\$/g //  [ 0,014033$ 0.014033$ 0,014033 $  0.014033 $  $0.014033  $ 0,014033 ] 


    public static addLog(msg: string, signal: Signal, logger: Logger) {
        const log = this.prepareLog(msg, signal)
        this.addToSignalLogs(log, signal)
        logger.log(msg)
    }
    
    public static addError(msg: string, signal: Signal, logger: Logger) {
        const log = `[ERROR] ${this.prepareLog(msg, signal)}`
        this.addToSignalLogs(log, signal)
        logger.error(msg)
    }

    public static addWarning(msg: string, signal: Signal, logger: Logger) {
        const log = `[WARN] ${this.prepareLog(msg, signal)}`
        this.addToSignalLogs(log, signal)
        logger.warn(msg)
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

}
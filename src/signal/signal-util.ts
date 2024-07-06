import { Logger } from "@nestjs/common"
import { Signal } from "./signal"
import { TradeVariant } from "../binance/model/trade-variant"
import { LimitOrderUtil } from "../binance/utils/limit-order-util"
import { VariantUtil } from "../binance/utils/variant-util"
import { toDateString } from "../global/util"
import { SignalValidator } from "./signal-validators/signal-validator"
import { CryptoHunterSignalValidator } from "./signal-validators/crypto-hunter/crypto-hunter-signal-validator"
import { GalaxySignalValidator } from "./signal-validators/galaxy/galaxy-signal-validator"
import { GalaxyOtherActionValidator } from "./signal-validators/galaxy/galaxy-other-action-validator"

export abstract class SignalUtil {

    // public readonly valueDolarRegex = /([\d\s]+([.,]\d+)?\s*\$)/g

    public static readonly valueDolarRegex = /([\d\s]+([.,]\d+)?\s*\$)/g
    // public static readonly dolarValueDolarRegex = /\s*\$\s*\d+\s*|\s*\d+\s*\$\s*/g;
    public static readonly dolarValueDolarRegex = /\s*\$\s*\d+([.,]\d+)?\s*|\s*\d+([.,]\d+)?\s*\$\s*/g

    public static readonly stopLossRegex = /\bstop\s*loss\b/i

    public static readonly dolarValueSpaceRegex = /\$ ?\d+[.,]?\d*|\d+[.,]?\d* ?\$/g //  [ 0,014033$ 0.014033$ 0,014033 $  0.014033 $  $0.014033  $ 0,014033 ] 

    public static validateSignal(signal: Signal): void {
        const validator: SignalValidator = SignalUtil.selectValidatorBySource(signal)
        validator.validate()
    }

    public static additionalValidationIfNeeded(signal: Signal): void {
        const validator: SignalValidator = this.selectAdditionValidatorIfNeeded(signal)
        if (validator) {
            validator.validate()
        }
    } 

    private static selectValidatorBySource(signal: Signal): SignalValidator {
        switch (signal.variant.signalSource) {
            case "CRYPTO_HUNTER":
                return new CryptoHunterSignalValidator(signal)
            case "GALAXY":
                return new GalaxySignalValidator(signal)
            case "ADMIN":
                return this.selectValidatorForAdminSource(signal)

            default: throw new Error(`Unknown signal source: ${signal?.variant?.signalSource}`)
        }
    }


    private static selectAdditionValidatorIfNeeded(signal: Signal): SignalValidator {
        switch (signal.variant.signalSource) {
            case "GALAXY": return new GalaxyOtherActionValidator(signal)
            default: return null
        }
    }
    
    private static selectValidatorForAdminSource(signal: Signal): SignalValidator {
        // TODO chosing validator by admin source signal by wizard
        return new CryptoHunterSignalValidator(signal)
        // return new GalaxySignalValidator(signal)
    }

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
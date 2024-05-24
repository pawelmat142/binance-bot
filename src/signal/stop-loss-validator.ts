import { BaseValidator } from "./base-validator";
import { Signal } from "./signal";
import { SignalUtil } from "./signal-util";

export class StopLossValidator extends BaseValidator {

    constructor(signal: Signal) {
        super(signal)
    }

    private stopLossLineIndex = -1

    static start(signal: Signal): boolean {
        const val = new StopLossValidator(signal)
        val.validate()
        return val.triggered
    }

    public get triggered(): boolean {
        return this.stopLossLineIndex !== -1
    }

    validate(): void {
        if (!this.signal.variant.side || !this.signal.variant.symbol) {
            return
        }
        if (this.signal.variant.stopLoss) {
            this.addLog(`[SKIP] StopLossValidator`)
            return
        }
        this.addLog(`[START] StopLossValidator`)

        for (let lineIndex = 0; lineIndex < this.lines.length; lineIndex++) {

            const line = this.lines[lineIndex]
            if (!line) continue
            const isStopLoss = SignalUtil.stopLossRegex.test(line)
            if (isStopLoss) {
                this.stopLossLineIndex = lineIndex
                this.findStopLoss()
                this.signal.otherSignalAction = this.signal.otherSignalAction || {}
                this.signal.otherSignalAction.stopLossFound = this.validateStopLoss()
                if (!this.signal.otherSignalAction.stopLossFound) {
                    throw new Error(`Stop loss value error`)
                }
                break
            }
        }

        this.addLog(`[STOP] StopLossValidator`)
    }

    private findStopLoss() {
        for (let i = this.stopLossLineIndex; i<=this.stopLossLineIndex+2; i++) {
            const line = this.lines[i]
            if (!line) return
            let stopLossArr = line.match(SignalUtil.valueDolarRegex)
            if (Array.isArray(stopLossArr)) {
                const stopLossStringValue = stopLossArr[0]
                if (stopLossStringValue) {
                    const stopLossValue = SignalUtil.withoutDollar(stopLossStringValue)
                    if (!isNaN(stopLossValue)) {
                        this.signal.variant.stopLoss = stopLossValue
                        this.addLog(`Found stop loss ${this.signal.variant.stopLoss}`)
                    }
                }
            }
        }
    }

    private validateStopLoss(): boolean {
        if (this.signal.variant.side === `BUY`) {
            if (this.signal.variant.entryZoneStart < this.signal.variant.stopLoss) {
                this.addError(`${this.signal.variant.entryZoneStart} entryZoneStart < stopLoss ${this.signal.variant.stopLoss}`)
                return false
            }
        } else {
            if (this.signal.variant.entryZoneStart > this.signal.variant.stopLoss) {
                this.addError(`${this.signal.variant.entryZoneStart} entryZoneStart > stopLoss ${this.signal.variant.stopLoss}`)
                return false
            }
        }
        return true
    }
}
import { Signal } from "../../signal";
import { SignalUtil } from "../../signal-util";
import { BaseSignalValidator as BaseSignalValidator } from "../base-signal-validator";
import { GalaxyTakeProfitsValidator } from "./galaxy-take-profits.validator";
import { GalaxyStopLossValidator } from "./galaxy-stop-loss-validator";

export class GalaxyOtherActionValidator extends BaseSignalValidator {

    constructor(signal: Signal) {
        super(signal)
    }

    override validate() {
        if (this.signal.valid) {
            this.addLog(`[SKIP] SignalOtherActionValidator, signal is valid`)
            return
        }
        this.addLog(`[START] SignalOtherActionValidator`)
        const variant = this.signal.variant
        if (variant.symbol && variant.side) {
            
            const isTakeProfitSignal = GalaxyTakeProfitsValidator.start(this.signal)
            const isStopLossSignal = GalaxyStopLossValidator.start(this.signal)

            if (!isTakeProfitSignal && !isStopLossSignal) {
                this.otherActionsValidation()
            }
            
        }
        this.addLog(`[STOP] SignalOtherActionValidator`)
    }

    private otherActionsValidation() {
        this.signal.otherSignalAction = this.signal.otherSignalAction || {}
        this.signal.otherSignalAction.takeSomgeProfit = this.isTakeSomeProfit(),
        this.signal.otherSignalAction.manualClose = this.isManualClose(),
        this.signal.otherSignalAction.tradeDone = this.isTradeDone()
        this.isMoveStopLoss()
    }

    private isTakeSomeProfit(): boolean {
        const result = this.signal.content.includes('take some profit')
        if (result) {
            SignalUtil.addLog(`TAKE SOME PROFIT signal`, this.signal, this.logger)
        }
        return result
    }

    private isTradeDone(): boolean {
        for (let line of this.lines) {
            if (line.includes('trade')) {
                if (line.includes('done')) {
                    return true
                }
            }
        }
        return false
    }

    private isManualClose(): boolean {
        for (let line of this.lines) {
            const isClose = line.includes('close')
            if (isClose) {
                const isManual = line.includes('manual')
                const isTrade = line.includes('trade')
                return isManual || isTrade
            }
        }
        return false
    }

    private isMoveStopLoss() {
        for (let line of this.lines) {
            if (!line) continue

            if (line.includes('move')) {
                if (line.includes('sl') || line.includes('stop los') || line.includes('stoplos')) {

                    this.signal.otherSignalAction.moveSl = true
                    
                    if (line.includes('entry')) {
                        this.signal.otherSignalAction.moveSlToEntryPoint = true
                        SignalUtil.addLog(`MOVE STOP LOSS to ENTRY POINT signal`, this.signal, this.logger)
                    } else {
                        SignalUtil.addLog(`MOVE STOP LOSS signal`, this.signal, this.logger)
                    }
                    return
                }
            }
        }
    }


}
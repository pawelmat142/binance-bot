import { Logger } from "@nestjs/common";
import { OtherSignalAction, Signal } from "./signal";
import { SignalUtil } from "./signal-util";

export class SignalOtherActionValidator {

    private readonly logger = new Logger(SignalOtherActionValidator.name)

    signal: Signal
    message: string
    lines: string[]

    constructor(signal: Signal) {
        this.signal = signal
        this.message = this.signal.content.toLowerCase()
    }

    validate() {
        if (!this.signal.valid) {
            const variant = this.signal.tradeVariant
            if (variant.symbol && variant.side) {
                this.prepareLines()
                this.signal.otherSignalAction = {
                    takeSomgeProfit: this.isTakeSomeProfit(),
                    manualClose: this.isManualClose(),
                    tradeDone: this.isTradeDone()
                } as OtherSignalAction
                this.isMoveStopLoss()
            }
        }
    }

    private prepareLines() {
        this.lines = this.message?.split(/\r?\n/) ?? []
    }

    private isTakeSomeProfit(): boolean {
        const result = this.message.includes('take some profit')
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

            if (line.includes('move')) {
                if (line.includes('sl') || line.includes('stop loss')) {

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
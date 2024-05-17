import { Logger } from "@nestjs/common";
import { Signal } from "./signal";
import { SignalUtil } from "./signal-util";

export class BaseValidator {

    protected logger = new Logger(BaseValidator.name)

    signal: Signal
    message: string

    protected get lines(): string[] {
        return this.signal.lines
    }

    private prepareLines() {
        if (!this.lines?.length){
            this.signal.lines = this.message?.split(/\r?\n/) ?? []
        }
    }

    constructor(signal: Signal) {
        this.signal = signal
        this.message = signal.content
        this.prepareLines()
    }

    validate() {
        throw new Error(`Not implemented`)
    }

    protected addLog(log: string) {
        SignalUtil.addLog(log, this.signal, this.logger)
    }

    protected addError(log: string) {
        SignalUtil.addError(log, this.signal, this.logger)
    }

    protected addWarning(log: string) {
        SignalUtil.addWarning(log, this.signal, this.logger)
    }


}
import { Logger } from "@nestjs/common";
import { Signal } from "../signal";
import { SignalUtil } from "../signal-util";
import { SignalValidator } from "./signal-validator";
import { TradeVariant } from "../../binance/model/trade-variant";

export class BaseSignalValidator implements SignalValidator {

    protected logger = new Logger(this.constructor.name)

    protected signal: Signal

    protected variant: Partial<TradeVariant>

    constructor(signal: Signal) {
        this.signal = signal
        this.variant = this.signal.variant
        this.prepareLines()
    }

    protected get lines(): string[] {
        return this.signal.lines
    }

    validate(): void {
        throw new Error('not implemented!')
    }
    
    valid(): boolean {
        throw new Error('not implemented!')
    }
    
    private prepareLines() {
        if (!this.lines?.length){
            this.signal.lines = (this.signal.content?.split(/\r?\n/) ?? []).map(line => line.toLowerCase())
        }
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
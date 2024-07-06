import { BaseSignalValidator } from "../base-signal-validator";
import { SignalValidator } from "../signal-validator";

export class CryptoHunterSignalValidator extends BaseSignalValidator implements SignalValidator {

    override valid(): boolean {
        return false 
    }

    override validate(): void {
        this.addLog(`[START] ${this.constructor.name}`)
        this.addLog(`[STOP] ${this.constructor.name}`)
    }
}
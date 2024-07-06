import { Injectable } from "@nestjs/common";
import { UnitService } from "../unit/unit.service";
import { Signal } from "./signal";
import { SignalValidator } from "./signal-validators/signal-validator";
import { CryptoHunterSignalValidator } from "./signal-validators/crypto-hunter/crypto-hunter-signal-validator";
import { GalaxySignalValidator } from "./signal-validators/galaxy/galaxy-signal-validator";
import { GalaxyOtherActionValidator } from "./signal-validators/galaxy/galaxy-other-action-validator";
import { SignalSource } from "../binance/utils/variant-util";

@Injectable()
export class SignalValidationService {

    constructor(
        private readonly unitService: UnitService
    ) {}

    public validateSignal(signal: Signal): void {
        const validator: SignalValidator = this.selectValidatorBySource(signal, signal.variant.signalSource)
        validator.validate()
    }

    public additionalValidationIfNeeded(signal: Signal): void {
        const validator: SignalValidator = this.selectAdditionValidatorIfNeeded(signal)
        if (validator) {
            validator.validate()
        }
    } 

    private selectValidatorBySource(signal: Signal, signalSource: SignalSource): SignalValidator {
        switch (signalSource) {
            case "CRYPTO_HUNTER":
                return new CryptoHunterSignalValidator(signal)
            case "GALAXY":
                return new GalaxySignalValidator(signal)
            case "ADMIN":
                return this.selectValidatorForAdminSource(signal)

            default: throw new Error(`Unknown signal source: ${signalSource}`)
        }
    }


    private selectAdditionValidatorIfNeeded(signal: Signal): SignalValidator {
        switch (signal.variant.signalSource) {
            case "GALAXY": return new GalaxyOtherActionValidator(signal)
            default: return null
        }
    }
    
    private selectValidatorForAdminSource(signal: Signal): SignalValidator {
        const unit = this.unitService.units.find(u => u.telegramChannelId === signal.telegramChannelId)
        if (!unit) {
            throw new Error('Not found unit when trying resolve admin signal source')
        }

        const adminSignalSource = unit.adminSignalSource
        if (!adminSignalSource) {
            throw new Error(`Not found adminSignalSource for unit ${unit.identifier}`)
        }

        return this.selectValidatorBySource(signal, adminSignalSource)
    }
}
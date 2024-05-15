import { Unit } from "src/unit/unit";
import { ServiceProvider } from "../services.provider";
import { Wizard, WizardStep } from "./wizard";

export class UnitWizard extends Wizard {

    protected unit: Unit

    constructor(unit: Unit, services: ServiceProvider) {
        super(Number(unit.telegramChannelId), services)
        this.unit = unit
    }

    public getSteps(): WizardStep[] {
        throw new Error("not implemented")
    }

    public getUnit(): Unit {
        return this.unit
    }


}
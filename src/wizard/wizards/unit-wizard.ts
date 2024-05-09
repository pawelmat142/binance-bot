import { Unit } from "src/unit/unit";
import { ServicesService } from "../services.service";
import { Wizard, WizardStep } from "./wizard";

export class UnitWizard extends Wizard {

    protected unit: Unit

    constructor(unit: Unit, services: ServicesService) {
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
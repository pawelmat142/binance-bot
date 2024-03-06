import { Unit } from "src/unit/unit"
import { ServicesService } from "../services.service"
import { WizardStep } from "../wizard"
import { UnitWizard } from "./unit-wizard"

export class TradesWizard extends UnitWizard {

    constructor(unit: Unit, services: ServicesService) {
        super(unit, services)
    }

    protected _init = async () => {}

    public getSteps(): WizardStep[] {
        return [{
            order: 0,
            message: [
                `trades test`,
            ],
            process: async (input: string) => {
                return 0
            }
        }]
    }
}
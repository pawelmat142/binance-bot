import { Unit } from "src/unit/unit"
import { ServicesService } from "../services.service"
import { Wizard, WizardStep } from "../wizard"
import { UnitWizard } from "./unit-wizard"

export class LogsWizard extends UnitWizard {

    private logs: string[]

    constructor(unit: Unit, services: ServicesService) {
        super(unit, services)
    }

    public getSteps(): WizardStep[] {
        return [{
            order: 0,
            message: [
                `test`,
            ],
            process: async (input: string) => {
                return 0
            }
        }, {
            order: 1,
            message: ['test2'],
            close: true
        }]
    }
}
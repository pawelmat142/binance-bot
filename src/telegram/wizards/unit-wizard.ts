import { UnitService } from "src/unit/unit.service";
import { BotWizard, WizardAnswer, WizardStep } from "./bot-wizard";
import { Unit } from "src/unit/unit";

export class UnitWizard extends BotWizard {

    private readonly unitService: UnitService

    private readonly unit: Unit

    constructor(
        unit: Unit,
        unitService: UnitService,
    ) {
        super(Number(unit.telegramChannelId))
        this.unitService = unitService
        this.unit = unit
    }

    getSteps = (): WizardStep[] => [
        {
            order: 0,
            message: [
                `Prompts: `,
                this.getActivateLine(),
            ],
            answers: [ this.getActivateAnswer() ]
        }, {
            order: 1,
            close: true,
            message: [` Subscription deactivated`]
        }, {
            order: 2,
            close: true,
            message: [` Subscription activated`]
        }
    ]

    private getActivateLine(): string {
        if (this.unit.active) {
            return `deactivate - to deactivate subscription`
        } else {
            return `dd - to activate subscription`
        }
    }

    private getActivateAnswer(): WizardAnswer {
        if (this.unit.active) {
            return {
                phrase: 'deactivate',
                result: async () => {
                    const result = await this.unitService.activation(this.unit.identifier, false)
                    if (result) return 1
                    return [`Failed`]
                }
            }
        } else {
            return {
                phrase: 'activate',
                result: async () => {
                    const result = await this.unitService.activation(this.unit.identifier, true)
                    if (result) return 2
                    return [`Failed`]
                }
            }
        }
    }

}

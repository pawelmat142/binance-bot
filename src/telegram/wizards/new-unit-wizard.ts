import { Inject } from "@nestjs/common";
import { BotWizard, WizardStep } from "./bot-wizard";
import { UnitService } from "src/unit/unit.service";
import { Unit } from "src/unit/unit";

export class NewUnitWizard extends BotWizard {

    private readonly unitService: UnitService

    constructor(
        chatId: number,
        unitService: UnitService
    ) {
        super(chatId)
        this.unitService = unitService
    }

    getSteps = (): WizardStep[] => {
        return this._steps
    }

    unit: Partial<Unit> = {}

    public _steps: WizardStep[] = [
        {
            order: 0,
            message: [
                `Prompts: `,
                `start - to start subscribe bot`
            ],
            answers: [
                {
                    phrase: 'start',
                    result: async () => 1
                }
            ]
        }, {
            order: 1,
            message: [ `Provide unique nickname / identifier` ],
            answers: [{
                input: true,
                result: async (text) => {
                    const identifierTaken = await this.unitService.identifierTaken(text)
                    if (identifierTaken) {
                        return `Identifier taken`
                    }
                    this.unit.identifier = text
                    return 2
                }
            }]
        }, {
            order: 2,
            message: [ `Provide api key `],
            answers: [{
                input: true,
                result: async (text) => {
                    const apiKeyTaken = await this.unitService.apiKeyTaken(text)
                    if (apiKeyTaken) {
                        return `Api key is already in use`
                    }
                    this.unit.binanceApiKey = text
                    return 3
                }
            }]
        }, {
            order: 3,
            message: [ `Provide api secret `],
            answers: [{
                input: true,
                result: async (text) => {
                    // TODO test api key
                    return 4
                }
            }]
        }, {
            order: 4,
            message: [ `TODO `],
        }
    ]

}


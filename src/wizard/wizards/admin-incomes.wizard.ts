import { Unit } from "../../unit/unit"
import { BotUtil } from "../bot.util"
import { ServiceProvider } from "../services.provider"
import { AdminWizard } from "./admin.wizard"
import { UnitWizard } from "./unit-wizard"
import { WizardButton, WizardStep } from "./wizard"
import { IncomeRecord, Period } from "../../binance/model/model"
import { IncomesUtil } from "../incomes-util"
import { Http } from "../../global/http/http.service"

type IncomesResult = IncomeRecord[] | string

interface UnitIncomes {
    unit: Unit
    incomes: IncomesResult
}

export class AdminIncomesWizard extends UnitWizard {

    constructor(unit: Unit, services: ServiceProvider) {
        super(unit, services)
    }

    protected _init = async () => {
        this.units = await this.services.unitService.fetchAllUnits()
        this.units.sort((a, b) => Number(b.active) - Number(a.active))
    }

    private error: string

    private units: Unit[]

    private unitIncomes: UnitIncomes[] = []

    private selectedMonthsBefore: number

    private get monthName(): string {
        return IncomesUtil.nameOfMonthBefore(this.selectedMonthsBefore)
    }

    public getSteps(): WizardStep[] {
        return [{
            order: 0,
            message: ['Select incomes period'],
            buttons: [[{
                text: `This month`,
                callback_data: 'thismonth',
                process: async () => this.loadIncomes(0)
            }], [{
                text: `Last month (${IncomesUtil.nameOfMonthBefore(1)})`,
                callback_data: 'lastmonth',
                process: async () => this.loadIncomes(1)
            }], [{
                text: IncomesUtil.nameOfMonthBefore(2),
                callback_data: IncomesUtil.nameOfMonthBefore(2),
                process: async () => this.loadIncomes(2)
            }], [{
                text: IncomesUtil.nameOfMonthBefore(3),
                callback_data: IncomesUtil.nameOfMonthBefore(3),
                process: async () => this.loadIncomes(3)
            }], [BotUtil.getBackSwitchButton(AdminWizard.name)]]

        }, {
            order: 1,
            message: [this.error],
            nextOrder: 0
        }, {
            order: 2,
            message: ['TODO'],
            buttons: this.unitIncomesButtons,
            backButton: true
        }]
    }


    private async loadIncomes(monthsBefore: number): Promise<number> {
        this.unitIncomes = []
        this.selectedMonthsBefore = undefined
        this.selectedMonthsBefore = monthsBefore
        const period = monthsBefore === 0 ? IncomesUtil.thisMonth() : IncomesUtil.monthBeforeMonths(monthsBefore)
        const results = await Promise.all(this.units.map(u => this.loadUnitIncomes(u, period)))
        this.unitIncomes = results.map((result, i) => {
            return {
                incomes: result,
                unit: this.units[i]
            }
        })
        return 2
    }

    private async loadUnitIncomes(unit: Unit, period: Period): Promise<IncomesResult> {
        try {
            const unitIncomes = await this.services.statisticsBinanceService.getIncomes(unit, period)
            return unitIncomes
        } catch (error) {
            const msg = Http.handleErrorMessage(error)
            return msg
        }
    }

    private get unitIncomesButtons(): WizardButton[][] {
        if (this.order !== 2) return []
        return this.unitIncomes.map(unitIncome => {
            return [{
                text: this.unitIncomeButtonText(unitIncome),
                callback_data: `${unitIncome.unit.identifier}`,
                process: async () => {
                    return 0
                }
            }]
        })
    }

    private unitIncomeButtonText(unitIncome: UnitIncomes): string {
        if (typeof unitIncome.incomes === 'string') {
            return `${unitIncome.unit.identifier} - error`
        } else {
            const incomeSumWithoutTransfers = IncomesUtil.sumIncomes(unitIncome.incomes.filter(income => income.incomeType !== 'TRANSFER')).toFixed(2)
            const incomeSum = IncomesUtil.sumIncomes(unitIncome.incomes).toFixed(2)
            return `${unitIncome.unit.identifier} (${incomeSumWithoutTransfers} USDT) / ${incomeSum}`
        }
    }

}
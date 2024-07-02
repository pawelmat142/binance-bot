import Decimal from "decimal.js";
import { IncomeRecord } from "../../binance/model/model";
import { Http } from "../../global/http/http.service";
import { Unit } from "../../unit/unit";
import { PeriodUtil } from "../period-util";
import { ServiceProvider } from "../services.provider";
import { UnitWizard } from "./unit-wizard";
import { WizardButton, WizardStep } from "./wizard";

export class IncomesWizard extends UnitWizard {

    private readonly TOTAL_INCOME_TYPE = 'TOTAL'

    constructor(unit: Unit, services: ServiceProvider) {
        super(unit, services)
    }

    incomes: IncomeRecord[] = []

    incomesByType: Map<string, IncomeRecord[]> = new Map()

    selectedMonthsBefore: number

    selectedIncomeType: string


    private get monthName(): string {
        return PeriodUtil.nameOfMonthBefore(this.selectedMonthsBefore)
    }

    error: string

    public getSteps(): WizardStep[] {

        return [{
            order: 0,
            message: ['Select income period'],
            buttons: [[{
                text: `This month`,
                callback_data: 'thismonth',
                process: async () => this.loadIncomes(0)
            }], [{
                text: `Last month (${PeriodUtil.nameOfMonthBefore(1)})`,
                callback_data: 'lastmonth',
                process: async () => this.loadIncomes(1)
            }], [{
                text: PeriodUtil.nameOfMonthBefore(2),
                callback_data: PeriodUtil.nameOfMonthBefore(2),
                process: async () => this.loadIncomes(2)
            }], [{
                text: PeriodUtil.nameOfMonthBefore(3),
                callback_data: PeriodUtil.nameOfMonthBefore(3),
                process: async () => this.loadIncomes(3)
            }]]
        }, {
            order: 1,
            message: [this.error],
            nextOrder: 0
        }, {
            order: 2,
            message: this.totalIncomeMessage,
            buttons: this.incomeByTypeButtons,
            backButton: true
        }, {
            order: 3,
            message: this.typeIncomeMessage,
            backButton: true
        }]
    }

    private async loadIncomes(monthsBefore: number): Promise<number> {
        this.incomes = []
        this.incomesByType.clear()
        this.selectedMonthsBefore = undefined
        try {
            this.selectedMonthsBefore = monthsBefore
            const period = monthsBefore === 0 ? PeriodUtil.thisMonth() : PeriodUtil.monthBeforeMonths(monthsBefore)
            const incomes = await this.services.statisticsBinanceService.getIncomes(this.unit, period)
            this.incomes = incomes
            this.orderIncomesByType()
            return 2
        } catch (error) {
            const msg = Http.handleErrorMessage(error)
            this.error = msg
            return 1
        }
    }



    private get totalIncomeMessage(): string[] {
        if (this.order !== 2 && this.order !== 3) return []
        return [`Total income of ${this.monthName}: ${this.sumIncomes(this.incomes).toFixed(2)} USDT`]
    }

    private get incomeByTypeButtons(): WizardButton[][] {
        if (this.order !== 2) return []
        this.selectedIncomeType = ''
        if (!this.incomesByType.size) return []
        const incomeTypesAndSums = Array.from(this.incomesByType?.keys()).map(type => {
            return {
                type: type,
                sum: this.sumIncomes(this.incomesByType.get(type))
            }
        })
        incomeTypesAndSums.sort((a, b) => b.sum - a.sum)
        return [
            [{
                text: `Total`,
                callback_data: 'total',
                process: async () => {
                    this.selectedIncomeType = this.TOTAL_INCOME_TYPE
                    return 3
                }
            }],
            ...incomeTypesAndSums.map(typeAndSum => {
                return [{
                    text: `${typeAndSum.type} (${typeAndSum.sum.toFixed(2)} USDT)`,
                    callback_data: typeAndSum.type,
                    process: async () => {
                        this.selectedIncomeType = typeAndSum.type
                        return 3
                    }
                }]
            })
        ]
    }

    private get typeIncomeMessage(): string[] {
        if (this.order !== 3) return []
        const incomesByType = this.selectedIncomeType === this.TOTAL_INCOME_TYPE
            ? this.incomes
            : this.incomesByType.get(this.selectedIncomeType)

        const incomesBySymbol = new Map<string, IncomeRecord[]>()
        for (let income of incomesByType) {
            if (incomesBySymbol.has(income.symbol)) {
                incomesBySymbol.get(income.symbol).push(income)
            } else {
                incomesBySymbol.set(income.symbol, [income])
            }
        }
        const incomeSymbolsAndSums = Array.from(incomesBySymbol.keys()).map(symbol => {
            return {
                symbol: symbol || 'USDT',
                sum: this.sumIncomes(incomesBySymbol.get(symbol))
            }
        })
        incomeSymbolsAndSums.sort((a, b) => b.sum - a.sum)
        return incomeSymbolsAndSums.map(symbolAndSum => `${symbolAndSum.symbol}: ${symbolAndSum.sum.toFixed(2)} USDT`)
    }




    private orderIncomesByType() {
        for (let income of this.incomes) {
            if (this.incomesByType.has(income.incomeType)) {
                this.incomesByType.get(income.incomeType).push(income)
            } else {
                this.incomesByType.set(income.incomeType, [income])
            }
        }
    }

    
    private sumIncomes(incomes: IncomeRecord[]): number  {
        return incomes
            .map(income => new Decimal(income.income))
            .reduce((sum, income) => sum.plus(income), new Decimal(0))
            .toNumber()
    }

}

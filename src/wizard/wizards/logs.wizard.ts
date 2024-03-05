import { Unit } from "src/unit/unit"
import { ServicesService } from "../services.service"
import { WizardStep } from "../wizard"
import { UnitWizard } from "./unit-wizard"
import { TradeUnit } from "src/binance/model/trade-unit"
import { TradeUtil } from "src/binance/trade-util"
import { Input } from "telegraf"

export class LogsWizard extends UnitWizard {

    private logs: string[]

    private logsLimit = 5

    private logJsons: any[]

    private jsonRegex = /\{.*\}/;

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
                await this.initLogs()
                this.order = 1
                return this.getLogs(1)
            }
        }, {
            order: 1,
            message: ['Provide last logs number'],
            process: async (input: string) => {
                const num = Number(input)
                if (isNaN(num)) {
                    this.order = 1
                    return [`${input} is not a number!`]
                }
                if (num > 15) {
                    this.order = 1
                    return [`max 15`]
                }
                return this.getLogs(num)
            }
        }]
    }

    private async initLogs() {
        if (!this.logs) {
            this.logs = await this.services.unitService.fetchLogs(this.unit.identifier)
        }
    }

    private getLogs(number: number): any[] {
        const logs = this.logs.slice(number*-1)
        return logs.map(this.convertLog)
    }


    private convertLog = (log: string): any => {
        const matches = log.match(this.jsonRegex)
        if (matches) {
            const jsonString = matches[0]
            try {
                const json = JSON.parse(jsonString)
                if (TradeUtil.isTradeEvent(json)) {
                    const futuresResult = JSON.stringify(TradeUtil.parseToFuturesResult(json))
                    return futuresResult
                }
                return JSON.stringify(json)
            } catch(error) {
            }
        } else {
            return log
        }
    }
}
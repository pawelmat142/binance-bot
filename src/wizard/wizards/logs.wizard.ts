import { Unit } from "src/unit/unit"
import { ServicesService } from "../services.service"
import { WizardStep } from "../wizard"
import { UnitWizard } from "./unit-wizard"
import { TradeUtil } from "src/binance/trade-util"
import { FuturesResult } from "src/binance/model/trade"

export class LogsWizard extends UnitWizard {

    private logs: string[]

    private jsonRegex = /\{.*\}/;

    constructor(unit: Unit, services: ServicesService) {
        super(unit, services)
    }

    logsNumber = 5
    logsIterator = 0

    trades: FuturesResult[]
    tradesNumber = 5
    tradesIterator = 0

    selectedSymbol: string
    selectedTrades: FuturesResult[]
    selectedTradesNumber = 5
    selectedtradesIterator = 0

    protected _init = async () => this.initLogs()

    public getSteps(): WizardStep[] {
        return [{
            order: 0,
            message: [
                `x - to show last x logs (max 15)`,
                `trade - to filter last trade jsons`,
                `there is ${this.logs?.length} logs`
            ],
            process: async (input: string) => {
                const num = Number(input)
                if (isNaN(num)) {
                    if (input === 'trade') {
                        this.initTradeJsons()
                        return 2
                    }
                } else {
                    this.logsNumber = num
                    this.order = 1
                    return this.getLogs()
                }
                return 0
            }
        }, {
            order: 1,
            message: [
                `n - next ${this.logsNumber} logs`,
                `b - ${this.logsNumber} logs before`
            ],
            process: async (input: string) => {
                if (['n','b'].includes(input)) {
                    if (input === 'n') {
                        this.logsIterator++
                    } 
                    if (input === 'b') {
                        if (this.logsIterator) {
                            this.logsIterator--
                        }
                    }
                    return this.getLogs()
                } else return 0
            }
        }, {
            order: 2,
            message: [
                `Theres ${this.trades?.length} trade json responses`,
                `x - to show x last trades(max 10)`,
                `<tokenname> - to show only token trades`,
            ],
            process: async (input: string) => {
                const num = Number(input)
                if (isNaN(num)) {
                    const symbol = input.includes('usdt') ? input.toUpperCase() : `${input.toUpperCase()}USDT`
                    const selectedTrades = this.trades.filter(t => t.symbol === symbol)
                    if (selectedTrades.length) {
                        this.selectedSymbol = symbol
                        this.selectedTrades = selectedTrades
                        return 4
                    }
                } else {
                    if (num > 10) return [`max 10!`]
                    if (num > this.trades.length) return [`Theres only ${this.trades.length} trade jsons`]
                    this.order = 3
                    this.tradesNumber = num
                    return this.getTrades()
                }
                return 2
            }
        }, {
            order: 3,
            message: [
                `n - next ${this.tradesNumber} trades`,
                `b - ${this.tradesNumber} trades before`
            ],
            process: async (input: string) => {
                if (['n','b'].includes(input)) {
                    if (input === 'n') {
                        this.tradesIterator++
                    } 
                    if (input === 'b') {
                        if (this.tradesIterator) {
                            this.tradesIterator--
                        }
                    }
                    return this.getTrades()
                }
                return 3
            }
        }, {
            order: 4,
            message: [
                `Theres ${this.selectedTrades?.length} ${this.selectedSymbol} trade json responses`,
                `x - to show x last ${this.selectedSymbol} trades (max 10)`,
            ],
            process: async (input: string) => {
                const num = Number(input)
                if (isNaN(num)) {
                    return [`${input} is not a number`]
                } else {
                    if (num > 10) return [`max 10!`]
                    if (num > this.selectedTrades.length) return [`Theres only ${this.selectedTrades.length} trade jsons`]
                    this.order = 5
                    this.selectedTradesNumber = num
                    return this.getSelectedTrades()
                }
            }
        }, {
            order: 5,
            message: [
                `n - next ${this.selectedSymbol} trades `,
                `b - ${this.selectedSymbol} trades before`
            ],
            process: async (input: string) => {
                if (['n','b'].includes(input)) {
                    if (input === 'n') {
                        this.selectedtradesIterator++
                    } 
                    if (input === 'b') {
                        if (this.selectedtradesIterator) {
                            this.selectedtradesIterator--
                        }
                    }
                    return this.getSelectedTrades()
                }
                return 5
            }
        }]
    }



    private async initLogs() {
        if (!this.logs) {
            this.logs = await this.services.unitService.fetchLogs(this.unit.identifier)
        }
    }

    private initTradeJsons = () => {
        if (!this.trades) {
            this.trades = this.logs.map((log, i) => {
                const matches = log.match(this.jsonRegex)
                if (matches) {
                    const jsonString = matches[0]
                    try {
                        const json = JSON.parse(jsonString)
                        if (TradeUtil.isTradeEvent(json)) {
                            const futuresResult = TradeUtil.parseToFuturesResult(json)
                            return futuresResult
                        }
                    } catch {}
                }
                return null
            }).filter(l => !!l)
        }
    }

    private getLogs(): string[] {
        const indexFrom = this.logs.length - 1 - this.logsIterator*this.logsNumber
        const indexTo = this.logs.length - 1 - ((this.logsIterator+1)*this.logsNumber-1)
        return this.logs
            .map((l, i) => `  *** ${i}'s\n${l}`)
            .filter((l, i) => i <= indexFrom && i >= indexTo )
    }

    private getTrades(): string[] {
        const indexFrom = this.trades.length - 1 - this.tradesIterator*this.tradesNumber
        const indexTo = this.trades.length - 1 - ((this.tradesIterator+1)*this.tradesNumber-1)
        return this.trades
            .map((l, i) => `  *** ${i+1}'s\n${this.formatTradeJson(l)}`)
            .filter((l, i) => i <= indexFrom && i >= indexTo )
    }

    private getSelectedTrades(): string[] {
        const indexFrom = this.selectedTrades.length - 1 - this.selectedtradesIterator*this.selectedTradesNumber
        const indexTo = this.selectedTrades.length - 1 - ((this.selectedtradesIterator+1)*this.selectedTradesNumber-1)
        return this.selectedTrades
            .map((l, i) => `  *** ${i+1}'s\n${this.formatTradeJson(l)}`)
            .filter((l, i) => i <= indexFrom && i >= indexTo )
    }

    private formatTradeJson = (trade: FuturesResult): string => JSON.stringify(trade, null, 2)

}
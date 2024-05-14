import { Unit } from "src/unit/unit"
import { ServiceProfivder } from "../services.provider"
import { UnitWizard } from "./unit-wizard"
import { TradeUtil } from "src/binance/trade-util"
import { FuturesResult } from "src/binance/model/trade"
import { WizardStep } from "./wizard"

export class LogsWizard extends UnitWizard {

    private logs: string[]

    private jsonRegex = /\{.*\}/;

    constructor(unit: Unit, services: ServiceProfivder) {
        super(unit, services)
    }

    logsNumber = 5
    logsIterator = 0

    trades: FuturesResult[]
    tradesNumber = 5
    tradesIterator = 0

    selectedSymbol: string
    selectedTradesNumber = 5
    selectedtradesIterator = 0

    protected _init = async () => this.initLogs()

    public getSteps(): WizardStep[] {
        return [{
            order: 0,
            message: [`there is ${this.logs?.length} logs`],
            buttons: [[{
                text: `5 logs`,
                callback_data: `5logs`,
                process: async () => {
                    this.logsNumber = 5
                    return 1 
                }
            }, {
                text: `10 logs`,
                callback_data: `10logs`,
                process: async () => {
                    this.logsNumber = 10
                    return 1 
                }
            }], [{
                text: `only trades`,
                callback_data: `only trades`,
                process: async () => {
                    this.initTradeJsons()
                    return 2
                }
            }]],
        }, {
            order: 1,
            message: this.getLogs(),
            buttons: [[{
                text: `<<`,
                callback_data: `goback`,
                process: async () => {
                    this.logsIterator--
                    return 1
                }
            }, {
                text: `>>`,
                callback_data: `goforward`,
                process: async () => {
                    this.logsIterator++
                    return 1
                }
            }]]
        }, {
            order: 2,
            message: [`Theres ${this.trades?.length} trade json responses`],
            buttons: [[{
                text: `Filter by symbol`,
                callback_data: `filterbysymbol`,
                process: async () => {
                    return 4
                }
            }], [{
                text: `5 logs`,
                callback_data: `5logs`,
                process: async () => {
                    this.logsNumber = 5
                    return 3 
                }
            }, {
                text: `10 logs`,
                callback_data: `10logs`,
                process: async () => {
                    this.logsNumber = 10
                    return 3 
                }
            }]],
        }, {
            order: 3,
            message: this.getTrades(),
            buttons: [[{
                text: `<<`,
                callback_data: `goback`,
                process: async () => {
                    this.tradesIterator--
                    return 3
                }
            }, {
                text: `>>`,
                callback_data: `goforward`,
                process: async () => {
                    this.tradesIterator++
                    return 3
                }
            }]]
        }, {
            order: 4,
            message: [`Select symbol:`],
            buttons: this.getTradeSymbolsAsMatrix(this.getTradeSymbols()).map(row => row.map(symbol => {
                return {
                    text: symbol,
                    callback_data: symbol,
                    process: async () => {
                        this.selectedSymbol = symbol
                        return 5
                    }
                }
            }))
        }, {
            order: 5,
            message: this.getSelectedTrades(),
            buttons: [[{
                text: `<<`,
                callback_data: `goback`,
                process: async () => {
                    this.selectedtradesIterator--
                    return 5
                }
            }, {
                text: `>>`,
                callback_data: `goforward`,
                process: async () => {
                    this.selectedtradesIterator++
                    return 5
                }
            }]]
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
        if (this.order !== 1) return [`??`]
        const indexFrom = this.logs.length - 1 - this.logsIterator*this.logsNumber
        const indexTo = this.logs.length - 1 - ((this.logsIterator+1)*this.logsNumber-1)
        const message = this.logs
            .map((l, i) => `  *** ${i}'s\n${l}`)
            .filter((l, i) => i <= indexFrom && i >= indexTo )
        return message.reduce((acc, curr, i) => {
            acc.push(curr)
            if (i < message.length - 1) {
                acc.push(` `)
            }
            return acc
        }, [])
    }

    private getTrades(): string[] {
        if (this.order !== 3) return []
        const indexFrom = this.trades.length - 1 - this.tradesIterator*this.tradesNumber
        const indexTo = this.trades.length - 1 - ((this.tradesIterator+1)*this.tradesNumber-1)
        return this.trades
            .map((l, i) => `  *** ${i+1}'s\n${this.formatTradeJson(l)}`)
            .filter((l, i) => i <= indexFrom && i >= indexTo )
    }

    private getTradeSymbols(): string[] {
        if (this.trades) {
            let result = new Set(this.trades.map(t => t.symbol))
            return Array.from(result)
        }
        return []
    }

    private getTradeSymbolsAsMatrix(originalArray: string[]): string[][] {
        return originalArray.reduce((acc, current, i, array) => {
            if (i % 2 === 0 || i === array.length -1) {
                acc.push([current])
            } else {
                acc[acc.length - 1].push(current)
            }
            return acc
        }, [])
    }

    private getSelectedTrades(): string[] {
        if (this.order !== 5) return []
        const indexFrom = this.selectedTrades.length - 1 - this.selectedtradesIterator*this.selectedTradesNumber
        const indexTo = this.selectedTrades.length - 1 - ((this.selectedtradesIterator+1)*this.selectedTradesNumber-1)
        return this.selectedTrades
            .map((l, i) => `\n  *** ${i+1}'s\n${this.formatTradeJson(l)}\n`)
            .filter((l, i) => i <= indexFrom && i >= indexTo )
    }

    private formatTradeJson = (trade: FuturesResult): string => JSON.stringify(trade, null, 2)

    private get selectedTrades(): FuturesResult[] {
        return this.trades.filter(t => t.symbol === this.selectedSymbol)
    }
}
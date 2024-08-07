import { Signal } from "../../signal";
import { BaseSignalValidator } from "../base-signal-validator";
import { SignalUtil } from "../../signal-util";
import { TakeProfit } from "../../../binance/model/trade-variant";
import { TPUtil } from "../../../binance/utils/take-profit-util";

export class GalaxyTakeProfitsValidator extends BaseSignalValidator {

    private readonly takeProfitRegex = /take profit/i;
    private readonly dolarOrPercentRegex = /(?:\d{1,3}(?:\s\d{3})*|\d+)(?:\.\d+)?(?:[$%])/g

    private takeProfitLineIndex = -1

    takeProfitsOk = false

    public get triggered(): boolean {
        return this.takeProfitLineIndex !== -1
    }

    static start(signal: Signal): boolean {
        const val = new GalaxyTakeProfitsValidator(signal)
        val.validate()
        return val.triggered
    }
    
    
    validate(): void {
        if (!this.signal.variant.side || !this.signal.variant.symbol) {
            return
        }
        if (this.signal.variant.takeProfits?.length) {
            this.addLog(`[SKIP] TakeProfitsValidator`)
            return
        }
        this.addLog(`[START] TakeProfitsValidator`)
        this.signal.variant.takeProfits = []
        for(let lineIndex=0; lineIndex < this.lines.length; lineIndex++) {
            const line = this.lines[lineIndex]
            if (!line) continue
            const isTakeProfit = this.takeProfitRegex.test(line)
            if (isTakeProfit) {
                this.takeProfitLineIndex = lineIndex
                break
            }
        }
        this.findTakeProfit()
        if (this.takeProfitLineIndex !== -1) {
            if (this.signal.variant.takeProfits.length) {
                this.setTakeProfitsPercentageIfNotValid()
                this.signal.otherSignalAction = this.signal.otherSignalAction || {}
                this.signal.otherSignalAction.takeProfitFound = this.validateTakeProfits()
                if (!this.signal.otherSignalAction.takeProfitFound) {
                    throw new Error(`SWW take profit values`)
                }
            } else {
                this.addWarning(`take profit length = ${this.signal.variant.takeProfits.length}`)
            }
        } else {
            this.addWarning('take profit could not be found')
        }
        this.addLog(`[STOP] TakeProfitsValidator`)
    }


    private findTakeProfit() {
        let textToScan = this.prepareTextToScanTakeProfit() 
        if (textToScan) {
            const takeProfitValues: string[] = textToScan.match(this.dolarOrPercentRegex)
            do {
                const takeProfitValue: string = takeProfitValues.shift()
                if (takeProfitValue) {
                    this.findTakeProfitValue(takeProfitValue)
                    this.findTakeProfitClose(takeProfitValue)
                }
            } while (takeProfitValues.length)
            this.signal.variant.takeProfits = this.signal.variant.takeProfits.filter(tp => {
                return !!tp.price
            })
        }
    }

    private prepareTextToScanTakeProfit(): string {
        let textToScan = ''
        let lineIndex = this.takeProfitLineIndex 
        let flag = false
        let iteration = 0
        do {
            const line = this.lines[lineIndex+iteration]
            flag = line && (line.includes("$") || line.includes("%")) 
            if (flag) {
                textToScan += line
            }
            iteration++
        } while (iteration < 3 || flag)
        return textToScan;
    }

    private findTakeProfitValue(takeProfitValue: string) {
        const dolarValue: number = SignalUtil.withoutDollar(takeProfitValue)
        if (!isNaN(dolarValue)) {
            const takeProfitLength = this.signal.variant.takeProfits?.length
            if (takeProfitLength > 0) {
                const lastTakeProfit = this.signal.variant.takeProfits[takeProfitLength-1]
                if (!lastTakeProfit.price) {
                    lastTakeProfit.price = dolarValue
                    return
                }
            } 
            this.newTakeProfit(takeProfitLength, undefined, dolarValue)
        }
    }

    private findTakeProfitClose(takeProfitValue: string) {
        const percentValue: number = this.withoutPercent(takeProfitValue)
        if (!isNaN(percentValue)) {
            const takeProfitLength = this.signal.variant.takeProfits.length
            if (takeProfitLength > 0) {
                const lastTakeProfit = this.signal.variant.takeProfits[takeProfitLength-1]
                if (!lastTakeProfit.closePercent) {
                    lastTakeProfit.closePercent = percentValue
                    return
                }
            } 
            this.newTakeProfit(takeProfitLength, percentValue, undefined)
        }
    }

    private newTakeProfit(index: number, closePercent?: number, value?: number) {
        const takeProfit: TakeProfit = {
            order: index,
            closePercent: closePercent ?? 0,
            price: value ?? 0
        } as TakeProfit
        this.signal.variant.takeProfits.push(takeProfit)
    } 

    private setTakeProfitsPercentageIfNotValid() {
        const takeProfitPercentagesSum = TPUtil.takeProfitsPercentageSum(this.signal.variant.takeProfits)

        if (takeProfitPercentagesSum === 100) {
            SignalUtil.addLog(`Take Profit percentages valid ${TPUtil.percentagesString(this.signal.variant)}`, this.signal, this.logger)
            return
        }
        TPUtil.calculatePercentages(this.signal.variant.takeProfits)
        SignalUtil.addLog(`Take Profit percentages calculated ${TPUtil.percentagesString(this.signal.variant)}`, this.signal, this.logger)
    }

    private withoutPercent(input: string): number {
        return Number(input?.trim().replace(/\%/g, ''))
    }

    private validateTakeProfits() {
        if (!this.signal.variant.takeProfits.length) {
            return false
        }
        const sumok = this.takeProfitValuesSumOk
        const sortOk = this.takeProfitValuesSortedOk
        if (!sumok) {
            this.addError('Sum of take profit closes is not 100%')
        }
        if (!sortOk) {
            this.addError('Take profit sort error')
        }
        return sumok && sortOk
    }

    private get takeProfitValuesSumOk(): boolean {
        return this.signal.variant.takeProfits
            .map(takeProfit => takeProfit.closePercent)
            .reduce((accumulator, currentValue, index) => {
                const returns = accumulator + currentValue
                return returns
            }) === 100
    }

    private get takeProfitValuesSortedOk(): boolean {
        if (!this.modeValueOk) {
            return false
        }
        if (this.signal.variant.side === 'BUY') {
            let valueBefore = 0
            for (let takeProfit of this.signal.variant.takeProfits) {
                if (takeProfit.price > valueBefore) {
                    valueBefore = takeProfit.price
                } else {
                    return false
                }
            }
        } else {
            let valueBefore = Infinity
            for (let takeProfit of this.signal.variant.takeProfits) {
                if (takeProfit.price < valueBefore) {
                    valueBefore = takeProfit.price
                } else {
                    return false
                }
            }
        }
        return true
    } 

    private get modeValueOk(): boolean {
        return this.signal.variant.side === 'BUY' || this.signal.variant.side === 'SELL'
    }

}
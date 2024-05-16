import { toDateString } from "src/global/util"
import { Signal } from "./signal"
import { TradeUtil } from "src/binance/trade-util"
import { TakeProfit, TradeVariant } from "src/binance/model/trade-variant"
import { SignalUtil } from "./signal-util"
import { Logger } from "@nestjs/common"
import Decimal from "decimal.js"

export type SignalMode = 'SHORT' | 'LONG'

export class SignalValidator {

    private readonly logger = new Logger(SignalValidator.name)

    telegramMessageId = ''

    lines: string[]

    message: string
    
    takeProfitsOk = false

    errors: string[] = []
    valuesLogicOk = false   

    signal: Signal

    variant: Partial<TradeVariant> = { 
        takeProfits: [] 
    }
    // variant: Partial<TradeVariant> = { takeProfits: [] }

    public get valid() {
        return this.modeValueOk
        && this.entryZoneValuesOk 
        && this.valuesLogicOk
    }

    constructor(signal: Signal) {
        this.signal = signal
        this.message = signal.content
    }

    private readonly entryZoneRegex = /entry\s*zone/i;
    private readonly enteringRegex = /entering at/i;
    private readonly takeProfitRegex = /take profit/i;
    private readonly stopLossRegex = /\bstop\s*loss\b/i
    // private readonly valueDolarRegex = /\b(\d+(\.\d+)?)\$(?=\s|$)/g
    // private readonly valueDolarRegex = /\d{1,3}(?:\s\d{3})*(?:\.\d{1,2})?\$/g
    // private readonly valueDolarRegex = /(?:\d{1,3}(?:[ ,]\d{3})*(?:[.,]\d+)?)/g
    private readonly valueDolarRegex = /([\d\s]+([.,]\d+)?\s*\$)/g

    
    // private readonly dolarOrPercentRegex = /(\$|\%)\s*\d+(\.\d+)?|\d+(\.\d+)?\s*(\$|\%)/g
    private readonly dolarOrPercentRegex = /(?:\d{1,3}(?:\s\d{3})*|\d+)(?:\.\d+)?(?:[$%])/g
    private readonly riskRegex = /risk/i;
    private readonly highRiskRegex = /high risk/i;
    
    private tokenNameLineIndex = -1
    private entryZoneLineIndex = -1
    private takeProfitLineIndex = -1
    private stopLossLineIndex = -1
    private leverageLineIndex = -1
    private percentOfBalanceLineIndex = -1

    private prepareLines() {
        this.lines = this.message?.split(/\r?\n/) ?? []
    }

    public validate() {
        this.prepareLines()
        this.processValidation()
        this.valuesLogicOk = this.validateValuesLogic()
        this.signal.valid = this.valid
        this.signal.tradeVariant = this.variant as TradeVariant
    }

    private processValidation() {
        for(let i=0; i < this.lines.length; i++) {
            this.findSignalSideAndSymbol(i)
            this.findEntryZoneIndex(i)
            this.findTakeProfitLineIndex(i)
            this.findStopLossLineIndex(i)
            this.findLeverageLineIndex(i)
            this.findPercentOfBalanceLineIndex(i)
        }
        if (this.variant.symbol) {
            SignalUtil.addLog(`Found symbol ${this.variant.symbol}`, this.signal, this.logger)
        } else {
            this.signalError('symbol could not be found')
            return
        }
        if (this.entryZoneLineIndex !== -1) {
            this.findEntryZone()
            this.findRiskPhrase()
        } else {
            this.signalError('entry zone could not be found')
            return
        }
        if (this.takeProfitLineIndex !== -1) {
            this.findTakeProfit()
            if (this.variant.takeProfits.length) {
                this.setTakeProfitsPercentageIfNotValid()
                this.takeProfitsOk = this.validateTakeProfits()
            } else {
                this.signalError(`take profit length = ${this.variant.takeProfits.length}`)
            }
            // this.findLeverage()
        } else {
            this.signalError('take profit could not be found')
        }
        if (this.stopLossLineIndex !== -1) {
            this.findStopLoss()
        } else {
            this.signalWarning('stop loss could not be found')
        }
        if (this.leverageLineIndex !== -1) {
            this.findLeverage()
        } else {
            this.signalWarning('leverage could not be found')
        }
        if (this.percentOfBalanceLineIndex !== -1) {
            this.findPercentOfBalance()
        } else {
            this.signalWarning('percentOfBalanceLineIndex could not be found')
        }
        if (!this.variant.leverMin || !this.variant.leverMax) {
            this.signalWarning('Lever not found')
        }
    }

    private findSignalSideAndSymbol(lineIndex: number) {
        if (this.tokenNameLineIndex !== -1) {
            return
        }
        const line = this.lines[lineIndex]
        const isShort = this.isShort(line)
        const isLong = this.isLong(line)
        if (isShort && !isLong) {
            this.variant.side = 'SELL'
            this.tokenNameLineIndex = lineIndex
            this.findSymbol(line)
        } else if (!isShort && isLong) {
            this.tokenNameLineIndex = lineIndex
            this.variant.side = 'BUY'
            this.findSymbol(line)
        }
    }

    private findSymbol(line: string) {
        if (line) {
            let words = line.split(' ')
                .filter(word => !!word)
            if (words.length > 0) {
                const sideIndex = words.findIndex(word => this.isShort(word) || this.isLong(word))
                if (sideIndex !== -1) {
                    const wordAfter = words[sideIndex + 1]
                    if (wordAfter) {
                        this.variant.symbol = TradeUtil.getSymbolByToken(wordAfter)
                    } else {
                        const wordBefore = words[sideIndex - 1] 
                        if (wordBefore) {
                            this.variant.symbol = TradeUtil.getSymbolByToken(wordBefore)
                        } 
                    }
                }
            }
        }
    }


    private findEntryZoneIndex(lineIndex: number) {
        const line = this.lines[lineIndex]
        const isEntryZone = this.entryZoneRegex.test(line) || this.enteringRegex.test(line)
        if (isEntryZone) {
            this.entryZoneLineIndex = lineIndex
        }
    }

    private findEntryZone() {
        const linesToScan = `${this.lines[this.entryZoneLineIndex]}${this.lines[this.entryZoneLineIndex+1]}${this.lines[this.entryZoneLineIndex+2]}${this.lines[this.entryZoneLineIndex+3]}`
        let entryZoneMatch = linesToScan.match(this.valueDolarRegex)
        if (Array.isArray(entryZoneMatch) && entryZoneMatch.length > 1) {
            const one = this.withoutDollar(entryZoneMatch[0])
            const two = this.withoutDollar(entryZoneMatch[1])
            if (!isNaN(one) && !isNaN(two)) {
                const max = Math.max(one, two)
                const min = Math.min(one, two)
                if (this.variant.side === 'BUY') {
                    this.variant.entryZoneStart = min
                    this.variant.entryZoneEnd = max
                } else {
                    this.variant.entryZoneStart = max
                    this.variant.entryZoneEnd = min
                }
            } 
        }
    }

    private findTakeProfitLineIndex(lineIndex: number) {
        const line = this.lines[lineIndex]
        const isTakeProfit = this.takeProfitRegex.test(line)
        if (isTakeProfit) {
            this.takeProfitLineIndex = lineIndex
        }
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
            this.variant.takeProfits = this.variant.takeProfits.filter(tp => {
                return !!tp.price
            })
        }
    }

    private setTakeProfitsPercentageIfNotValid() {
        const takeProfitPercentagesSum = SignalUtil.takeProfitsPercentageSum(this.variant.takeProfits)

        if (takeProfitPercentagesSum === 100) {
            SignalUtil.addLog(`takeProfitPercentagesSum valid ${takeProfitPercentagesSum}`, this.signal, this.logger)
            return
        }
        SignalUtil.addLog(`takeProfitPercentagesSum: ${takeProfitPercentagesSum} not valid, calculate!`, this.signal, this.logger)
        const takeProfitsLength = this.variant.takeProfits.length
        const singleTakeProfitPercentage = new Decimal(100).div(takeProfitsLength).floor()
        this.variant.takeProfits.forEach(tp => {
            tp.closePercent = singleTakeProfitPercentage.toNumber()
        })

        const calculatedPercentageSum = SignalUtil.takeProfitsPercentageSum(this.variant.takeProfits)
        const diffrence = 100 - calculatedPercentageSum
        if (diffrence) {
            this.variant.takeProfits[0].closePercent += diffrence
        }
    }

    private validateTakeProfits() {
        if (!this.variant.takeProfits.length) {
            return false
        }
        const sumok = this.takeProfitValuesSumOk
        const sortOk = this.takeProfitValuesSortedOk
        if (!sumok) {
            this.signalError('Sum of take profit closes is not 100%')
        }
        if (!sortOk) {
            this.signalError('Take profit sort error')
        }
        return sumok && sortOk
    }

    private newTakeProfit(index: number, closePercent?: number, value?: number) {
        const takeProfit: TakeProfit = {
            order: index,
            closePercent: closePercent ?? 0,
            price: value ?? 0
        } 
        this.variant.takeProfits.push(takeProfit)
    } 


    private findStopLossLineIndex(lineIndex: number) {
        if (this.stopLossLineIndex !== -1) {
            return
        }
        const line = this.lines[lineIndex]
        const isStopLoss = this.stopLossRegex.test(line)
        if (isStopLoss) {
            this.stopLossLineIndex = lineIndex
        }
    }

    private findLeverageLineIndex(lineIndex: number) {
        if (this.leverageLineIndex !== -1) {
            return
        }
        const line = this.lines[lineIndex]
        const isLeverageLine = line.includes('lever')
        if (isLeverageLine) {
            this.leverageLineIndex = lineIndex
        }
    }

    private findPercentOfBalanceLineIndex(lineIndex: number) {
        if (this.percentOfBalanceLineIndex !== -1) {
            return
        }
        const line = this.lines[lineIndex]
        const isPercentOfBalanceLine = line.includes('your bank')
        if (isPercentOfBalanceLine) {
            this.percentOfBalanceLineIndex = lineIndex
        }
    }

    private findStopLoss() {
        for (let i = this.stopLossLineIndex; i<=this.stopLossLineIndex+2; i++) {
            const line = this.lines[i]
            if (line) {
                let stopLossArr = line.match(this.valueDolarRegex)
                if (Array.isArray(stopLossArr)) {
                    const stopLossStringValue = stopLossArr[0]
                    if (stopLossStringValue) {
                        const stopLossValue = this.withoutDollar(stopLossStringValue)
                        if (!isNaN(stopLossValue)) {
                            this.variant.stopLoss = stopLossValue
                        }
                    }
                }
            }
        }
    }

    private findRiskPhrase() {
        for(let i = 0; i < 5; i++) {
            const line = this.lines[i]
            if (line) {
                const risk = this.riskRegex.test(line)
                if (risk) {
                    this.variant.risk = true
                    const highRisk = this.highRiskRegex.test(line)
                    if (highRisk) {
                        this.variant.highRisk = true
                    }
                }
            }
        } 
    }

    private validateValuesLogic(): boolean {
        if (this.variant.side === 'BUY') {
            if (this.variant.stopLoss && this.variant.stopLoss > this.variant.entryZoneStart) {
                this.signalError(`[LONG] this.stopLoss > this.maxTakeProfit`)
                return false
            }
            if (this.variant.entryZoneStart > this.variant.entryZoneEnd) {
                this.signalError(`[LONG] this.entryZoneStart > this.entryZoneEnd`)
                return false
            }
            if (this.variant.takeProfits.length) {
                if (this.variant.entryZoneEnd > this.minTakeProfit) {
                    this.signalError(`[LONG] this.entryZoneEnd > this.minTakeProfit`)
                    return false
                }
                if (this.minTakeProfit > this.maxTakeProfit) {
                    this.signalError(`[LONG] this.minTakeProfit > this.maxTakeProfit`)
                    return false
                }
            }
        }
        if (this.variant.side === 'SELL') {
            if (this.minTakeProfit > this.maxTakeProfit) {
                this.signalError(`[SHORT] this.minTakeProfit > this.maxTakeProfit`)
                return false
            }
            if (this.variant.takeProfits.length) {
                if (this.maxTakeProfit > this.variant.entryZoneEnd) {
                    this.signalError(`[SHORT] this.maxTakeProfit > this.minTakeProfit`)
                    return false
                }
                if (this.variant.entryZoneEnd > this.variant.entryZoneStart) {
                    this.signalError(`[SHORT] this.entryZoneEnd > this.entryZoneStart`)
                    return false
                }
            }
            if (this.variant.stopLoss && this.variant.entryZoneStart > this.variant.stopLoss) {
                this.signalError(`[SHORT] entryZoneStart > this.stopLoss`)
                return false
            }
        }
        return true
    }

    private get minTakeProfit(): number {
       return this.variant.takeProfits
        .map(tp => tp.price)
        .reduce((min, value) => (value < min ? value : min), Infinity)
    }

    private get maxTakeProfit(): number {
        return this.variant.takeProfits
         .map(tp => tp.price)
         .reduce((max, value) => (value > max ? value : max), 0)
     }



    private findTakeProfitValue(takeProfitValue: string) {
        const dolarValue: number = this.withoutDollar(takeProfitValue)
        if (!isNaN(dolarValue)) {
            const takeProfitLength = this.variant.takeProfits?.length
            if (takeProfitLength > 0) {
                const lastTakeProfit = this.variant.takeProfits[takeProfitLength-1]
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
            const takeProfitLength = this.variant.takeProfits.length
            if (takeProfitLength > 0) {
                const lastTakeProfit = this.variant.takeProfits[takeProfitLength-1]
                if (!lastTakeProfit.closePercent) {
                    lastTakeProfit.closePercent = percentValue
                    return
                }
            } 
            this.newTakeProfit(takeProfitLength, percentValue, undefined)
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


    public get entryZoneValuesOk() {
        return !isNaN(this.variant.entryZoneStart) && !isNaN(this.variant.entryZoneEnd)
    }

    private withoutDollar(input: string): number {
        return Number(input?.trim().replace(' ', '').replace(/\$/g, ''))
    }

    private withoutPercent(input: string): number {
        return Number(input?.trim().replace(/\%/g, ''))
    }

    private get takeProfitValuesSumOk(): boolean {
        return this.variant.takeProfits
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
        if (this.variant.side === 'BUY') {
            let valueBefore = 0
            for (let takeProfit of this.variant.takeProfits) {
                if (takeProfit.price > valueBefore) {
                    valueBefore = takeProfit.price
                } else {
                    return false
                }
            }
        } else {
            let valueBefore = Infinity
            for (let takeProfit of this.variant.takeProfits) {
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
        return this.variant.side === 'BUY' || this.variant.side === 'SELL'
    }

    private findLeverage() {
        for (let i = this.leverageLineIndex; i<=this.leverageLineIndex+2; i++) {
            const line = this.lines[i]
            if (line) {
                const regex = /(\d+)x/
                const matches = line.match(regex)
                if (Array.isArray(matches)) {
                    const value = Number(matches[1])
                    if (!isNaN(value)) {
                        this.variant.leverMin = value
                        this.variant.leverMax = value
                        return
                    }
                }
            }
        }
    }

    private findPercentOfBalance() {
        const line = this.lines[this.percentOfBalanceLineIndex]
        if (line) {
            const regex = /(\d+)\s*%/g
            const matches = line.match(regex)
            if (Array.isArray(matches)) {
                let match = matches[0]
                match = match.replace("%", "").trim()
                const value = Number(match)
                if (!isNaN(value)) {
                    this.variant.percentOfBalance = value
                }
            }
        }
    }

    // private findLeverage() {
    //     let index = this.takeProfitLineIndex + this.variant.takeProfits.length + 1
    //     let iterator = 0
    //     const regex = /\b(\d+)x\b/g
    //     const values = []
    //     let matches = [] 
    //     do {
    //         matches = this.lines[index+iterator].match(regex)
    //         if (Array.isArray(matches)) {
    //             const numberMatches = matches.map(m => Number(m.match(/(\d+)x/)[1]))
    //             values.push(...numberMatches)
    //         }
    //         iterator++
    //     } while (iterator < 3 || matches)

    //     if (values.length) {
    //         values.sort((a, b) => a - b)
    //         this.variant.leverMin = values[0]
    //         this.variant.leverMax = values[values.length-1]
    //         SignalUtil.addLog(`Found lever ${this.variant.leverMin}x - ${this.variant.leverMax}x`, this.signal, this.logger)
    //     }
    // }

    private signalError(msg: string) {
        const error = `[${toDateString(new Date())}] [ERROR] - ${msg}`
        console.error(error)
        this.signal.logs.push(error)
    }

    private signalWarning(msg: string) {
        const error = `[${toDateString(new Date())}] [WARNING] - ${msg}`
        console.error(error)
        this.signal.logs.push(error)
    }



    private isShort(line: string): boolean {
        return /\bshort\b/i.test(line)
    }

    private isLong(line: string): boolean {
        return /\blong\b/i.test(line)
    }

    private numberOk(input: number) {
        return !isNaN(input)
    }

}
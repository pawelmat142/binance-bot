import { TradeVariant } from "../../../binance/model/trade-variant"
import { TradeUtil } from "../../../binance/utils/trade-util"
import { VariantUtil } from "../../../binance/utils/variant-util"
import { BaseSignalValidator } from "../base-signal-validator"
import { Signal } from "../../signal"
import { SignalUtil } from "../../signal-util"
import { SignalValidator } from "../signal-validator"
import { GalaxyStopLossValidator } from "./galaxy-stop-loss-validator"
import { GalaxyTakeProfitsValidator } from "./galaxy-take-profits.validator"

export class GalaxySignalValidator extends BaseSignalValidator implements SignalValidator {
    
    override valid() {
        return this.modeValueOk
        && this.entryZoneValuesOk 
    }

    override validate() {
        this.addLog(`[START] ${this.constructor.name}`)

        this.processValidation()
        this.signal.valid = this.valid()
        this.signal.variant = this.variant as TradeVariant

        GalaxyTakeProfitsValidator.start(this.signal)
        GalaxyStopLossValidator.start(this.signal)
        
        this.addLog(`[STOP] ${this.constructor.name}`)
    }

    private readonly entryZoneRegex = /entry\s*zone/i;
    private readonly enteringRegex = /entering at/i;

    private readonly riskRegex = /risk/i;
    private readonly highRiskRegex = /high risk/i;
    
    private tokenNameLineIndex = -1
    private entryZoneLineIndex = -1
    private leverageLineIndex = -1
    private percentOfBalanceLineIndex = -1

    private processValidation() {
        for(let i=0; i < this.lines.length; i++) {
            if (!this.lines[i]) continue
            this.findSignalSideAndSymbol(i)
            this.findEntryZoneIndex(i)
            this.findLeverageLineIndex(i)
            this.findPercentOfBalanceLineIndex(i)
        }
        if (this.variant.symbol) {
            SignalUtil.addLog(`Found symbol ${this.variant.symbol}`, this.signal, this.logger)
        } else {
            this.addWarning('symbol could not be found')
            return
        }
        if (this.entryZoneLineIndex !== -1) {
            this.findEntryZone()
            this.findRiskPhrase()
        } else {
            this.addWarning('entry zone could not be found')
            return
        }
        if (this.leverageLineIndex !== -1) {
            this.findLeverage()
        } else {
            this.addWarning('leverage not found, setting default x5')
            this.variant.leverMax = VariantUtil.DEFAULT_LEVER
            this.variant.leverMin = VariantUtil.DEFAULT_LEVER
        }
        if (this.percentOfBalanceLineIndex !== -1) {
            this.findPercentOfBalance()
        } else {
            this.addWarning('percentOfBalanceLineIndex could not be found')
        }
        if (!this.variant.leverMin || !this.variant.leverMax) {
            this.addWarning('Lever not found')
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
        let values = (linesToScan.match(SignalUtil.dolarValueSpaceRegex) || [])
            .map(val => SignalUtil.withoutDollar(val))
            .filter(val => !isNaN(val))
        
        if (!values.length) {
            SignalUtil.addError(`Not found entry zone for signal ${this.signal._id}`, this.signal, this.logger)
            return
        }

        const max = Math.max(...values)
        const min = Math.min(...values)

        if (this.variant.side === 'BUY') {
            this.variant.entryZoneStart = min
            this.variant.entryZoneEnd = max
        } else {
            this.variant.entryZoneStart = max
            this.variant.entryZoneEnd = min
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


    public get entryZoneValuesOk() {
        return !isNaN(this.variant.entryZoneStart) && !isNaN(this.variant.entryZoneEnd)
    }


    private get modeValueOk(): boolean {
        return this.variant.side === 'BUY' || this.variant.side === 'SELL'
    }

    private findLeverage() {
        for (let i = this.leverageLineIndex; i<=this.leverageLineIndex+1; i++) {
            const line = this.lines[i]
            if (line) {
                // const regex = /(\d+)x/
                const regex = /(?:x\s*|\b)(\d+)/g;
                const matches = line.match(regex)
                if (matches?.length) {
                    const values = matches
                        .map(val => val.trim().replace('x', ''))
                        .map(value => Number(value))
                        .filter(val => !isNaN(val))
                    values.sort((a, b) => a - b)
                    if (values.length) {
                        if (values.length > 1) {
                            this.variant.leverMin = values.shift()
                            this.variant.leverMax = values.pop()
                        } else {
                            this.variant.leverMin = values[0]
                            this.variant.leverMax = values[0]
                        }
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
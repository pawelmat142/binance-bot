import { TakeProfit, TradeVariant } from "../../../binance/model/trade-variant";
import { TPUtil } from "../../../binance/utils/take-profit-util";
import { TradeUtil } from "../../../binance/utils/trade-util";
import { BaseSignalValidator } from "../base-signal-validator";
import { SignalValidator } from "../signal-validator";
import { ValidatorUtil } from "../validator.util";

// EXAMPLE
// AVAX/USDT: BUY

// Entry: 28.73

// SL: 27.97

// TP: 29.44
// TP: 30.88

// Leverage: 20X

export class CryptoHunterSignalValidator extends BaseSignalValidator implements SignalValidator {

    override valid(): boolean {
        if (!this.variant.symbol) {
            this.addError("Missing symbol")
            return false
        }
        if (!this.variant.side) {
            this.addError("Missing side")
            return false
        }
        if (!this.variant.entryZoneStart || !this.variant.entryZoneEnd) {
            this.addError("Missing entry zone")
            return false
        }
        if (!this.variant.stopLoss) {
            this.addError("Missing stop loss")
            return false
        }
        if (!this.variant.takeProfits.length) {
            this.addError("Missing take profits")
            return false
        }
        if (!this.variant.leverMin || !this.variant.leverMax) {
            this.addError("Missing lever")
            return false 
        }
        return true
    }

    override validate(): void {
        this.addLog(`[START] ${this.constructor.name}`)

        this.processValidation()
        this.signal.valid = this.valid()
        this.signal.variant = this.variant as TradeVariant

        this.addLog(`[STOP] ${this.constructor.name}`)
    }

    private sideAndSymbolLineIndex = -1
    private entryZoneLineIndex = -1
    private stopLossLineIndex = -1
    private takeProfitLineIndex = -1
    private leverLineIndex = -1

    private processValidation() {
        for(let i=0; i < this.lines.length; i++) {
            if (!this.lines[i]) continue
            this.findSignalSideAndSymbol(i)
            this.findEntryZone(i)
            this.findStopLoss(i)
            this.findTakeProfits(i)
            this.findLever(i)
        }
    }


    // SYMBOL SIDE
    private findSignalSideAndSymbol(lineIndex: number) {
        if (this.sideAndSymbolLineIndex !== -1) {
            return
        }
        const line = this.lines[lineIndex]

        const isBuy = ValidatorUtil.isBuy(line)
        const isSell = ValidatorUtil.isSell(line)

        if (ValidatorUtil.isUsdt(line)) {
            if (isBuy && !isSell) {
                this.variant.side = 'BUY'
                this.sideAndSymbolLineIndex = lineIndex
                this.findSymbol(line)
            } 
            else if (!isBuy && isSell) {
                this.variant.side = 'SELL'
                this.sideAndSymbolLineIndex = lineIndex
                this.findSymbol(line)
            }
        }
    }

    private findSymbol(line: string): void {
        const split = line.split(' ')
        if (split.length) {
            const token = ValidatorUtil.removeNonCharacters(split[0].replace('usdt', ''))
            if (token) {
                const symbol = TradeUtil.getSymbolByToken(token)
                if (symbol) {
                    this.variant.symbol = symbol
                }
            }
        }
    }


    // ENTRY ZONE
    private findEntryZone(lineIndex: number) {
        if (this.entryZoneLineIndex !== -1) {
            return
        }
        const line = this.lines[lineIndex]
        if (line.includes('entry')) {
            const value = this.findNumberValue(line)
            if (!isNaN(value)) {
                this.entryZoneLineIndex = lineIndex
                this.variant.entryZoneStart = value
                this.variant.entryZoneEnd = value
            }
        }
    }

    // STOP LOSS
    private findStopLoss(lineIndex: number): void  {
        if (this.stopLossLineIndex !== -1) {
            return
        }
        const line = this.lines[lineIndex]
        if (line.includes('sl')) {
            const value = this.findNumberValue(line)
            if (!isNaN(value)) {
                this.stopLossLineIndex = lineIndex
                this.variant.stopLoss = value
            }
        }
    }

    // TAKE PROFIT
    private findTakeProfits(lineIndex: number): void {
        if (this.takeProfitLineIndex !== -1) {
            return  
        }
        const value = this.findTakeProfitValue(lineIndex)
        if (value) {
            this.takeProfitLineIndex = lineIndex
            this.addTakeProfit(value)
            this.findNextTakeProfits()
            TPUtil.calculatePercentages(this.variant.takeProfits)
        }
    }

    private findNextTakeProfits(): void {
        let lineIndex = this.takeProfitLineIndex
        while (true) {
            lineIndex++
            console.log('lofindNextTakeProfitsop iteration ' + lineIndex)
            const value = this.findTakeProfitValue(lineIndex)
            if (value) {
                this.addTakeProfit(value)
            } else {
                break
            }
        }
    }

    private findTakeProfitValue(lineIndex: number): number {
        const line = this.lines[lineIndex]
        if (line.includes('tp')) {
            const value = this.findNumberValue(line)
            if (!isNaN(value)) {
                return value
            }
        }
        return 0
    }

    private addTakeProfit(value: number): void {
        const takeProfit: TakeProfit = {
            order: this.variant.takeProfits.length,
            price: value,
            closePercent: 0
        }
        this.signal.variant.takeProfits.push(takeProfit)
    }

    // LEVER
    private findLever(lineIndex: number) {
        if (this.leverLineIndex !== -1) {
            return
        }
        const line = this.lines[lineIndex]
        if (line.includes('lever')) {
            const value = this.findNumberValue(line)
            if (!isNaN(value)) {
                this.leverLineIndex = lineIndex
                this.signal.variant.leverMin = value
                this.signal.variant.leverMax = value
            }
        }
    }


    private findNumberValue(str: string) {
        // const regex = /-?\d+(\.\d+)?/;
        const regex = /[-+]?\d*[\.,]?\d+/g;
        const match = str.match(regex)
        if (match?.length) {
            const a = match[0]
            const b = a.replace(',', '.')
            return Number(b);
        }
    }
}
import { Logger } from "@nestjs/common";
import { CalculationsService } from "../../binance/calculations.service";
import { FuturesExchangeInfoSymbol } from "../../binance/model/model";
import Decimal from "decimal.js";
import { CalcUtil } from "../../binance/utils/calc-util";

export class Calculator<T> {

    protected readonly logger = new Logger(this.constructor.name)

    protected service: CalculationsService
    
    private _symbol: string

    protected symbolInfo: FuturesExchangeInfoSymbol
    protected minNotional: Decimal
    protected minQty: Decimal
    protected stepSize: Decimal
    protected tickSize: Decimal

    protected get symbol(): string {
        if (!this._symbol) throw new Error("Symbol not initialized")
        return this._symbol
    }


    constructor(service: CalculationsService, symbol: string) {
        this.service = service

        this._symbol = symbol

        this.symbolInfo = this.service.getExchangeInfo(this.symbol)
        this.minNotional = CalcUtil.getMinNotional(this.symbolInfo)
        const { minQty, stepSize } = CalcUtil.getLotSize(this.symbolInfo)
        this.minQty = minQty 
        this.stepSize = stepSize
    }


    protected async calculate(): Promise<T> {
        throw new Error("not implemented")
    }


    protected fixPricePrecision(price: number) {
        return CalcUtil.fixPricePrecision(price, this.symbolInfo)
    }

    protected roundToTickSize(price: Decimal) {
        return CalcUtil.roundToTickSize(price, this.symbolInfo)
    }

}
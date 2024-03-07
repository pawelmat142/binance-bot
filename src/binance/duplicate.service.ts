import { Injectable } from "@nestjs/common";
import { FuturesResult } from "./model/trade";
import { UnitService } from "src/unit/unit.service";
import { Unit } from "src/unit/unit";
import { TelegramService } from "src/telegram/telegram.service";
import { TradeCtx } from "./model/trade-variant";

@Injectable()
export class DuplicateService {

    constructor(
        private readonly unitService: UnitService,
        private readonly telegramService: TelegramService,
    ) {}

    filledOrderIdsPreventDuplicateStorafe: number[] = []

    public preventDuplicate(eventTradeResult: FuturesResult, unit: Unit): boolean {
        const orderId = eventTradeResult.orderId
        if (this.filledOrderIdsPreventDuplicateStorafe.includes(eventTradeResult.orderId)) {
            const message = `Prevented duplicate  ${eventTradeResult.side} ${eventTradeResult.symbol},orderId: ${orderId}`
            this.unitService.addLog(unit, message)
            this.telegramService.sendUnitMessage(new TradeCtx({trade: null, unit: unit}), [message])
            return true
        }
        this.filledOrderIdsPreventDuplicateStorafe.push(eventTradeResult.orderId)
        if (this.filledOrderIdsPreventDuplicateStorafe.length > 50) {
            this.filledOrderIdsPreventDuplicateStorafe.unshift()
        }
        return false
    }
}
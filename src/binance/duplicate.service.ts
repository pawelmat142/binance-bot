import { Injectable, Logger } from "@nestjs/common";
import { FuturesResult } from "./model/trade";
import { Unit } from "../unit/unit";

@Injectable()
export class DuplicateService {

    private readonly logger = new Logger(DuplicateService.name)

    filledOrderIdsPreventDuplicateStorage: string[] = []

    public preventDuplicate(eventTradeResult: FuturesResult, unit: Unit): boolean {
        const orderId = eventTradeResult.orderId.toString()
        if (this.filledOrderIdsPreventDuplicateStorage.includes(orderId)) {
            this.logger.warn(`Prevented duplicate  ${eventTradeResult.side} ${eventTradeResult.symbol}, orderId: ${orderId}, unit: ${unit.identifier}`)
            return true
        }
        this.filledOrderIdsPreventDuplicateStorage.push(orderId)
        if (this.filledOrderIdsPreventDuplicateStorage.length > 50) {
            this.filledOrderIdsPreventDuplicateStorage.unshift()
        }
        return false
    }
}
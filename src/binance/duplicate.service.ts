import { Injectable, Logger } from "@nestjs/common";
import { FuturesResult, Trade } from "./model/trade";
import { Unit } from "../unit/unit";
import { TradeCtx } from "./model/trade-variant";
import { TradeRepository } from "./trade.repo";
import { TradeUtil } from "./utils/trade-util";
import { TradeService } from "./trade.service";
import { Position } from "./wizard-binance.service";

@Injectable()
export class DuplicateService {

    private readonly logger = new Logger(DuplicateService.name)

    constructor(
        private readonly tradeRepo: TradeRepository,
        private readonly tradeService: TradeService,
    ){}

    private filledOrderIdsPreventDuplicateStorage: string[] = []

    public preventDuplicate(eventTradeResult: FuturesResult, unit: Unit): boolean {
        const orderId = eventTradeResult?.orderId.toString()
        // TODO temporarry logs
        this.logger.warn(`filledOrderIdsPreventDuplicateStorage:`)
        this.logger.warn(`${this.filledOrderIdsPreventDuplicateStorage.join(', ')}`)
        if (this.filledOrderIdsPreventDuplicateStorage.includes(orderId)) {
            this.logger.warn(`Prevented duplicate ${eventTradeResult.side} ${eventTradeResult.symbol}, orderId: ${orderId}, unit: ${unit.identifier}`)
            return true
        }
        this.filledOrderIdsPreventDuplicateStorage.push(orderId)
        if (this.filledOrderIdsPreventDuplicateStorage.length > 100) {
            this.filledOrderIdsPreventDuplicateStorage.unshift()
        }
        return false
    }


    public async preventDuplicateTradeInProgress(ctx: TradeCtx): Promise<boolean> {
        if (process.env.SKIP_PREVENT_DUPLICATE === 'true') {
            this.logger.warn('SKIP PREVENT DUPLICATE TRADE IN PROGRESS')
            return false
        } 

        const trade = await this.tradeRepo.findInProgress(ctx)

        if (trade) {

            const position = await this.fetchPosition(ctx.unit, trade)

            if (position) {
                if (Number(position.positionAmt) !== 0) {
                    TradeUtil.addWarning(`Prevented duplicate trade, found objectId: ${trade._id}`, ctx, this.logger)
                    return true
                }
            }

            TradeUtil.addWarning(`not Prevented duplicate trade. Found trade but position is empty`, ctx, this.logger)
            
            const result = await this.tradeRepo.closeTradeManual(new TradeCtx({ unit: ctx.unit, trade }))
            if (result?.matchedCount) {
                TradeUtil.addWarning(`closed ${result.matchedCount} trades without position reference`, ctx, this.logger)
            }
        }

        return false
    }

    private async fetchPosition(unit: Unit, trade: Trade): Promise<Position> {
        const fakeCtx = new TradeCtx({ unit, trade})
        return this.tradeService.fetchPosition(fakeCtx)
    }

}
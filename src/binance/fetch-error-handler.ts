import { Logger } from "@nestjs/common"
import { CalculationsService } from "./calculations.service"
import { TradeCtx } from "./model/trade-variant"
import { TradeUtil } from "./trade-util"

export class FetchErrorHandler {

    protected readonly logger = new Logger(CalculationsService.name)

    
    protected handleFetchError(error, msg?: string, ctx?: TradeCtx) {
        if (msg) {
            this.logger.error(msg)
        }
        if (ctx) {
            TradeUtil.addError(error, ctx, this.logger)
        } else {
            this.logger.error(error)
        }
    }
}
import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Trade } from "./model/trade";
import { Model } from "mongoose";
import { TradeService } from "./trade.service";

@Injectable()
export class WizardBinanceService {

    private readonly logger = new Logger(WizardBinanceService.name)

    constructor(
        @InjectModel(Trade.name) private tradeModel: Model<Trade>,
        private readonly tradeService: TradeService,
    ) {}


    public async fetchTrades() {
        
    }

}
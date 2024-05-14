import { Injectable } from "@nestjs/common";
import { BinanceService } from "src/binance/binance.service";
import { TradeService } from "src/binance/trade.service";
import { WizardBinanceService } from "src/binance/wizard-binance.service";
import { SignalService } from "src/signal/signal.service";
import { UnitService } from "src/unit/unit.service";

@Injectable()
export class ServiceProfivder {
    
    constructor(
        public readonly unitService: UnitService,
        public readonly binanceServie: BinanceService,
        public readonly binance: WizardBinanceService,
        public readonly signalService: SignalService,
        public readonly tradeService: TradeService,
    ) {}

}
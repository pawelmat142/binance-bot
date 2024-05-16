import { Injectable } from "@nestjs/common";
import { BinanceService } from "src/binance/binance.service";
import { Trade } from "src/binance/model/trade";
import { TradeService } from "src/binance/trade.service";
import { WizardBinanceService } from "src/binance/wizard-binance.service";
import { SignalService } from "src/signal/signal.service";
import { UnitService } from "src/unit/unit.service";
import { SelectedTradeProvider } from "./selected-trade.service";
import { TradeRepository } from "src/binance/trade.repo";

@Injectable()
export class ServiceProvider {
    
    constructor(
        public readonly unitService: UnitService,
        public readonly binanceServie: BinanceService,
        public readonly binance: WizardBinanceService,
        public readonly signalService: SignalService,
        public readonly tradeService: TradeService,
        public readonly selectedTradeService: SelectedTradeProvider,
    ) {}

}
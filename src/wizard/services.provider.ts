import { Injectable } from "@nestjs/common";
import { BinanceService } from "../binance/binance.service";
import { TradeService } from "../binance/trade.service";
import { WizardBinanceService } from "../binance/wizard-binance.service";
import { Http } from "../global/http/http.service";
import { SignalService } from "../signal/signal.service";
import { UnitService } from "../unit/unit.service";
import { SelectedTradeProvider } from "./selected-trade.service";
import { TakeProfitsService } from "../binance/take-profits.service";

@Injectable()
export class ServiceProvider {
    
    constructor(
        public readonly unitService: UnitService,
        public readonly binanceServie: BinanceService,
        public readonly binance: WizardBinanceService,
        public readonly signalService: SignalService,
        public readonly tradeService: TradeService,
        public readonly selectedTradeService: SelectedTradeProvider,
        public readonly takeProfitsService: TakeProfitsService,
        public readonly http: Http,
    ) {}

}
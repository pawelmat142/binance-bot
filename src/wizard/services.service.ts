import { Injectable } from "@nestjs/common";
import { BinanceService } from "src/binance/binance.service";
import { SignalService } from "src/signal/signal.service";
import { UnitService } from "src/unit/unit.service";

@Injectable()
export class ServicesService {
    
    constructor(
        public readonly unitService: UnitService,
        public readonly binanceServie: BinanceService,
    ) {}

}
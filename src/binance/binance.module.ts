import { Module } from '@nestjs/common';
import { BinanceService } from './binance.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Trade, TradeSchema } from './model/trade';
import { ConfigModule } from '@nestjs/config';
import { AppHttpModule } from '../global/http/http.module';
import { SignalModule } from '../signal/signal.module';
import { AppTelegramModule } from '../telegram/telegram.module';
import { UnitModule } from '../unit/unit.module';
import { AutoCloseService } from './auto-close.service';
import { CalculationsService } from './calculations.service';
import { DuplicateService } from './duplicate.service';
import { MultiOrderService } from './multi-order.service';
import { TradeRepository } from './trade.repo';
import { TradeService } from './trade.service';
import { WizardBinanceService } from './wizard-binance.service';

@Module({
  imports: [
    AppTelegramModule,
    SignalModule,
    UnitModule,
    AppHttpModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'config/trade-units.json',
    }),
    MongooseModule.forFeature([, {
      name: Trade.name,
      schema: TradeSchema,
    }, {
      name: Trade.testName,
      schema: TradeSchema,
    }]),
  ],
  providers: [
    BinanceService, 
    CalculationsService, 
    TradeService, 
    WizardBinanceService, 
    DuplicateService, 
    TradeRepository, 
    AutoCloseService,
    MultiOrderService,
  ],
  exports: [
    BinanceService,
    TradeService,
    WizardBinanceService,
  ]
})
export class BinanceModule {}

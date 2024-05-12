import { Module } from '@nestjs/common';
import { BinanceService } from './binance.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Trade, TradeSchema } from './model/trade';
import { ConfigModule } from '@nestjs/config';
import { AppTelegramModule } from 'src/telegram/telegram.module';
import { CalculationsService } from './calculations.service';
import { SignalModule } from 'src/signal/signal.module';
import { TradeService } from './trade.service';
import { UnitModule } from 'src/unit/unit.module';
import { WizardBinanceService } from './wizard-binance.service';
import { DuplicateService } from './duplicate.service';
import { TradeRepository } from './trade.repo';

@Module({
  imports: [
    AppTelegramModule,
    SignalModule,
    UnitModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'config/trade-units.json',
    }),
    MongooseModule.forFeature([{
      name: Trade.name,
      schema: TradeSchema,
    }]),
  ],
  providers: [BinanceService, CalculationsService, TradeService, WizardBinanceService, DuplicateService, TradeRepository],
  exports: [BinanceService, TradeService, WizardBinanceService]
})
export class BinanceModule {}

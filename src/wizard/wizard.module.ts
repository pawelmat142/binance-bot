import { Module } from '@nestjs/common';
import { UnitModule } from 'src/unit/unit.module';
import { ServiceProvider } from './services.provider';
import { BinanceModule } from 'src/binance/binance.module';
import { AppTelegramModule } from 'src/telegram/telegram.module';
import { SignalModule } from 'src/signal/signal.module';
import { WizardService } from './wizard.service';
import { SelectedTradeProvider } from './selected-trade.service';

@Module({
  imports: [
    AppTelegramModule,
    UnitModule,
    BinanceModule,
    SignalModule
  ],
  providers: [
    ServiceProvider,
    WizardService,
    SelectedTradeProvider,
  ],
})
export class WizardModule {}

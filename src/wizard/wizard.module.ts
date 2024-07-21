import { Module } from '@nestjs/common';
import { BinanceModule } from '../binance/binance.module';
import { AppHttpModule } from '../global/http/http.module';
import { SignalModule } from '../signal/signal.module';
import { AppTelegramModule } from '../telegram/telegram.module';
import { UnitModule } from '../unit/unit.module';
import { SelectedTradeProvider } from './selected-trade.service';
import { ServiceProvider } from './services.provider';
import { WizardService } from './wizard.service';

@Module({
  imports: [
    AppTelegramModule,
    UnitModule,
    BinanceModule,
    SignalModule,
    AppHttpModule
  ],
  providers: [
    ServiceProvider,
    WizardService,
    SelectedTradeProvider,
  ],
})
export class WizardModule {}
import { Module } from '@nestjs/common';
import { WizardService } from './wizard.service';
import { TelegramBotService } from './telegram-bot.service';
import { UnitModule } from 'src/unit/unit.module';
import { ServicesService } from './services.service';
import { BinanceModule } from 'src/binance/binance.module';
import { AppTelegramModule } from 'src/telegram/telegram.module';
import { SignalModule } from 'src/signal/signal.module';

@Module({
  imports: [
    AppTelegramModule,
    UnitModule,
    BinanceModule,
    SignalModule
  ],
  providers: [
    WizardService,
    TelegramBotService,
    ServicesService,
  ],
  exports: [
    TelegramBotService
  ]
})
export class WizardModule {}

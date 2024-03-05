import { Module } from '@nestjs/common';
import { WizardService } from './wizard.service';
import { BotWizardService } from './bot-wizard.service';
import { UnitModule } from 'src/unit/unit.module';
import { ServicesService } from './services.service';
import { BinanceModule } from 'src/binance/binance.module';
import { AppTelegramModule } from 'src/telegram/telegram.module';

@Module({
  imports: [
    AppTelegramModule,
    UnitModule,
    BinanceModule
  ],
  providers: [
    WizardService,
    BotWizardService,
    ServicesService,
  ],
  exports: [
    BotWizardService
  ]
})
export class WizardModule {}

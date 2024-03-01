import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { ConfigModule } from '@nestjs/config';
import { BotService } from './bot.service';
import { UnitModule } from 'src/unit/unit.module';

@Module({
  imports: [
    UnitModule,
    ConfigModule.forRoot(),
  ],
  providers: [
    TelegramService,
    BotService,
  ],
  exports: [
    TelegramService,
  ]
})
export class AppTelegramModule {}

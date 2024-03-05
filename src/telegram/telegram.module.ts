import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot(),
  ],
  providers: [
    TelegramService,
  ],
  exports: [
    TelegramService,
  ]
})
export class AppTelegramModule {}

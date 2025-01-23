import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { ConfigModule } from '@nestjs/config';
import { MtProtoService } from './mt-proto.service';

@Module({
  imports: [
    ConfigModule.forRoot(),
  ],
  providers: [
    TelegramService,
    MtProtoService
  ],
  exports: [
    TelegramService,
    MtProtoService
  ]
})
export class AppTelegramModule {}

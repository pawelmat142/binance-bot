import { Module } from '@nestjs/common';
import { SignalService } from './signal.service';
import { MongooseModule } from '@nestjs/mongoose';
import { AppHttpModule } from '../global/http/http.module';
import { AppTelegramModule } from '../telegram/telegram.module';
import { Signal, SignalSchema } from './signal';

@Module({
  imports: [
    AppTelegramModule,
    MongooseModule.forFeature([{
      name: Signal.name,
      schema: SignalSchema,
    }]),
    AppHttpModule,
  ],
  providers: [SignalService],
  exports: [SignalService]
})
export class SignalModule {}

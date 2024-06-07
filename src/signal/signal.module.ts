import { Module } from '@nestjs/common';
import { SignalService } from './signal.service';
import { MongooseModule } from '@nestjs/mongoose';
import { AppTelegramModule } from 'src/telegram/telegram.module';
import { Signal, SignalSchema } from './signal';
import { AppHttpModule } from 'src/global/http/http.module';

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

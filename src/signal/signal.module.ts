import { Module } from '@nestjs/common';
import { SignalService } from './signal.service';
import { MongooseModule } from '@nestjs/mongoose';
import { AppTelegramModule } from 'src/telegram/telegram.module';
import { Signal, SignalSchema } from './signal';

@Module({
  imports: [
    AppTelegramModule,
    MongooseModule.forFeature([{
      name: Signal.name,
      schema: SignalSchema,
    }]),
  ],
  providers: [SignalService],
  exports: [SignalService]
})
export class SignalModule {}

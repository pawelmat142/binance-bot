import { Module } from '@nestjs/common';
import { SignalService } from './signal.service';
import { MongooseModule } from '@nestjs/mongoose';
import { SignalMessage, SignalMessageSchema } from './signal-message';
import { AppTelegramModule } from 'src/telegram/telegram.module';

@Module({
  imports: [
    AppTelegramModule,
    MongooseModule.forFeature([{
      name: SignalMessage.name,
      schema: SignalMessageSchema,
    }]),
  ],
  providers: [SignalService],
  exports: [SignalService]
})
export class SignalModule {}

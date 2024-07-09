import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SignalModule } from './signal/signal.module';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BinanceModule } from './binance/binance.module';
import { AppTelegramModule } from './telegram/telegram.module';
import { UnitModule } from './unit/unit.module';
import { WizardModule } from './wizard/wizard.module';
import { AppHttpModule } from './global/http/http.module';

@Module({
  imports: [
    BinanceModule,
    AppTelegramModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'config/trade-units.json',
    }),
    SignalModule,
    ConfigModule.forRoot(),
    MongooseModule.forRoot(process.env.MONGO_URI, {
      // useNewUrlParser: true,
      // useUnifiedTopology: true
    }),

    UnitModule,
    WizardModule,
    AppHttpModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

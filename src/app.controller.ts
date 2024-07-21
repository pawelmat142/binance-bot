import { Body, Controller, Get, Logger, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { TelegramMessage } from './telegram/message';
import { SignalService } from './signal/signal.service';

@Controller()
export class AppController {

  private readonly logger = new Logger(AppController.name)

  constructor(
    private readonly appService: AppService,
    private readonly signalService: SignalService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // SIGNALS INPUT
  @Post('/signal/telegram')
  postTelegramMessage(@Body() body: TelegramMessage) {
    return this.signalService.onReceiveTelegramMessage(body)
  }

}

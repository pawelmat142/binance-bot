import { Body, Controller, Get, Logger, Param, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { SignalService } from './signal/signal.service';
import { TelegramMessage } from './telegram/message';

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
    // TODO 
    this.logger.warn(`MOCKED RECEIVE SIGNAL MESSAGE!!`)
    // return this.signalService.onReceiveTelegramMessage(body)
  }
  
  // LOGS
  @Get('/signal/list')
  listSignals() {
    return this.signalService.list()
  }

}

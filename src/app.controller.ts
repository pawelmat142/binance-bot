import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { SignalService } from './signal/signal.service';
import { TelegramMessage } from './telegram/message';
import { BinanceService } from './binance/binance.service';

@Controller()
export class AppController {

  constructor(
    private readonly appService: AppService,
    private readonly signalService: SignalService,
    private readonly binanceService: BinanceService,
  ) {}


  @Get('/test')
  test() {
    // this.binanceService.testTrade()
    return this.signalService.testOnReceiveMessage()
  }


  @Get()
  getHello(): string {
    return this.appService.getHello();
  }


  // TELEGRAM
  @Post('/signal/telegram')
  postTelegramMessage(@Body() body: TelegramMessage) {
    return this.signalService.onReceiveTelegramMessage(body)
  }
  



  // LOGS
  @Get('/signal/list')
  listSignals() {
    return this.signalService.list()
  }

  @Get('/signal/list-valid')
  listValidSignals() {
    return this.signalService.listValid()
  }

  @Get('/trade/list')
  listTrades() {
    return this.binanceService.listTrades()
  }


  // FUTURES
  @Get('/futures/test')
  testFutures() {
    return this.binanceService.testTakeProfit()
  }

}

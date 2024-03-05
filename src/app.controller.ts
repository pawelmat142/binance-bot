import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { SignalService } from './signal/signal.service';
import { TelegramMessage } from './telegram/message';
import { BinanceService } from './binance/binance.service';
import { TradeUtil } from './binance/trade-util';

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


  @Get('/convert-bnb-msg')
  convertBinanceMessageToTradeEvent() {
    const tradeEvent = `
    {"e":"ORDER_TRADE_UPDATE","T":1709228306018,"E":1709228306019,"o":{"s":"SEIUSDT","c":"w9M1Sao5kbDXw7fnCVd097","S":"SELL","o":"MARKET","f":"GTC","q":"53","p":"0","ap":"0.8500000","sp":"0.8500000","x":"TRADE","X":"FILLED","i":3026735289,"l":"53","z":"53","L":"0.8500000","n":"0.02252500","N":"USDT","T":1709228306018,"t":148502631,"b":"0","a":"0","m":false,"R":false,"wt":"CONTRACT_PRICE","ot":"STOP_MARKET","ps":"BOTH","cp":false,"rp":"-2.55990000","pP":false,"si":0,"ss":0,"V":"NONE","pm":"NONE","gtd":0}}
    `
   return TradeUtil.parseToFuturesResult(JSON.parse(tradeEvent))
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

}

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
    const tradeEvent = `{"e":"ORDER_TRADE_UPDATE","T":1709220138458,"E":1709220138459,"o":{"s":"SEIUSDT","c":"p2GMXdRRegAV7JIN2WrQVw","S":"BUY","o":"MARKET","f":"GTC","q":"445","p":"0","ap":"0.8983000","sp":"0","x":"TRADE","X":"PARTIALLY_FILLED","i":3026735151,"l":"11","z":"392","L":"0.8983000","n":"0.00494065","N":"USDT","T":1709220138458,"t":148318954,"b":"0","a":"0","m":false,"R":false,"wt":"CONTRACT_PRICE","ot":"MARKET","ps":"BOTH","cp":false,"rp":"0","pP":false,"si":0,"ss":0,"V":"NONE","pm":"NONE","gtd":0}}`
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

import { Injectable, Logger } from '@nestjs/common';
import { TradeUtil } from './trade-util';
import { getHeaders, queryParams, sign } from 'src/global/util';
import { isBinanceError } from './model/binance.error';
import { FuturesResult, TradeStatus } from './model/trade';
import { TradeCtx, TakeProfit, TradeContext } from './model/trade-variant';
import { CalculationsService } from './calculations.service';
import { TradeType } from './model/model';
import { UnitService } from 'src/unit/unit.service';
import Decimal from 'decimal.js';
import { timeStamp } from 'console';
import { HttpMethod } from 'src/global/http-method';
import { take } from 'rxjs';

@Injectable()
export class TradeService {

    private readonly logger = new Logger(TradeService.name)

    private readonly testNetwork = process.env.BINANCE_TEST_NETWORK === 'true'

    constructor(
    ) {}

    public async openPosition(ctx: TradeCtx) {

        if (TradeUtil.priceInEntryZone(ctx)) {
            await this.tradeRequestMarket(ctx)
        } else {
            await this.tradeRequestLimit(ctx)
        }
        const status = ctx.trade.futuresResult?.status
        if (TradeStatus.FILLED === status) {
            TradeUtil.addLog(`Opened position with status: ${status}, executedQty: ${ctx.trade.futuresResult.executedQty}`, ctx, this.logger)
        } else if (TradeStatus.NEW === status) {
            TradeUtil.addLog(`Opened position with status: ${status}, origQty: ${ctx.trade.futuresResult.origQty}`, ctx, this.logger)
        } else {
            TradeUtil.addError(`Wrong trade status! ${status}`, ctx, this.logger)
        }
    }

    private async tradeRequestMarket(ctx: TradeCtx): Promise<void> {
        const params = TradeUtil.tradeRequestMarketParams(ctx.trade)
        const result = await this.placeOrder(params, ctx)
        ctx.trade.timestamp = new Date()
        ctx.trade.futuresResult = result
        if (this.testNetwork) {
            ctx.trade.futuresResult.executedQty = ctx.trade.quantity.toString()
            ctx.trade.futuresResult.status = 'FILLED'
        }
        this.verifyExecutedQuantity(ctx)
    }

    private async tradeRequestLimit(ctx: TradeCtx): Promise<void> {
        const params = TradeUtil.tradeRequestLimitParams(ctx.trade)
        const result = await this.placeOrder(params, ctx)
        ctx.trade.timestamp = new Date()
        ctx.trade.futuresResult = result
        if (this.testNetwork) {
            ctx.trade.futuresResult.executedQty = ctx.trade.quantity.toString()
            ctx.trade.futuresResult.status = 'NEW'
        }
        this.verifyExecutedQuantity(ctx)
    }

    private verifyExecutedQuantity(ctx: TradeCtx) {
        if (ctx.trade.futuresResult.status !== 'FILLED') {
            return
        }
        if (!ctx.executedQuantity.equals(new Decimal(ctx.trade.quantity))) {
            TradeUtil.addWarning(`executedQuantity ${ctx.executedQuantity} != quantity ${ctx.trade.quantity}`, ctx, this.logger)
        }
    }

    public async stopLossRequest(ctx: TradeCtx): Promise<void> {
        if (!ctx.trade.variant.stopLoss) {
            return
        }
        const takeProfits = ctx.trade.variant.takeProfits ?? []
        let stopLossQuantity = new Decimal(ctx.executedQuantity)
        for (let takeProfit of takeProfits) {
            const executedTakeProfitQuantity = Number(takeProfit.reuslt?.executedQty)
            if (!isNaN(executedTakeProfitQuantity)) {
                stopLossQuantity = stopLossQuantity.minus(new Decimal(executedTakeProfitQuantity))
            }
        }

        const stopLossPrice = this.getStopLossPrice(ctx)
        const params = TradeUtil.stopLossRequestParams(ctx, stopLossQuantity, stopLossPrice)
        const result = await this.placeOrder(params, ctx)
        ctx.trade.stopLossTime = new Date()
        ctx.trade.stopLossResult = result

        if (this.testNetwork) {
            ctx.trade.stopLossResult.executedQty = ctx.trade.quantity.toString()
            ctx.trade.stopLossResult.status = 'NEW'
        }
        TradeUtil.addLog(`Placed stop loss order with quantity: ${ctx.trade.stopLossResult.origQty}, price: ${stopLossPrice}`, ctx, this.logger)
    }

    private getStopLossPrice(ctx: TradeCtx): number {
        const lastFilledTakeProfit = TradeUtil.lastFilledTakeProfit(ctx)
        if (lastFilledTakeProfit) {
            const order = lastFilledTakeProfit.order
            if (order === 0) {
                const entryPrice = Number(ctx.trade.futuresResult.price)
                if (!isNaN(entryPrice)) {
                    return entryPrice
                }
            }
            if (order > 0) {
                const stopLossPrice = ctx.trade.variant.takeProfits[order-1].price
                if (!isNaN(stopLossPrice)) {
                    return stopLossPrice
                }
            }
        }
        return ctx.trade.variant.stopLoss
    }


    public async updateStopLoss(ctx: TradeCtx): Promise<void> {
        await this.closeStopLoss(ctx)
        await this.stopLossRequest(ctx)
    }

    public async closeStopLoss(ctx: TradeCtx): Promise<void> {
        const trade = ctx.trade
        const stopLossOrderId = trade.stopLossResult?.orderId
        if (!stopLossOrderId) throw new Error(`Could not find SL result in found trade ${trade._id}`)
        trade.stopLossResult = await this.closeOrder(ctx, stopLossOrderId)
        TradeUtil.addLog(`Closed stop loss for trade: ${trade._id}`, ctx, this.logger)
    }

    public async takeProfitRequests(ctx: TradeCtx) {
        if (!ctx.executedQuantity.equals(new Decimal(ctx.takeProfitQuentitesSum))) {
            TradeUtil.addWarning(`takeProfitQuentitesSum ${ctx.takeProfitQuentitesSum} !== executedQuantity ${ctx.executedQuantity}`, ctx, this.logger)
            await this.takeProfitRequest(ctx, ctx.trade?.variant?.takeProfits[0], ctx.executedQuantity.toNumber())
        } else {
            for (let tp of ctx.trade?.variant?.takeProfits ?? []) {
                await this.takeProfitRequest(ctx, tp)
            }
        }
    }



    public async openNextTakeProfit(ctx: TradeCtx) {
        const takeProfits = ctx.trade.variant.takeProfits
        const lastFilledTakeProfit = TradeUtil.lastFilledTakeProfit(ctx)
        const nextTakeProfitOrder = lastFilledTakeProfit ? lastFilledTakeProfit.order+1 : 0
        if (takeProfits.length > nextTakeProfitOrder) {
            const nextTakeProfit = takeProfits.find(t => t.order === nextTakeProfitOrder)
            if (!nextTakeProfit?.reuslt && Number(nextTakeProfit.quantity)) {
                await this.takeProfitRequest(ctx, nextTakeProfit)
            }
        }
    }

    public closeOrder(ctx: TradeCtx, orderId: number) {
        const params = queryParams({
            symbol: ctx.symbol,
            orderId: orderId,
            timestamp: Date.now(),
            timeInForce: 'GTC',
            recvWindow: 15000
        })
        return this.placeOrder(params, ctx, 'DELETE')
    }


    private async takeProfitRequest(ctx: TradeCtx, takeProfit: TakeProfit, forcedQuantity?: number): Promise<void> {
        const quantity = forcedQuantity ?? takeProfit.quantity
        if (this.takeProfitQuantitiesFilled(ctx) || !quantity) {
            return
        }
        const params = TradeUtil.takeProfitRequestParams(ctx, takeProfit.price, quantity)
        const result = await this.placeOrder(params, ctx)
        takeProfit.reuslt = result
        takeProfit.resultTime = new Date()
        if (this.testNetwork) {
            takeProfit.reuslt.executedQty = ctx.trade.quantity.toString()
            takeProfit.reuslt.status = 'NEW'
        }
        TradeUtil.addLog(`Placed take profit order for tp: ${takeProfit.order} with quantity: ${result.origQty}`, ctx, this.logger)
    }

    private takeProfitQuantitiesFilled(ctx: TradeCtx): boolean {
        if (ctx.executedQuantity.equals(new Decimal(ctx.takeProfitExecutedQuentitesSum))) {
            return true
        } else if (new Decimal(ctx.takeProfitQuentitesSum).greaterThan(ctx.executedQuantity)) {
            throw new Error(`Take profit quantities sum > executedQuantity`)
        }
        return false
    }


    public async setPositionLeverage(ctx: TradeCtx) {
        const lever = TradeUtil.getLever(ctx).toNumber()
        const params = queryParams({
            symbol: ctx.trade.variant.symbol,
            leverage: lever,
            timestamp: Date.now(),
            timeInForce: 'GTC',
        })
        const request = await fetch(this.signUrlWithParams(`/leverage`, ctx, params), {
            method: 'POST',
            headers: getHeaders(ctx.unit)
        })
        const response: FuturesResult = await request.json()
        if (isBinanceError(response)) {
            throw new Error(response.msg)
        }
        TradeUtil.addLog(`Leverage is set to ${lever}x for symbol: ${ctx.trade.variant.symbol}`, ctx, this.logger)
    } 


    private async placeOrder(params: string, ctx: TradeCtx, method?: HttpMethod): Promise<FuturesResult> {
        const path = this.testNetwork ? '/order/test' : '/order'
        const request = await fetch(this.signUrlWithParams(path, ctx, params), {
            method: method ?? 'POST',
            headers: getHeaders(ctx.unit)
        })
        const response: FuturesResult = await request.json()
        if (isBinanceError(response)) {
            throw new Error(response.msg)
        }
        return response
    }


    private signUrlWithParams(urlPath: string, tradeContext: TradeContext, params: string): string {
        const url = `${TradeUtil.futuresUri}${urlPath}`
        return sign(url, params, tradeContext.unit)
    }




// BATCH ORDER!!!!!!!
//     const crypto = require('crypto');
// const https = require('https');

// const apiKey = 'your-api-key';
// const secret = 'your-secret-key';

// const data = {
//   batchOrders: [
//     // Your orders here
//   ]
// };

// const queryString = `batchOrders=${encodeURIComponent(JSON.stringify(data.batchOrders))}&timestamp=${Date.now()}`;
// const signature = crypto.createHmac('sha256', secret).update(queryString).digest('hex');

// const options = {
//   hostname: 'fapi.binance.com',
//   port: 443,
//   path: `/dapi/v1/batchOrders?${queryString}&signature=${signature}`,
//   method: 'POST',
//   headers: {
//     'X-MBX-APIKEY': apiKey
//   }
// };

// const req = https.request(options, (res) => {

//   res.on('data', (d) => {
//     process.stdout.write(d);
//   });
// });

// req.on('error', (error) => {
// });

// req.end();












    // async function sendRequest(path: string, data: any) {
    //     const queryString = new URLSearchParams({ ...data, timestamp: Date.now() }).toString()
    //     const signature = createSignature(queryString)
      
    //     const options = {
    //       hostname: 'fapi.binance.com',
    //       port: 443,
    //       path: `${path}?${queryString}&signature=${signature}`,
    //       method: 'POST',
    //       headers: {
    //         'X-MBX-APIKEY': apiKey,
    //       },
    //     }
      
    //     return new Promise((resolve, reject) => {
    //       const req = https.request(options, (res) => {
    //         res.on('data', (d) => {
    //           resolve(d)
    //         })
    //       })
      
    //       req.on('error', (error) => {
    //         reject(error)
    //       })
      
    //       req.end()
    //     })
    //   }


    //   // Ustaw dźwignię dla symbolu
    //   await sendRequest('/fapi/v1/leverage', { symbol, leverage })
      
    //   // Rozpocznij transakcję
    //   const order = await sendRequest('/fapi/v1/order', { symbol, side: 'BUY', type: 'LIMIT', timeInForce: 'GTC', quantity, price: entryPrice })
      
    //   // Ustaw zlecenia stop loss i take profit
    //   for (const tp of takeProfits) {
    //     const quantity = order.executedQty * tp.quantityPercent
    //     await sendRequest('/fapi/v1/order', { symbol, side: 'SELL', type: 'TAKE_PROFIT_MARKET', quantity, stopPrice: tp.price })
    //   }
    //   await sendRequest('/fapi/v1/order', { symbol, side: 'SELL', type: 'STOP_MARKET', quantity: order.executedQty, stopPrice: stopLoss })

}

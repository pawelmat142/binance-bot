import { Injectable } from "@nestjs/common";
import { BinanceFuturesAccountInfo } from "./wizard-binance.service";
import { Unit } from "../unit/unit";
import { Http } from "../global/http/http.service";
import { Util } from "./utils/util";
import { TradeUtil } from "./utils/trade-util";
import { IncomeRecord, Period } from "./model/model";



@Injectable()
export class StatisticsBinanceService {

    constructor(
        private readonly http: Http,
    ) {}

    public async getIncomes(unit: Unit, period: Period, incomeType?: string): Promise<IncomeRecord[]> {
        const params = {
            timestamp: Date.now(),
            startTime: period.from,
            endTime: period.to,
            limit: 1000,
        }
        if (incomeType) {
            params['incomeType'] = incomeType
        }
        const incomes = await this.http.fetch<IncomeRecord[]>({
            url: Util.sign(`${TradeUtil.futuresUri}/income`, params, unit),
            method: 'GET',
            headers: Util.getHeaders(unit)
        })
        return incomes
    }


    public async getAccount(unit: Unit): Promise<object> {
        const params = {
            timestamp: Date.now()
        }
        const account = await this.http.fetch<object[]>({
            url: Util.sign(`${TradeUtil.futuresUriV2}/account`, params, unit),
            method: 'GET',
            headers: Util.getHeaders(unit)
        })
        return account
    }

    public async getBalance(unit: Unit): Promise<BinanceFuturesAccountInfo> {
        const params = {
            timestamp: Date.now()
        }
        const accountInfos = await this.http.fetch<BinanceFuturesAccountInfo[]>({
            url: Util.sign(`${TradeUtil.futuresUriV2}/balance`, params, unit),
            method: 'GET',
            headers: Util.getHeaders(unit)
        })
        return (accountInfos || []).find(info => info.asset === 'USDT')
    }




}
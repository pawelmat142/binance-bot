import { Injectable, Logger, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { Unit } from './unit';
import { Model } from 'mongoose';
import { getHeaders, newObjectId, queryParams, sign } from 'src/global/util';
import { TradeUtil } from 'src/binance/trade-util';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UnitUtil } from './unit.util';
import { WebSocket, Event, MessageEvent, CloseEvent, ErrorEvent, Data } from 'ws';
import { BinanceError } from 'src/binance/model/binance.error';
import { HttpMethod } from 'src/global/http-method';
import { BotUtil } from 'src/wizard/bot.util';
import { Http } from 'src/global/http/http.service';
import { ListeKeyResponse, TradeEventData } from 'src/binance/model/model';
import * as JSONbig from 'json-bigint';


@Injectable()
export class UnitService implements OnModuleInit {

    private readonly logger = new Logger(UnitService.name)

    constructor(
        @InjectModel(Unit.name) private unitModel: Model<Unit>,
        private readonly http: Http,
    ) {}

    private adminChannelIds = BotUtil.adminChannelIds()

    public isAdmin = (chatId: string): boolean => {
        return this.adminChannelIds.includes(chatId?.toString())
    }

    private _units$ = new BehaviorSubject<Unit[]>([])

    private tradeEventSubject$ = new Subject<TradeEventData>()

    public get tradeEventObservable$(): Observable<TradeEventData> {
        return this.tradeEventSubject$.asObservable()
    }

    onModuleInit() {
        this.initUnits()
        this._units$.subscribe(units => {
            this.logger.log(`Loaded ${units.length} units: [ ${units.map(u => u.identifier).join(', ')} ]`)
        })
    }

    @Cron(CronExpression.EVERY_DAY_AT_7AM)
    private async loadUnits() {
        const units = await this.unitModel.find({ active: true }, { 
            listenJsons: false,
            listenKey: false
        }).exec()

        if (Array.isArray(units)) {
            this._units$.next(units)
        }
    }

    private async initUnits() {
        await this.loadUnits()
        this.startListeningForEveryUnit()
    }

    @Cron(CronExpression.EVERY_30_MINUTES)
    private async keepAliveListenKeyForEveryUnit() {
        this.logger.warn('Refreshing listen keys')
        const units = await this.unitModel.find(
            { active: true, listenKey: { $exists: true } },
            { listenJsons: false, tradeObjectIds: false }).exec()

       await Promise.all(units.map(this.keepAliveListenKey))
       this.logger.log(`Keeping alive listenKey for ${units.length} units: [ ${units.map(u=>u.identifier).join(' ')} ]`)
    }


    public get units(): Unit[] {
        return this._units$.value
    }

    public getUnit(identifier: string): Unit {
        const unit = this._units$.value.find(u => u.identifier === identifier)
        if (!unit) throw new Error(`Unit ${identifier} not found`)
        return unit
    }

    public findUnitByChatId(chatId: number): Promise<Unit> {
        return this.unitModel.findOne({ telegramChannelId: chatId }, 
            { listenJsons: false, tradeObjectIds: false }).exec()
    }

    public async fetchLogs(identifier: string): Promise<string[]> {
        const unit = await this.unitModel.findOne({ identifier },
             { listenJsons: true }).exec()
        return unit.listenJsons
    }

    private async startListeningForEveryUnit() {
        if (process.env.SKIP_WEBSOCKET_LISTEN === 'true') {
            this.logger.warn(`[SKIP] listening websockets`)
            return
        }
        const units = this._units$.value

        await Promise.all(units.map(this.startListening))
    }


    public startListening = async (unit: Unit) => {
        const websocketOnlyFor = process.env.WEBSOCKET_ONLY_FOR
        if (websocketOnlyFor) {
            if (unit.identifier !== websocketOnlyFor) {
                return
            }
        }
        if (UnitUtil.socketOpened(unit)) {
            this.logger.warn(`Socket fot unit ${unit.identifier} already opened`)
            return
        }

        const listenKey = await this.fetchListenKey(unit)
        const ws = new WebSocket(`${UnitUtil.socketUri}/${listenKey}`)

        ws.onopen = (event: Event) => {
            this.logger.log(`Opened socket for unit: ${unit.identifier}`)
        }
        
        ws.onclose = (event: CloseEvent) => {
            this.logger.warn(`Closed socket for unit: ${unit.identifier}`)
        }
        
        ws.onerror = (event: ErrorEvent) => {
            this.addError(unit, `Error on socket for unit: ${unit.identifier}`)
            this.addError(unit, `event.error`)
            this.addError(unit, event.error)
            this.removeListenKey(unit)
        }

        ws.onmessage = (event: MessageEvent) => {
            this.logger.log(`ON MESSAGE for ${unit.identifier}`)
            this.removeListenKeyIfMessageIsAboutClose(event, unit)
            const tradeEvent: TradeEventData = JSONbig.parse(event.data as string)
            if (TradeUtil.isTradeEvent(tradeEvent)) {
                tradeEvent.unitIdentifier = unit.identifier
                this.tradeEventSubject$.next(tradeEvent)
            } else {
                this.logger.log(`Event ${tradeEvent.e} received`)
            }
        }
        unit.socket = ws
    }


    public keepAliveListenKey = async (unit: Unit) =>  {
        const fetched = await this.fetchUnit(unit.identifier)
        const listenKey = fetched?.listenKey
        if (!listenKey) {
            this.logger.error(`Could not find listenKey for unit ${unit.identifier}`)
        }
        return this.request(unit, 'PUT')
    }

    public stopListening(unit: Unit) {
        unit.socket?.close()
        return this.request(unit, 'DELETE')
    }


    private async fetchListenKey(unit: Unit): Promise<string> {
        try {
            const listenKey = await this.request(unit, 'POST')
            if (!listenKey || typeof listenKey !== 'string') {
                throw new Error(`Listen key error response for unit: ${unit.identifier}`)
            }
            this.logger.log(`Found new listenKey for unit ${unit.identifier}: ${listenKey}`)
            this.updateListenKey(unit, listenKey)
            return listenKey
        } catch (error) {
            const message = this.http.handleErrorMessage(error)
            this.logger.error(message)
        }
    }

    private async request(unit: Unit, method: HttpMethod): Promise<string> {
        const response = await this.http.fetch<ListeKeyResponse>({
            url: this.signUrlWithParams(`/listenKey`, unit, ''),
            method: method,
            headers: getHeaders(unit)
        })
        return response.listenKey
    }


    private signUrlWithParams(path: string, unit: Unit, queryString: string) {
        const url = `${TradeUtil.futuresUri}${path}`
        return sign(url, queryString, unit)
    }

    private async fetchUnit(identifier: string): Promise<Unit> {
        const found = await this.unitModel.findOne(
            { identifier: identifier }, 
            { listenJsons: false, tradeObjectIds: false }).exec()
        if (!found) throw new Error(`Could not found unit ${identifier}`)
        return found
    }


    private onBinanceError(err: BinanceError, unit: Unit) {
        this.logger.error(`[${err.code}] unit: ${unit.identifier} - ${err.msg}`)
        if (err?.code === -1125) {
            this.removeListenKey(unit)
        }
        if (UnitUtil.socketOpened(unit)) {
            unit.socket.close()
        }
    }

    private removeListenKeyIfMessageIsAboutClose(event: MessageEvent, unit: Unit) {
        try {
            const data = JSON.parse(event?.data.toString())
            if (data?.e === 'listenKeyExpired') {
                if (UnitUtil.socketOpened(unit)) {
                    unit.socket.close()
                }
            }
        } catch {
            return
        }
    }


    private removeListenKey(unit: Unit) {
        return this.unitModel.updateOne(
            { identifier: unit.identifier },
            { $unset: { listenKey: 1 } }
        ).exec().finally(() => this.logger.warn(`Removed listen key for unit ${unit.identifier}`))
    }


    private updateListenKey(unit: Unit, listenKey: string) {
        return this.unitModel.updateOne(
            { identifier: unit.identifier },
            { $set: { listenKey: listenKey } }
        ).exec()
    }



    public async addUnit(body: Unit) {
        if (!body.identifier) {
            throw new BadRequestException('Identifier must be provided')
        }
        const existingUnit = await this.fetchUnitByIdentifier(body.identifier)
        if (existingUnit) {
            throw new BadRequestException(`Unit ${body.identifier} already exists`)
        }
        const entity = new this.unitModel({
            _id: newObjectId(),
            identifier: body.identifier,
            active: body.active,
            listenJsons: [],
            tradeObjectIds: [],
            usdtPerTransaction: body.usdtPerTransaction,
            binanceApiKey: body.binanceApiKey,
            binanceApiSecret: body.binanceApiSecret,
            telegramChannelId: body.telegramChannelId,
            allowMinNotional: body.allowMinNotional
        })
        const saved = await entity.save()
        this.logger.log(`New unit ${saved.identifier} is added with _id: ${saved._id}`)
        this.loadUnits()
        return saved
    }

    public async deleteUnit(identifier: string): Promise<boolean> {
        const result = await this.unitModel.deleteOne({ identifier: identifier }).exec()
        if (result.deletedCount) {
            this.logger.log(`Deleted unit with identifier: ${identifier}`)
        } else {
            this.logger.warn(`Could not delete/found unit: ${identifier}`)
        }
        this.loadUnits()
        return !!result.deletedCount
    }

    private async loadUnit(identifier: string) {
        const unit = await this.unitModel.findOne({ identifier, active: true }, { 
            listenJsons: false,
            listenKey: false
        }).exec()
        if (unit) {
            let units = this._units$.value
            if (units.find(u => u.identifier === identifier)) {
                units = this._units$.value.map(u => {
                    if (u.identifier === unit.identifier) {
                        return unit
                    }
                    return u
                })
            } else {
                units.push(unit)
            }
            this._units$.next(units)

            if (unit.active) {
                this.startListening(unit)
            }
        } else {
            const units = this._units$.value.filter(u => u.identifier !== identifier)
            this._units$.next(units)
            this.logger.warn(`Could not load unit ${identifier}`)
        }
    }


    public async addLog(unit: Unit, data: Data | string, prefix?: string) {
        const _prefix = prefix ? `${prefix} ` : ''
        if (data) {
            const listenJsons = await this.fetchListenJsons(unit.identifier)
            let msg = typeof data === 'string' ? data : JSON.stringify(data)
            this.logger.log(msg)
            const log = `[${this.getDateString()}] ${_prefix} ${msg}`
            unit.listenJsons = listenJsons
            unit.listenJsons.push(log)
            this.unitModel.updateOne(
                { _id: unit._id },
                { $set: { listenJsons: unit.listenJsons } }
            ).exec()
        }
    }

    private getDateString() {
        const now = new Date()
        return `${now.toLocaleDateString()} ${now.toLocaleDateString()}`
    }

    
    public addError(unit: Unit, msg: string) {
        this.addLog(unit, msg, '[ERROR]')
    }

    public cleanLogs(identifier: string) {
        return this.unitModel.updateOne({ identifier: identifier }, { $set: { listenJsons: [] }}).exec()
    }

    public async getLogs(identifier: string) {
        const listenJsons = await this.fetchListenJsons(identifier)
        if (!Array.isArray(listenJsons)) {
            throw new BadRequestException(`Cound not find listenJsons for unit ${identifier}`)
        }
        return listenJsons
    } 

    public async identifierTaken(identifier: string): Promise<boolean> {
        return !!(await this.unitModel.exists({ identifier }).exec())
    }

    public async apiKeyTaken(binanceApiKey: string): Promise<boolean> {
        return !!(await this.unitModel.exists({ binanceApiKey }).exec())
    }

    public async apiKeyError(unit: Unit): Promise<BinanceError> {
        const params = queryParams({
            timestamp: Date.now(),
        })
        try {
            return this.http.fetch<BinanceError>({
                url: sign(`${TradeUtil.futuresUriV2}/account`, params, unit),
                method: 'GET',
                headers: getHeaders(unit)
            })
        } catch (error) {
            const message = this.http.handleErrorMessage(error)
            this.logger.error(message)
            return null
        }
    } 


    private async fetchListenJsons(identifier: string): Promise<string[]> {
        const unit = await this.unitModel.findOne({ identifier: identifier }, { listenJsons: true }).exec()
        return unit?.listenJsons ?? []
    }

    public async activation(identifier: string, active: boolean) {
        const unit = await this.fetchUnitByIdentifier(identifier)
        const update = await this.unitModel.updateOne(
            { identifier: unit?.identifier },
            { $set: { active: active } }
        ).exec()
        this.loadUnit(unit.identifier)
        return update
    } 

    public async updateUsdtPerTransaction(_unit: Unit) {
        const unit = await this.fetchUnitByIdentifier(_unit.identifier)
        const update = await this.unitModel.updateOne(
            { identifier: unit.identifier },
            { $set: { usdtPerTransaction: _unit.usdtPerTransaction } }
        ).exec()
        this.loadUnit(unit.identifier)
        return update
    }

    public async updateAllowMinNotional(_unit: Unit) {
        _unit.allowMinNotional = !_unit.allowMinNotional
        const unit = await this.fetchUnitByIdentifier(_unit.identifier)
        const update = await this.unitModel.updateOne(
            { identifier: unit.identifier },
            { $set: { allowMinNotional: _unit.allowMinNotional } }
        ).exec()
        this.loadUnit(unit.identifier)
        return update
    }

    public async updateApiKey(_unit: Unit) {
        const unit = await this.fetchUnitByIdentifier(_unit.identifier)
        const update = await this.unitModel.updateOne(
            { identifier: unit.identifier },
            { $set: { 
                binanceApiKey: _unit.binanceApiKey,
                binanceApiSecret: _unit.binanceApiSecret 
            } }
        ).exec()
        this.loadUnit(unit.identifier)
        return update
    }


    
    private async fetchUnitByIdentifier(identifier: string): Promise<Unit> {
        const unit = await this.unitModel.findOne({ identifier: identifier }, { listenJsons: false })
        if (unit) {
            this.logger.log(`Found unit ${identifier}`)
            return unit
        }
        this.logger.log(`Not found unit ${identifier}`)
        return null
    }

}

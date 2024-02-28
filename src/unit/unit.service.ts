import { Injectable, Logger, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { BehaviorSubject, Subject } from 'rxjs';
import { Unit } from './trade-unit';
import { Model } from 'mongoose';
import { EVERY_45_MINUTES, getHeaders, newObjectId, sign } from 'src/global/util';
import { TradeUtil } from 'src/binance/trade-util';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UnitUtil } from './unit.util';
import { WebSocket, Event, MessageEvent, CloseEvent, ErrorEvent, Data } from 'ws';
import { BinanceError, isBinanceError } from 'src/binance/model/binance.error';
import { HttpMethod } from 'src/global/http-method';
import { TradeEventData } from 'src/binance/model/trade-event-data';


@Injectable()
export class UnitService implements OnModuleInit {

    private readonly logger = new Logger(UnitService.name)

    constructor(
        @InjectModel(Unit.name) private unitModel: Model<Unit>,
    ) {}

    private _units$ = new BehaviorSubject<Unit[]>([])

    public tradeEventSubject = new Subject<TradeEventData>()

    onModuleInit() {
        this.loadUnits()
    }

    @Cron(CronExpression.EVERY_DAY_AT_7AM)
    private async loadUnits() {
        const units = await this.unitModel.find({ active: true }).exec()
        if (Array.isArray(units)) {
            this._units$.next(units)
            const list = units.map(u => u.identifier).join(', ')
            this.logger.log(`Loaded ${units.length} units: [ ${list} ]`)
            this.startListeningForEveryUnit()
        }
    }

    @Cron(EVERY_45_MINUTES)
    private async keepAliveListenKeyForEveryUnit() {
        this.logger.debug('Refreshing listen keys')
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

    private async startListeningForEveryUnit() {
        const units = this._units$.value
        await Promise.all(units.map(this.startListening))
        this.logger.log(`Stared listening for ${units.length} units: [ ${units.map(u=>u.identifier).join(', ')} ]`)
    }


    public startListening = async (unit: Unit) => {
        if (UnitUtil.socketOpened(unit)) {
            this.logger.debug(`Socket fot unit ${unit.identifier} already opened`)
            return
        }
        const listenKey = await this.fetchListenKey(unit)
        const ws = new WebSocket(`${UnitUtil.socketUri}/${listenKey}`)
        unit.socket = ws

        ws.onopen = (event: Event) => {
            this.logger.debug(`Opened socket for unit: ${unit.identifier}`)
        }
        
        ws.onclose = (event: CloseEvent) => {
            this.logger.debug(`Closed socket for unit ${unit.identifier}`)
            this.removeListenKey(unit)
        }
        
        ws.onerror = (event: ErrorEvent) => {
            this.logger.debug(`Error on socket for unit: ${unit.identifier}`)
            this.logger.error(event.error)
            this.addError(unit,event.error)
            this.removeListenKey(unit)
        }

        ws.onmessage = (event: MessageEvent) => {
            this.logger.log(`ON MESSAGE for ${unit.identifier}`)
            this.removeListenKeyIfMessageIsAboutClose(event, unit)
            const tradeEvent: TradeEventData = JSON.parse(event.data as string)
            if (TradeUtil.isTradeEvent(tradeEvent)) {
                tradeEvent.unitIdentifier = unit.identifier
                this.tradeEventSubject.next(tradeEvent)
            } else {
                console.error('nottradeevent')
            }
        }
    }




    // TODO
    public keepAliveListenKey = async (unit: Unit) =>  {
        const fetched = await this.fetchUnit(unit.identifier)
        const listenKey = fetched?.listenKey
        if (!listenKey) {
            this.logger.error(`Could not find listenKey for unit ${unit.identifier}`)
        }
        const response = await this.request(unit, 'PUT')
        return response
    }

    private async fetchListenKey(unit: Unit): Promise<string> {
        const response = await this.request(unit, 'POST')
        const listenKey = response?.listenKey
        if (!listenKey || typeof listenKey !== 'string') {
            throw new Error(`Listen key error response for unit: ${unit.identifier}`)
        }
        this.logger.log(`Found new listenKey for unit ${unit.identifier}: ${listenKey}`)
        this.updateListenKey(unit, listenKey)
        return listenKey
    }

    public stopListening(unit: Unit) {
        unit.socket?.close()
        return this.request(unit, 'DELETE')
    }

    private async request(unit: Unit, method: HttpMethod) {
        const url = this.signUrlWithParams(`/listenKey`, unit, '')
        const request = await fetch(url, {
            method: method,
            headers: getHeaders(unit)
        })
        const response = await request.json()
        if (isBinanceError(response)) {
            this.onBinanceError(response, unit)
            return
        }
        return response
    }




    private signUrlWithParams(path: string, unit: Unit, queryString: string) {
        const url = `${TradeUtil.futuresUri}${path}`
        return sign(url, queryString, unit)
    }

    private async fetchUnit(identifier: string): Promise<Unit> {
        const found = await this.unitModel.findOne({ identifier: identifier}).exec()
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

    // TODO
    private removeListenKey(unit: Unit) {
        return this.unitModel.updateOne(
            { identifier: unit.identifier },
            { $unset: { listenKey: 1 } }
        ).exec().finally(() => this.addLog(unit, `Removed listen key for unit ${unit.identifier}`))
    }


    private updateListenKey(unit: Unit, listenKey: string) {
        return this.unitModel.updateOne(
            { identifier: unit.identifier },
            { $set: { listenKey: listenKey } }
        ).exec().finally(() => {
            if (process.env.TEST_MODE === 'true') {
                return
            }
            this.addLog(unit, `Listen key is set for unit ${unit.identifier}`)
        })
    }


    private async fetchUnitByIdentifier(identifier: string): Promise<Unit> {
        const unit = await this.unitModel.findOne({ identifier: identifier })
        if (unit) {
            this.logger.log(`Found unit ${identifier}`)
            return unit
        }
        this.logger.log(`Not found unit ${identifier}`)
        return null
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
            telegramChannelId: body.telegramChannelId
        })
        const saved = await entity.save()
        this.logger.log(`New unit ${saved.identifier} is added with _id: ${saved._id}`)
        this.loadUnits()
        return saved
    }


    // LOGS

    public async addLog(unit: Unit, data: Data | string, prefix?: string) {
        const _prefix = prefix ? `${prefix} ` : ''
        if (data) {
            const listenJsons = await this.fetchListenJsons(unit.identifier)
            let msg = typeof data === 'string' ? data : JSON.stringify(data)
            this.logger.log(msg)
            const log = `[${new Date().toDateString()}] ${_prefix} ${msg}`
            unit.listenJsons = listenJsons
            unit.listenJsons.push(log)
            this.unitModel.updateOne(
                { _id: unit._id },
                { $set: { listenJsons: unit.listenJsons } }
            ).exec()
        }
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
        return listenJsons.map(j => TradeUtil.parseToFuturesResult(JSON.parse(j.split(" - ")[1])))
    } 


    private async fetchListenJsons(identifier: string): Promise<string[]> {
        const unit = await this.unitModel.findOne({ identifier: identifier }, { listenJsons: true }).exec()
        return unit?.listenJsons ?? []
    }


}

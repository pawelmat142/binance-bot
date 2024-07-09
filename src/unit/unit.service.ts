import { Injectable, Logger, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { Unit } from './unit';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BinanceError } from '../binance/model/binance.error';
import { TradeEventData } from '../binance/model/model';
import { TradeUtil } from '../binance/utils/trade-util';
import { Http } from '../global/http/http.service';
import { BotUtil } from '../wizard/bot.util';
import { Util } from '../binance/utils/util';
import { Data } from 'ws';


@Injectable()
export class UnitService implements OnModuleInit {

    private readonly logger = new Logger(UnitService.name)

    constructor(
        @InjectModel(Unit.name) private unitModel: Model<Unit>,
        private readonly http: Http,
    ) {}

    private readonly adminChannelIds = BotUtil.adminChannelIds()

    public isAdmin = (chatId: string): boolean => {
        return this.adminChannelIds.includes(chatId?.toString())
    }

    private _units$ = new BehaviorSubject<Unit[]>([])
    public get units$(): Observable<Unit[]> {
        return this._units$.asObservable()
    }

    public get units(): Unit[] {
        return this._units$.value
    }



    private tradeEventSubject$ = new Subject<TradeEventData>()

    public get tradeEventObservable$(): Observable<TradeEventData> {
        return this.tradeEventSubject$.asObservable()
    }

    onModuleInit() {
        this.initUnits()
        this._units$.subscribe(units => {
            this.logger.log(`Loaded ${units.length} active units: [ ${units.map(u => u.identifier).join(', ')} ]`)
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
    }

    public getUnit(identifier: string): Unit {
        const unit = this._units$.value.find(u => u.identifier === identifier)
        if (!unit) throw new Error(`Unit ${identifier} not found`)
        return unit
    }

    public findUnitByChatId(chatId: number): Promise<Unit> {
        return this.unitModel.findOne({ telegramChannelId: chatId }, 
            { listenJsons: false }).exec()
    }

    public async fetchLogs(identifier: string): Promise<string[]> {
        const unit = await this.unitModel.findOne({ identifier },
             { listenJsons: true }).exec()
        return unit.listenJsons
    }

    private async fetchUnit(identifier: string): Promise<Unit> {
        const found = await this.unitModel.findOne(
            { identifier: identifier }, 
            { listenJsons: false }).exec()
        if (!found) throw new Error(`Could not found unit ${identifier}`)
        return found
    }

    public async fetchAllUnits(): Promise<Unit[]> {
        return this.unitModel.find({})
    }

    public removeListenKey(unit: Unit) {
        return this.unitModel.updateOne(
            { identifier: unit.identifier },
            { $unset: { listenKey: 1 } }
        ).exec().finally(() => this.logger.warn(`Removed listen key for unit ${unit.identifier}`))
    }

    public updateListenKey(unit: Unit) {
        return this.unitModel.updateOne(
            { identifier: unit.identifier },
            { $set: { listenKey: unit.listenKey } }
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
            _id: Util.newObjectId(),
            identifier: body.identifier,
            active: body.active,
            listenJsons: [],
            tradeAmounts: body.tradeAmounts,
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
        const params = {
            timestamp: Date.now(),
        }
        try {
            return this.http.fetch<BinanceError>({
                url: Util.sign(`${TradeUtil.futuresUriV2}/account`, params, unit),
                method: 'GET',
                headers: Util.getHeaders(unit)
            })
        } catch (error) {
            const message = Http.handleErrorMessage(error)
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

    public async updateTradeAmounts(_unit: Unit) {
        const unit = await this.fetchUnitByIdentifier(_unit.identifier)
        const update = await this.unitModel.updateOne(
            { identifier: unit.identifier },
            { $set: { tradeAmounts: _unit.tradeAmounts } }
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

    public async updateAdminSignalSource(_unit: Unit) {
        const unit = await this.fetchUnitByIdentifier(_unit.identifier)
        const update = await this.unitModel.updateOne(
            { identifier: unit.identifier },
            { $set: { 
                adminSignalSource: _unit.adminSignalSource,
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

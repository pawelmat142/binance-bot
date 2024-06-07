import { Injectable, Logger } from '@nestjs/common';
import { Signal } from './signal';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TelegramMessage } from 'src/telegram/message';
import { SignalValidator } from './signal-validator';
import { SignalUtil } from './signal-util';
import { Observable, Subject } from 'rxjs';
import { TelegramService } from 'src/telegram/telegram.service';
import { SignalOtherActionValidator } from './additional-validator';
import { EntryPriceCalculator } from 'src/global/calculators/entry-price.calculator';
import { Http } from 'src/global/http/http.service';
import { MarketPriceResponse } from 'src/binance/model/model';
import { TradeUtil } from 'src/binance/trade-util';

@Injectable()
export class SignalService {

    private readonly logger = new Logger(SignalService.name)

    constructor(
        @InjectModel(Signal.name) private signalModel: Model<Signal>,
        private readonly telegramService: TelegramService,
        private readonly http: Http,
    ) {}

    private tradeSubject$ = new Subject<Signal>()

    public get tradeObservable$(): Observable<Signal> {
        return this.tradeSubject$.asObservable()
    }


    public async onReceiveTelegramMessage(telegramMessage: TelegramMessage) {
        const signal: Signal = this.prepareSignal(telegramMessage)
        try {
            this.validateSignal(signal)

            await this.verifyIfDuplicate(signal)

            if (signal.valid) {
                await this.calcEntryPrice(signal)
            } else {
                this.additionalValidationIfNotValid(signal)
            }

            await this.save(signal)

            this.telegramService.sendPublicMessage(telegramMessage?.message)

            if ((signal.valid && SignalUtil.entryCalculated(signal)) || SignalUtil.anyOtherAction(signal)) {
                this.tradeSubject$.next(signal)
            } 
            else {
                SignalUtil.addError(`Signal is not valid and no any other action detected`, signal, this.logger)
            }
        } catch (error) {
            SignalUtil.addError(error, signal, this.logger)
            telegramMessage.error = error?.message ?? error
        }
        this.updateLogs(signal)
        return telegramMessage
    }

    private validateSignal(signal: Signal): void {
        const validator = new SignalValidator(signal)
        validator.validate()
    }

    private additionalValidationIfNotValid(signal: Signal) {
        const validator = new SignalOtherActionValidator(signal)
        validator.validate()
    }

    private prepareSignal(telegramMessage: TelegramMessage): Signal {
        return new this.signalModel({
            content: telegramMessage?.message ?? 'no-content',
            timestamp: new Date(),
            telegramMessageId: telegramMessage?.id ?? 'missing'
        })
    }

    public async calcEntryPrice(signal: Signal) {
        const symbol = signal.variant.symbol
        try {
            const marketPrice = await this.fetchMarketPrice(symbol)
            signal.variant.marketPriceOnCalculate = marketPrice
            signal.variant.calculationTimestamp = new Date()
            SignalUtil.addLog(`Found Market Price: ${marketPrice.toFixed(2)} USDT`, signal, this.logger)
        
            EntryPriceCalculator.start(signal)

        } catch (error) {
            const msg = Http.handleErrorMessage(error)
            throw new Error(msg)
        }
    }

    private async fetchMarketPrice(symbol: string): Promise<number> {
        const response = await this.http.fetch<MarketPriceResponse>({
            url: `${TradeUtil.futuresUri}/premiumIndex?symbol=${symbol}`
        })
        const result = Number(response?.markPrice)
        if (isNaN(result)) {
            throw new Error(`Market price ${result} is not a number`)
        }
        return result
    }


    
    // REPOSITORY

    public list(): Promise<Signal[]> {
        return this.signalModel.find().exec()
    }

    public listValid(): Promise<Signal[]> {
        return this.signalModel.find({ valid: true }).exec()
    }

    public async updateLogs(signal: Signal) {
        return this.signalModel.updateOne(
            { _id: signal._id },
            { $set: { logs: signal.logs } }
        )
    }

    private async save(signal: Signal) {
        signal._id = new Types.ObjectId().toHexString()
        const newSignal = new this.signalModel(signal)
        const saved = await newSignal.save()
        SignalUtil.addLog(`Saved signal ${saved._id}`, signal, this.logger)
    }

    private async verifyIfDuplicate(signal: Signal) {
        if (process.env.SKIP_PREVENT_DUPLICATE === 'true') {
            this.logger.warn('SKIP PREVENT DUPLICATE')
            return
        } 
        const found = await this.signalModel.findOne(
            { telegramMessageId: signal.telegramMessageId },
            { telegramMessageId: true }
        ).exec()
        if (found) {
            throw new Error(`Already found signal ${found._id}`)   
        }
    }


}

import { Injectable, Logger } from '@nestjs/common';
import { Signal } from './signal';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SignalUtil } from './signal-util';
import { Observable, Subject } from 'rxjs';
import { TelegramService } from '../telegram/telegram.service';
import { TelegramMessage } from '../telegram/message';
import { SignalSourceService } from './signal-source.service';
import { SignalValidationService } from './signal-validation.service';

@Injectable()
export class SignalService {

    private readonly logger = new Logger(SignalService.name)

    constructor(
        @InjectModel(Signal.name) private signalModel: Model<Signal>,
        private readonly telegramService: TelegramService,
        private readonly signalSourceService: SignalSourceService,
        private readonly signalValidationService: SignalValidationService,
    ) {}

    private tradeSubject$ = new Subject<Signal>()

    public get tradeObservable$(): Observable<Signal> {
        return this.tradeSubject$.asObservable()
    }


    public async onReceiveTelegramMessage(telegramMessage: TelegramMessage) {
        const signal: Signal = this.prepareSignal(telegramMessage)
        try {
            this.signalSourceService.findSignalSourceName(telegramMessage, signal)

            this.signalValidationService.validateSignal(signal)


            await this.verifyIfDuplicate(signal)

            if (!signal.valid) {
                this.signalValidationService.additionalValidationIfNeeded(signal)
            }

            await this.save(signal)

            this.sendTelegramPublicMessage(telegramMessage, signal)

            if (signal.valid || SignalUtil.anyOtherAction(signal)) {
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


    private prepareSignal(telegramMessage: TelegramMessage): Signal {
        return new this.signalModel({
            variant: { takeProfits: [] },
            content: telegramMessage?.message ?? 'no-content',
            timestamp: new Date(),
            telegramMessageId: telegramMessage?.id ?? 'missing'
        })
    }

    private sendTelegramPublicMessage(telegramMessage: TelegramMessage, signal: Signal) {
        const signalSource = signal.variant.signalSource
        const message = `${signalSource}: \n\n${telegramMessage.message}`
        this.telegramService.sendPublicMessage(message)
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

    private async 

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

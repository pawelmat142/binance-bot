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

@Injectable()
export class SignalService {

    private readonly logger = new Logger(SignalService.name)

    constructor(
        @InjectModel(Signal.name) private signalModel: Model<Signal>,
        private readonly telegramService: TelegramService,
    ) {}

    private tradeSubject$ = new Subject<Signal>()

    public get tradeObservable$(): Observable<Signal> {
        return this.tradeSubject$.asObservable()
    }

    // messageFrom telegram -> new Signal -> validate -> save signal -> if valid -> new Trade -> open position per unit -> save per unit

    testOnReceiveMessage() {
        this.logger.log('testOnReceiveMessage')
        const msg = `
        Long АТОМ
 
Entry Zone: 
12.50$ - 13.50$ 

Take profits: 
1️⃣15.50$
2️⃣18.60$
3️⃣21.20$
4️⃣25.10$

Open with 5x leverage

Stop Loss: 10.40$   
        `
        this.onReceiveTelegramMessage({
            message: msg,
            id: 123,
        } as TelegramMessage)
    }


    public async onReceiveTelegramMessage(telegramMessage: TelegramMessage) {
        const signal: Signal = this.prepareSignal(telegramMessage)
        try {
            this.validateSignal(signal)

            await this.verifyIfDuplicate(signal)

            this.additionalValidationIfNotValid(signal)

            await this.save(signal)

            this.telegramService.sendPublicMessage(telegramMessage?.message)

            if (signal.valid || SignalUtil.anyAction(signal)) {
                this.tradeSubject$.next(signal)
            } 
            else throw new Error('Signal is not valid and no any other action detected')

        } catch (error) {
            SignalUtil.addError(error, signal, this.logger)
            telegramMessage.error = error
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
            this.logger.debug('SKIP PREVENT DUPLICATE')
            return
        } 
        const found = await this.signalModel.findOne(
            { telegramMessageId: signal.telegramMessageId },
            { telegramMessageId: true }
        ).exec()
        if (found) {
            throw new Error(`Already found signal ${found._id}`)   
        } else {
            SignalUtil.addLog('Signal is new, will be processed if valid', signal, this.logger)
        }
    }


}

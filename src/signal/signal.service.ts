import { Injectable, Logger } from '@nestjs/common';
import { SignalMessage } from './signal-message';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TelegramMessage } from 'src/telegram/message';
import { SignalValidator } from './signal-validator';
import { SignalUtil } from './signal-util';
import { Subject } from 'rxjs';
import { TelegramService } from 'src/telegram/telegram.service';

@Injectable()
export class SignalService {

    private readonly logger = new Logger(SignalService.name)

    constructor(
        @InjectModel(SignalMessage.name) private signalModel: Model<SignalMessage>,
        private readonly telegramService: TelegramService,
    ) {}

    tradeSubject$ = new Subject<SignalMessage>()

    // messageFrom telegram -> new Signal -> validate -> save signal -> if valid -> new Trade -> open position per unit -> save per unit

    testOnReceiveMessage() {
        const msg = `
        LONG AVAX 

        SWING 
        
        Very risky signal
        
        Entry Zone: 
        38$ - 40$ 
        
        Take profits: 
        1️⃣43$
        2️⃣46$
        3️⃣50$
        4️⃣60$
        
        Open with 5x leverage
        
        Stop Loss: 33$
        
        `
        this.onReceiveTelegramMessage({
            message: msg,
            id: 123,
        } as TelegramMessage)
    }




    public async onReceiveTelegramMessage(telegramMessage: TelegramMessage) {
        const signal: SignalMessage = this.prepareSignal(telegramMessage)
        try {
            this.validateSignal(signal)

            // TODO remove skiping duplicates
            await this.verifyIfDuplicate(signal)

            await this.save(signal)

            // TODO temporary
            this.telegramService.sendMessage(telegramMessage?.message)

            if (signal.valid) {
                SignalUtil.addLog(`Signal is valid, openin trade... `, signal, this.logger)
                this.tradeSubject$.next(signal)
            } else {
                throw new Error('Signal is not valid')
            }
        } catch (error) {
            SignalUtil.addError(error, signal, this.logger)
        }
        this.updateLogs(signal)
        return telegramMessage
    }



    private validateSignal(signal: SignalMessage): void {
        const validator = new SignalValidator(signal)
        validator.validate()
    }


    private prepareSignal(telegramMessage: TelegramMessage): SignalMessage {
        return new this.signalModel({
            content: telegramMessage?.message ?? 'no-content',
            timestamp: new Date(),
            telegramMessageId: telegramMessage?.id ?? 'missing'
        })
    }


    
    // REPOSITORY

    public list(): Promise<SignalMessage[]> {
        return this.signalModel.find().exec()
    }

    public listValid(): Promise<SignalMessage[]> {
        return this.signalModel.find({ valid: true }).exec()
    }

    public async updateLogs(signal: SignalMessage) {
        return this.signalModel.updateOne(
            { _id: signal._id },
            { $set: { logs: signal.logs } }
        )
    }

    private async save(signal: SignalMessage) {
        signal._id = new Types.ObjectId().toHexString()
        const newSignal = new this.signalModel(signal)
        const saved = await newSignal.save()
        SignalUtil.addLog(`Saved signal ${saved._id}`, signal, this.logger)
    }

    private async verifyIfDuplicate(signal: SignalMessage) {
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

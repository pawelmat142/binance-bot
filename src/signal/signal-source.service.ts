import { Injectable, Logger, OnModuleInit } from "@nestjs/common"
import { SignalSource } from "../binance/utils/variant-util"
import * as fs from 'fs';
import { TelegramMessage } from "../telegram/message";
import { BotUtil } from "../wizard/bot.util";
import { Signal } from "./signal";

export interface SignalSourceInterface {
    name: SignalSource
    telegramChannelId: string
}

@Injectable()
export class SignalSourceService implements OnModuleInit {

    private readonly logger = new Logger(this.constructor.name)

    private readonly SIGNAL_SOURCES_FILE_NAME = "signal-sources.json"

    private readonly adminChannelIds = BotUtil.adminChannelIds()

    private _signalSources: SignalSourceInterface[] = []

    public get signalSources(): SignalSourceInterface[] {
        return this._signalSources
    }

    onModuleInit() {
        this.loadSignalSourceFromFile()
    }

    public isFromSignalChannel(channelId: string): boolean {
        return this._signalSources.map(s => s.telegramChannelId).includes(channelId)
    }

    public findSignalSourceName(telegramMessage: TelegramMessage, signal: Signal) {
        const telegramChannelId = telegramMessage?.peer_id?.channel_id
        if (!telegramChannelId) {
            throw new Error(`Telegram channel id not found in signal message`)
        }
        signal.telegramChannelId = telegramChannelId

        if (this.adminChannelIds.includes(telegramChannelId)) {
            signal.variant.signalSource = 'ADMIN'
            return
        }

        const signalSource = this._signalSources.find(s => s.telegramChannelId === telegramChannelId)
        if (!signalSource) {
            throw new Error(`Not found signal source with telegram channel id ${telegramChannelId}`)
        }
        signal.variant.signalSource = signalSource.name
    }

    private loadSignalSourceFromFile() {
        const jsonData = fs.readFileSync(this.SIGNAL_SOURCES_FILE_NAME, 'utf8')
        this._signalSources = JSON.parse(jsonData) as SignalSourceInterface[]
        if (!this._signalSources.length) {
            throw new Error("Signal sources not found")
        }
        this.logger.warn(this._signalSources)
        this.logger.log(`Initialized ${this._signalSources.length} signal sources: ${this._signalSources.map(s => s.name).join(', ')}`)
    }

}
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { MTProtoClient } from './mtproto';
import { Cron, CronExpression } from "@nestjs/schedule";
import * as path from 'path';
import { AuthResponse, AuthUser, TelegramUpdate, TelegramUpdates } from "./model";
import * as prompt from 'prompt';
import { TelegramMessage } from "./message";
import { Observable, Subject } from "rxjs";

/*
    Listening for telegram messages with MtProto protocol
    https://www.youtube.com/watch?v=TRNeRySFtg0
*/
@Injectable()
export class MtProtoService implements OnModuleInit {

    private readonly logger = new Logger(this.constructor.name)

    private readonly API_ID = parseInt(process.env.TELEGRAM_API_ID)
    private readonly API_HASH = process.env.TELEGRAM_API_HASH
    private readonly API_PHONE_NUMBER = process.env.TELEGRAM_PHONE_NUMBER

    client: MTProtoClient

    private mtProtoMsgSubject$ = new Subject<TelegramMessage>()
    public get mtProtoMsg$(): Observable<TelegramMessage> {
        return this.mtProtoMsgSubject$.asObservable()
    }

    onModuleInit() {
        this.initMtProtoClient()
    }

    private initFlag = false

    @Cron(CronExpression.EVERY_DAY_AT_3AM)
    async initMtProtoClient() {
        this.logger.warn(`MTProtoClient initialization...`)
        const config = {
            api_id: this.API_ID,
            api_hash: this.API_HASH,
            sessionPath: path.resolve(__dirname, 'your_session_file.json')
        }
        
        this.client = new MTProtoClient(config)
        
        await this.auth()
        
        this.client.mtproto.updates.on('updates', (telegramUpdates: TelegramUpdates) => {
            telegramUpdates.updates.forEach((telegramUpdate: TelegramUpdate) => {
                if (['updateNewMessage', 'updateNewChannelMessage'].includes(telegramUpdate._)) {
                    const mtProtoMessage = telegramUpdate?.message as TelegramMessage
                    if (mtProtoMessage?._ === 'message') {
                        this.onMessage(mtProtoMessage)
                    }
                }
            })
        })
        
        this.client.mtproto.updates.on('error', (error) => {
            this.logger.error('MTProtoClient error:', error);
        });

        this.client.mtproto.updates.on('disconnect', () => {
            this.logger.warn('MTProtoClient disconnected');
        });

        this.client.mtproto.updates.on('reconnect', () => {
            this.logger.log('MTProtoClient reconnected');
        });
    }

    private onMessage(mtProtoMessage: TelegramMessage) {
        this.mtProtoMsgSubject$.next(mtProtoMessage)
    }

    private async auth(): Promise<void> {
        try {
            prompt.start()

            await this.checkLogin()
            this.logger.warn('MTProtoClient already authorized')
        } catch (error) {
            if (error?.error_message === 'AUTH_KEY_UNREGISTERED') {
                this.logger.warn(`Authorization...`)
                await this.client.mtproto.setDefaultDc(4)
                const { phone_code_hash } = await this.sendCode()
                
                this.logger.log('Provide code...')
                const { code } = await prompt.get(['code'])

                const user = await this.signIn({ code, phone_code_hash })
                if (!user) {
                    this.logger.warn('MTProtoClient authorization failed')
                    return
                }
                this.logger.warn('MTProtoClient authorized')
            } else {
                this.logger.error(error)
            }
        }
    }

    private async checkLogin(): Promise<void> {
        await this.client.mtproto.call("users.getFullUser", {
          id: {
            _: "inputUserSelf",
          },
        });
    }

    private sendCode(): Promise<any> {
        return this.client.mtproto.call('auth.sendCode', {
            phone_number: this.API_PHONE_NUMBER,
            settings: {
                _: 'codeSettings'
            }
        })
        .catch(error => console.error(error.error_message ?? error))
    }

    private async signIn({ code, phone_code_hash }): Promise<AuthUser> {
        try {
            const params = {
                phone_code: code,
                phone_number: this.API_PHONE_NUMBER,
                phone_code_hash: phone_code_hash
            }
            const res = await this.client.mtproto.call('auth.signIn', params)

            if (res?._ === 'auth.authorization') {
                const response = res as AuthResponse
                return response.user
            }
        } catch (error) {
            this.logger.error(error.error_message ?? error)
            if (error.error_message !== 'SESSION_PASSWORD_NEEDED') {
                return
            }
        }
    }

}
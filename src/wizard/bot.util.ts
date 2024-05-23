import TelegramBot from "node-telegram-bot-api"
import { Wizard } from "./wizards/wizard"

export abstract class BotUtil {

    public static readonly USDT_PER_TRANSACTION_WIZARD = 'usdt-per-transaction'

    public static msgFrom = (lines: string[]) => {
        return (lines || []).reduce((acc, line) => acc + line + '\n', '')
    }

    public static readonly WiZARD_EXPIRATION_MINUTES = 15 

    public static isExpired = (wizard: Wizard): boolean => {
        const expirationTime = new Date(wizard.modified)
        expirationTime.setMinutes(expirationTime.getMinutes() + this.WiZARD_EXPIRATION_MINUTES)
        return expirationTime < new Date()
    }
    
    public static switchResponse = (wizardName: string) => {
        return `switch ${wizardName}`
    }

    public static adminChannelIds = (): string[] => {
        return process.env.ADMIN_CHAT_ID.split('_')
    }

    public static messageFromButtonCallback = (callback: TelegramBot.CallbackQuery): TelegramBot.Message => {
        return{
            message_id: callback.message.message_id,
            from: callback.from,
            chat: callback.message.chat,
            text: callback.data,
            date: callback.message.date
        }
    }

    public static fixValue = (input: string): string => {
        const number = Number(input)
        if (isNaN(number)) {
            return `00.00`
        }
        return `${number.toFixed(2)}`
    }

    public static getRandomInt = (min: number, max: number) => {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}
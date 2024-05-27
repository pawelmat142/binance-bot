import TelegramBot from "node-telegram-bot-api"
import { Wizard, WizardButton, WizardStep } from "./wizards/wizard"
import { TakeProfit } from "src/binance/model/trade-variant"
import { TradeUtil } from "src/binance/trade-util"
import { WizBtn } from "./wizards/wizard-buttons"

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

    public static prepareTakeProfitMsgLines = (takeProfits: TakeProfit[] = [], lines: string[]) => {
        if (takeProfits.length) {
            lines.push(`Take profits:`)
        } else {
            lines.push(`MISSING take profits!`)
        }
        for (const tp of takeProfits) {
            lines.push(`-${tp.price} USDT, ${tp.closePercent}% ${TradeUtil.takeProfitStatus(tp)}`)
        }
    }

    public static findClickedButton = (step: WizardStep, callbackData: string): WizardButton => {
        if (step.backButton) {
            BotUtil.addBackBtnIfNeeded(step)
            const btns = step.buttons.pop()
            return btns[0]
        }
        for (let btns of step.buttons || []) {
            for (let btn of btns) {
                if (btn.callback_data === callbackData) {
                    return btn
                }
            }
        }
    }

    public static addBackBtnIfNeeded = (step: WizardStep): void => {
        if (step.backButton) {
            BotUtil.addBackBtn(step)
        }
    }

    public static addBackBtn = (step: WizardStep): void => {
        step.buttons = step.buttons || []
        step.buttons.push([{
            text: WizBtn.BACK_LABEL,
            callback_data: WizBtn.BACK,
            process: async () => 0
        }])
    }

    public static getBackSwitchButton = (wizardName: string): WizardButton => {
        return {
            text: WizBtn.BACK_LABEL,
            callback_data: WizBtn.BACK_LABEL,
            switch: wizardName
        }
    }

}
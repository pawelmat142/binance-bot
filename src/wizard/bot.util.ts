import TelegramBot from "node-telegram-bot-api"
import { Wizard, WizardButton, WizardStep } from "./wizards/wizard"
import { TakeProfit } from "src/binance/model/trade-variant"
import { TradeUtil } from "src/binance/trade-util"
import { WizBtn } from "./wizards/wizard-buttons"
import { FuturesResult, Trade } from "src/binance/model/trade"
import { Position } from "src/binance/wizard-binance.service"

export abstract class BotUtil {

    public static msgFrom = (lines: string[]) => {
        return (lines || []).reduce((acc, line) => acc + line + '\n', '')
    }

    public static readonly WiZARD_EXPIRATION_MINUTES = 15 

    public static isExpired = (wizard: Wizard): boolean => {
        const expirationTime = new Date(wizard.modified)
        expirationTime.setMinutes(expirationTime.getMinutes() + this.WiZARD_EXPIRATION_MINUTES)
        return expirationTime < new Date()
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
            lines.push(this.tpContentString(tp))
        }
    }

    public static tpContentString(tp: TakeProfit): string {
        const percentPart = tp.closePercent ? ` (${tp.closePercent}%)` : ''
        return ` ${tp.order+1}) ${tp.price} USDT, ${TradeUtil.takeProfitStatus(tp)}${percentPart}`
    }


    public static findClickedButton = (step: WizardStep, callbackData: string): WizardButton => {
        if (step.backButton && callbackData === WizBtn.BACK) {
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

    public static btnTradeLabel = (trade: Trade): string => !trade ? '' : 
        `${TradeUtil.mode(trade.variant.side)} ${TradeUtil.token(trade.variant.symbol)} x${TradeUtil.getLever(trade)}`

    public static btnPositionLabel = (position: Position): string => 
        `${TradeUtil.token(position.symbol)} x${position.leverage}`

    public static btnOrderMsg = (order: FuturesResult) => `${TradeUtil.mode(order.side)} ${TradeUtil.token(order.symbol)}`

}
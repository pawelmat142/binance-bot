import { Logger } from "@nestjs/common"
import { BotMessage } from "../bot-message"
import { BotUtil } from "../bot.util"

export interface WizardStep {
    order: number
    message: string[]
    answers?: WizardAnswer[]
}

export interface WizardAnswer {
    input?: boolean //if input, result with text is executed
    phrase?: string
    result(text?: string): Promise<number | string[]>
}

export abstract class BotWizard {

    private readonly logger = new Logger(`${BotWizard.name}`)

    private log = (msg: string) => this.logger.log(`[${this.chatId}] ${msg}`)
    private error = (msg: string) => this.logger.error(`[${this.chatId}] ${msg}`)

    public chatId: number
    public order: number

    constructor(
        chatId: number,
    ) {
        this.chatId = chatId
        this.order = 0
    }

    getSteps = (): WizardStep[] => {throw new Error("not implemented")}

    public get step(): WizardStep {
        const step = this.getSteps()[this.order]
        if (!step) {
          this.logger.error(`Cound not find step ${this.order}, wizard for chat id: ${this.chatId}`)
        }
        return step
    }

    public async getResponse(message: BotMessage, first = false): Promise<string[]> {
        const text = message.text
        if (!text) {
            this.error(`Received blank message`)
        }
        this.log(`Received message: ${text}`)

        if (!first) {
            const answer = this.getAnswer(text)
            if (answer) {
                const result = await answer.result(text)
                if (typeof result === 'number') {
                    this.order = result
                    this.log(`Go to step ${this.order}`)
                } 
                if (Array.isArray(result)) {
                    this.log(`Response: ${result}`)
                    return [...result, BotUtil.msgFrom(this.step.message)]
                }
            }
        }
        this.log(`Response: ${this.step.message}`)
        return [BotUtil.msgFrom(this.step.message)]
    }

    private getAnswer(text: string): WizardAnswer  {
        if ((this.step.answers || []).length === 1) {
            const a = this.step.answers[0]
            if (a.input) {
                return a
            }
        }
        return (this.step.answers || []).find(a => a.phrase === text)
    }

}
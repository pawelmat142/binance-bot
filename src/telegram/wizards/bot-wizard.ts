import { Logger } from "@nestjs/common"
import { BotMessage } from "../bot-message"
import { BotUtil } from "../bot.util"

export interface WizardStep {
    order: number
    message?: string[]
    answers?: WizardAnswer[]
    close?: boolean
    switch?: string
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

    public modified: Date

    constructor(
        chatId: number,
    ) {
        this.chatId = chatId
        this.order = 0
    }

    getSteps = (): WizardStep[] => {throw new Error("not implemented")}

    public get step(): WizardStep {
        const defaultStep = this.defaultSteps.find(s => s.order === this.order)
        if (defaultStep) {
            return defaultStep
        }
        const step = this.getSteps().find(s => s.order === this.order)
        if (!step) {
          this.logger.error(`Cound not find step ${this.order}, wizard for chat id: ${this.chatId}`)
        }
        return step
    }

    public async getResponse(message: BotMessage, first = false): Promise<string[]> {
        const step = this.step
        const text = message.text
        if (!text) {
            this.error(`Received blank message`)
        }
        this.log(`Received message: ${text}`)

        this.modified = new Date()

        const answer = this.getAnswer(text)
        if (answer) {
            const result = await answer.result(text)
            if (typeof result === 'number') {
                this.order = result
                this.log(`Go to step ${this.order}`)
            } 
            if (Array.isArray(result)) {
                this.log(`Response: ${result}`)
                return [...result, BotUtil.msgFrom(step.message)]
            }
        }

        const newStep = this.step
        const response = newStep.message
        this.log(`Response: ${response}`)
        return [BotUtil.msgFrom(response)]
    }

    private getAnswer(text: string): WizardAnswer  {
        const defaultAnswer = this.defaultAnswers.find(a => a.phrase === text)
        if (defaultAnswer) {
            return defaultAnswer
        }
        const step = this.step
        if ((step.answers || []).length === 1) {
            const a = step.answers[0]
            if (a.input) {
                return a
            }
        }
        return (step.answers || []).find(a => a.phrase === text)
    }

    private readonly defaultSteps: WizardStep[] = [{
        order: -1,
        close: true,
        message: [`Dialog stopped`],
    }]

    private readonly defaultAnswers: WizardAnswer[] = [{
        phrase: 'stop',
        result: async () => -1
    }]

}
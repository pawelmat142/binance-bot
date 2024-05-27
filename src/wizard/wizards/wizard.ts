import { Logger } from "@nestjs/common";
import { ServiceProvider } from "../services.provider";

export interface WizardResponse {
    chatId: number,
    order?: number,
    message?: string[]
    buttons?: WizardButton[][]
}

export interface WizardStep {
    order: number
    message?: string[]
    close?: boolean
    switch?: string
    buttons?: WizardButton[][],
    process?: (input: string) => Promise<number>,
    nextOrder?: number,
    backButton?: boolean
}

export interface WizardButton {
    text: string
    callback_data: string,
    switch?: string, 
    process?(): Promise<number> //returns order of next step
}

export class Wizard {

    protected readonly logger = new Logger(Wizard.name)

    chatId: number
    
    order: number

    modified: Date

    private _steps: WizardStep[]

    constructor(
        chatId: number,
        protected readonly services: ServiceProvider
    ) {
        this.chatId = chatId
        this._steps = this.getSteps()
        this.order = 0
        this.modified = new Date()
    }


    protected isAdmin = (chatId: string): boolean => {
        return this.services.unitService.isAdmin(chatId)
    }

    public getSteps(): WizardStep[] {
        throw new Error('not implemented')
    }

    private initialized = false

    public getStep(): WizardStep {
        const steps = this.getSteps()
        if (this.order < 0 || this.order > steps.length-1) {
            this.logger.error(`Invalid order: ${this.order}`)
            return steps[0]
        }
        return steps[this.order]
    }

    public init = async ()  => {
        if (!this.initialized) {
            await this._init()
            this.initialized = true
        }
    }

    protected _init = async () => {}

}
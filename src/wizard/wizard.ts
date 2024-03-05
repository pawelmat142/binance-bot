import { ModuleRef } from "@nestjs/core"
import { ServicesService } from "./services.service"

export interface WizardStep {
    order: number
    message?: string[]
    process?(text?: string): Promise<number | string[]>
    close?: boolean
    switch?: string
}

export class Wizard {

    protected services: ServicesService

    chatId: number

    order: number

    private _steps: WizardStep[]

    modified: Date

    constructor(chatId: number, services: ServicesService) {
        this.services = services
        this.chatId = chatId
        this._steps = this.getSteps()
        this.order = 0
        this.modified = new Date()
    }

    public get isLastStep(): boolean {
        return this.order && this._steps.length === this.order+1
    }

    public get steps(): WizardStep[] {
        return this._steps
    }

    public getSteps(): WizardStep[] {
        throw new Error('not implemented')
    }

    protected readonly defaultStopPrompt = 'stop - to interrupt dialog'

}
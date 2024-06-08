import { Trade } from "../../binance/model/trade"
import { TradeCtx } from "../../binance/model/trade-variant"
import { Unit } from "../../unit/unit"
import { ServiceProvider } from "../services.provider"
import { Wizard, WizardStep } from "./wizard"

export class UnitWizard extends Wizard {

    protected unit: Unit

    constructor(unit: Unit, services: ServiceProvider) {
        super(Number(unit.telegramChannelId), services)
        this.unit = unit
    }

    public getSteps(): WizardStep[] {
        throw new Error("not implemented")
    }

    public getUnit(): Unit {
        return this.unit
    }

    protected select(trade: Trade) {
        const ctx = new TradeCtx({
            unit: this.unit,
            trade: trade
        })
        this.services.selectedTradeService.selectTrade(ctx)
    }

    protected unselectTrade() {
        this.services.selectedTradeService.unselect(this.unit)
    }

    protected get selectedTrade() {
        return this.unit ? this.services.selectedTradeService.getSelectedTrade(this.unit) : undefined
    }


}
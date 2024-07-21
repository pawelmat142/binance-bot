import { Injectable } from "@nestjs/common";
import { BehaviorSubject } from "rxjs";
import { Trade } from "../binance/model/trade";
import { TradeCtx } from "../binance/model/trade-variant";
import { Unit } from "../unit/unit";

@Injectable()
export class SelectedTradeProvider {

    private readonly selectedTrade$ = new BehaviorSubject<TradeCtx[]>([])

    public selectTrade(ctx: TradeCtx) {
        const ctxs = this.selectedTrade$.value.filter(c => c.unit.identifier !== ctx.unit.identifier)
        ctxs.push(ctx)
        this.selectedTrade$.next(ctxs)
    }

    public getSelectedTrade(unit: Unit): Trade {
        const ctxs = this.selectedTrade$.value
        return ctxs.find(c => c.unit.identifier === unit.identifier)?.trade
    }

    public unselect(unit: Unit) {
        const ctxs = this.selectedTrade$.value.filter(c => c.unit.identifier !== unit.identifier)
        this.selectedTrade$.next(ctxs)
    }

    
}
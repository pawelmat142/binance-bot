import { FuturesResult, Trade, TradeStatus, TradeType } from "../../binance/model/trade";
import { TradeCtx } from "../../binance/model/trade-variant";
import { ClientOrderIdUtil } from "../../binance/utils/client-order-id-util";
import { TradeUtil } from "../../binance/utils/trade-util";
import { Position } from "../../binance/wizard-binance.service";
import { Http } from "../../global/http/http.service";
import { Unit } from "../../unit/unit";
import { BotUtil } from "../bot.util";
import { ServiceProvider } from "../services.provider";
import { UnitWizard } from "./unit-wizard";
import { WizardButton, WizardStep } from "./wizard";

export class TestWizard extends UnitWizard {

    constructor(unit: Unit, services: ServiceProvider) {
        super(unit, services)
    }

    private trades: Trade[] = []
    private orders: FuturesResult[] = []
    private positions: Position[] = []

    private openPositions: Position[] = []

    private openOrders: FuturesResult[] = []

    private openStopLosses: FuturesResult[] = []
    private openTakeProfits: FuturesResult[] = []

    private selectedPosition?: Position
    private selectedOrder?: FuturesResult

    private error = ''

    private readonly STEP = {
        ZERO: 0,
        ERROR: 1,
        POSITIONS: 2,
        ORDERS: 3,
        TRADES: 4,

        SELECTED_POSITION: 5,
        POSITION_CLOSE: 6,

        SELECTED_ORDER: 7,
        ORDER_CLOSE: 8,
    }

    public getSteps(): WizardStep[] {
        return [{

            order: this.STEP?.ZERO,
            message: [`??`],
            buttons: [[{
                text: `Pending positions`,
                process: async () => {
                    await this.fetchPositions()
                    return this.STEP.POSITIONS
                }
            }], [{
                text: `Open orders`,
                process: async () => {
                    await this.fetchOrders()
                    return this.STEP.ORDERS
                }
            }]]
        }, {

            order: this.STEP?.ERROR,
            message: [this.error],
            nextOrder: 0,
            // close: true
        }, {

            order: this.STEP?.POSITIONS,
            message: [`Pending positions:`],
            buttons: this.openPositionsButtons(),
            backButton: true
        }, {

            order: this.STEP?.ORDERS,
            message: [`Open Orders`],
            buttons: this.openOrdersButtons(),
            backButton: true
        }, {

            order: this.STEP?.TRADES,
            message: [`todo`],
            backButton: true
        }, {

            order: this.STEP?.SELECTED_POSITION,
            message: [BotUtil.positionLabel(this.selectedPosition)],
            buttons: this.selectedPositionButtons(),
            backButton: true
        }, {
            order: this.STEP?.POSITION_CLOSE,
            message: [`Are you sure you want to close position?`],
            buttons: [[{
                text: 'Cancel',
                callback_data: `cancel`,
                process: async () => this.STEP?.SELECTED_POSITION
            }, {
                text: `CONFIRM`,
                callback_data: `confirm`,
                process: async () => this.closePosition()
            }]]
        },{

            order: this.STEP?.SELECTED_ORDER,
            message: [BotUtil.orderLabel(this.selectedOrder)],
            buttons: this.selectedOrderButtons(),
            backButton: true
        }, {

            order: this.STEP?.ORDER_CLOSE,
            message: [`Are you sure you want to close order`],
            buttons: [[{
                text: 'Cancel',
                callback_data: `cancel`,
                process: async () => this.STEP?.SELECTED_ORDER
            }, {
                text: `CONFIRM`,
                callback_data: `confirm`,
                process: async () => this.closeOrder()
            }]]
        } ]
    }



    private async fetchPositions(){
        this.positions = await this.services.tradeService.fetchPositions(this.unit)

        this.openPositions = this.positions
            .filter(p => Number(p.positionAmt) !== 0)
        
        this.logger.log(`Fetched ${this.positions.length} orders`)
    }

    private async fetchOrders() {
        this.orders = await this.services.tradeService.fetchOpenOrders(this.unit)
        this.openOrders = this.orders.filter(o => o.status === TradeStatus.NEW)
        this.logger.log(`Fetched ${this.orders.length} orders`)
    }


    private openPositionsButtons(): WizardButton[][] {
        if (this.order !== this.STEP?.POSITIONS) {
            return []
        }

        return this.openPositions.map(p => {
            return [{
                text: `${BotUtil.positionLabel(p)}`,
                process: async () => {
                    this.selectedPosition = p
                    await this.fetchTradesBySelectedPosition()
                    return this.STEP.SELECTED_POSITION
                }
            }]
        })
    }



    private selectedPositionButtons(): WizardButton[][] {
        if (this.order !== this.STEP?.SELECTED_POSITION) {
            return []
        }
        const buttons = [[{
            text: 'Close position',
            process: async () => this.STEP.POSITION_CLOSE
        }]]

        return buttons
    }







    private openOrdersButtons(): WizardButton[][] {
        if (this.order !== this.STEP?.ORDERS) {
            return []
        }
        return this.openOrders.map(o => {
            return [{
                text: BotUtil.orderLabel(o),
                process: async () => {
                    this.selectedOrder = o
                    await this.fetchTradesByOpenOrder()
                    return this.STEP.SELECTED_ORDER
                }
            }]
        })
    }

    private selectedOrderButtons(): WizardButton[][] {
        if (this.order !== this.STEP?.SELECTED_ORDER) {
            return []
        }
        const buttons = [[{
            text: `Close order`,
            process: async () => {
                return this.STEP.ORDER_CLOSE
            }
        }]]

        if (this.selectedTrade) {
            buttons.push()
        }
        return buttons
    }





    private async fetchTradesBySelectedPosition() {
        const trades = await this.services.binance.fetchTradesBySelectedPosition(this.selectedPosition, this.unit)
        trades.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        if (trades?.length) {
            this.select(trades[0])
        } else {
            this.unselectTrade()
        }
    }

    private async fetchTradesByOpenOrder() {
        const trades = await this.services.binance.fetchTradesBySymbol(this.unit, this.selectedOrder.symbol)
        trades.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        if (trades?.length) {
            this.select(trades[0])
        } else {
            this.unselectTrade()
        }
    }

    private async closePosition(): Promise<number> {
        try {
            const result = await this.services.tradeService.closePositionBy(this.selectedPosition, this.unit)
            const trade = this.selectedTrade
            if (trade) {
                const ctx = new TradeCtx({ trade: trade, unit: this.unit })
                ctx.trade.marketResult = result
                await this.services.limitOrdersService.closeAllOpenOrders(ctx)
            }
            return this.STEP.POSITIONS
        
        } catch (error) {
            this.error = Http.handleErrorMessage(error)
            this.logger.error(this.error)
            return this.STEP.ERROR
        }
    }

    private async closeOrder(): Promise<number> {
        try {
            const result = await this.services.tradeService.closeOrder(this.unit, this.selectedOrder.symbol, this.selectedOrder.clientOrderId)
            const trade = this.selectedTrade
            if (trade) {
                const ctx = new TradeCtx({ unit: this.unit, trade: trade })
                ClientOrderIdUtil.updaResult(ctx, result)
                TradeUtil.addLog(`Closed order ${result.clientOrderId}`, ctx, this.logger)
                this.services.binance.update(ctx)
            }
            return this.STEP.ORDERS
        } catch (error) {
            this.error = Http.handleErrorMessage(error)
            this.logger.error(this.error)
            return this.STEP.ERROR
        }
    }


}
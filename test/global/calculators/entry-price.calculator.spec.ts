import { Test, TestingModule } from "@nestjs/testing";
import { TradeVariant } from "../../../src/binance/model/trade-variant"
import { EntryPriceCalculator } from "../../../src/global/calculators/entry-price.calculator"
import { Signal } from "../../../src/signal/signal"
import { CalculationsService } from "../../../src/binance/calculations.service";

describe('EntryPriceCalculator', () => {

    let calculationsService: CalculationsService

    beforeEach(async () => {

        const module: TestingModule = await Test.createTestingModule({
        providers: [{
            provide: CalculationsService,
            useValue: {
                fetchMarketPrice: jest.fn(),  // Mocking the fetchMarketPrice method
                fixPricePrecision: jest.fn(),  // Mocking the fixPricePrecision method
            }
        }],

        }).compile()

        calculationsService = module.get<CalculationsService>(CalculationsService)

    })


    it('should entryByMarket if LONG and market price less than entry zone end', async () => {
        const signal = getSignal()

        jest.spyOn(calculationsService, 'fetchMarketPrice').mockReturnValue(Promise.resolve(55555.555))
        await EntryPriceCalculator.start(signal, calculationsService)

        expect(signal.variant.entryByMarket).toEqual(true)
    })

    it('should not entryByMarket if LONG and market price greater than entry zone end', async () => {
        const signal = getSignal()

        jest.spyOn(calculationsService, 'fetchMarketPrice').mockReturnValue(Promise.resolve(66666.666))
        jest.spyOn(calculationsService, 'fixPricePrecision').mockImplementation((price: number, symbol: string) => Number(price.toFixed(2)))
        await EntryPriceCalculator.start(signal, calculationsService)

        expect(signal.variant.entryByMarket).toEqual(false)
    })

})



function getSignal(): Signal {
    return {
        _id: 'objectId',
        content: 'telegramMessageContent',
        timestamp: new Date(),
        telegramMessageId: 'telegramMessageId',
        variant: {
            side: 'BUY',
            symbol: 'BTCUSDT',
            entryZoneStart: 60000,
            entryZoneEnd: 61000,
            takeProfits: [],
            stopLoss: 59000,
            leverMin: 25,
            leverMax: 25,
            risk: false,
            highRisk: false,
        } as TradeVariant,
        valid: false,
        logs: []
    }
}
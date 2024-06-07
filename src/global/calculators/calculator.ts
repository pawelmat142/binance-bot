import { CalculationsService } from "src/binance/calculations.service";

export class Calculator {

    service: CalculationsService 

    constructor(service: CalculationsService) {
        this.service = service
    }
}
import { Logger } from "@nestjs/common";
import { CalculationsService } from "src/binance/calculations.service";

export class Calculator<T> {

    protected readonly logger = new Logger(this.constructor.name)

    service: CalculationsService 

    constructor(service: CalculationsService) {
        this.service = service
    }

    protected async calculate(): Promise<T> {
        throw new Error("not implemented")
    }
}
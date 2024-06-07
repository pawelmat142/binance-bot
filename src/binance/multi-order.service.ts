import { Injectable } from "@nestjs/common";
import { CalculationsService } from "./calculations.service";

@Injectable()
export class MultiOrderService {

    constructor(
        private readonly calculationsService: CalculationsService
    ) {}

}
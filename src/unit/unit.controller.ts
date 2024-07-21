import { Controller, Get, Param } from '@nestjs/common';
import { UnitService } from './unit.service';

@Controller('unit')
export class UnitController {

    constructor(
        private readonly unitService: UnitService,
    ) {}


    @Get('clean-log/:identifier')
    cleanLogs(@Param('identifier') identifier: string) {
        return this.unitService.cleanLogs(identifier)
    }

    @Get('logs/:identifier')
    getLogs(@Param('identifier') identifier: string) {
        return this.unitService.getLogs(identifier)
    }

}

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


    @Get('socket/keepalive/:identifier')
    keepAlive(@Param('identifier') identifier: string) {
        const unit = this.unitService.getUnit(identifier)
        return this.unitService.keepAliveListenKey(unit)
    }

    @Get('socket/close/:identifier')
    socketClose(@Param('identifier') identifier: string) {
        const unit = this.unitService.getUnit(identifier)
        return this.unitService.stopListening(unit)
    }

}

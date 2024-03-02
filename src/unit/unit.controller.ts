import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { UnitService } from './unit.service';

@Controller('unit')
export class UnitController {

    constructor(
        private readonly unitService: UnitService,
    ) {}

    @Get('test')
    test() {
        // return this.unitService.loadUnits()
        const unit = this.unitService.getUnit('ppp')
        return this.unitService.startListening(unit)

        // return this.unitService.keepAliveListenKey(unit)
        // return this.unitService.removeListenKey(unit.identifier)
    }

    @Get('socket/keepalive/:identifier')
    keepAlive(@Param('identifier') identifier: string) {
        const unit = this.unitService.getUnit(identifier)
        return this.unitService.keepAliveListenKey(unit)
    }


    @Post('add-unit')
    addUnit(@Body() body: any) {
        return this.unitService.addUnit(body)
    }

    @Get('clean-log/:identifier')
    cleanLogs(@Param('identifier') identifier: string) {
        return this.unitService.cleanLogs(identifier)
    }

    @Get('logs/:identifier')
    getLogs(@Param('identifier') identifier: string) {
        return this.unitService.getLogs(identifier)
    }


    @Get('socket/close/:identifier')
    socketClose(@Param('identifier') identifier: string) {
        const unit = this.unitService.getUnit(identifier)
        return this.unitService.stopListening(unit)
    }




}

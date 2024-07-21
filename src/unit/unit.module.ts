import { Module } from '@nestjs/common';
import { UnitService } from './unit.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Unit, UnitSchema } from './unit';
import { UnitController } from './unit.controller';
import { ScheduleModule } from '@nestjs/schedule';
import { AppHttpModule } from '../global/http/http.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AppHttpModule,
    MongooseModule.forFeature([{
      name: Unit.name,
      schema: UnitSchema,
    }]),
  ],
  providers: [UnitService],
  exports: [UnitService],
  controllers: [UnitController]
})
export class UnitModule {}

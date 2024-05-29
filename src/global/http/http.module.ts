import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { Http } from './http.service';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Module({
    imports: [
        HttpModule
    ],
    providers: [Http], 
    exports: [Http]
})
export class AppHttpModule {}

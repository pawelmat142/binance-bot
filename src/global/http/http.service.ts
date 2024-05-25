import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';
import { HttpMethod } from '../http-method';
import { AxiosError, AxiosRequestConfig } from 'axios';
import { isBinanceError } from 'src/binance/model/binance.error';

export interface FetchOptions {
    url: string
    method: HttpMethod,
    body?: any
    headers: { [key: string]: string }
}

@Injectable()
export class Http {

    private readonly logger = new Logger(Http.name)

    constructor (
        private readonly httpService: HttpService
    ) {}

    async fetch<ResultType>(config: AxiosRequestConfig): Promise<ResultType> {
        const response = await lastValueFrom(this.httpService.request<ResultType>(config))
        const status = response.status
        if (status >= 300) {
            this.logger.error(`[${status}] Http status`)
            throw new Error(response.statusText)
        }
        if (isBinanceError(response.data)) {
            throw new Error(response.data.msg)
        }
        return response.data
    }

    public handleFetchError(error): string {
        if (error instanceof AxiosError) {
            const errorData = error.response?.data
            if (typeof errorData?.code === 'number') {
                return errorData.msg
            }
        }
        // TODO remove
        console.log(error)
        return error
    }

}

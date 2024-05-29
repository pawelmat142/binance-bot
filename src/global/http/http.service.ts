import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';
import { HttpMethod } from '../http-method';
import { AxiosError, AxiosRequestConfig } from 'axios';
import { BinanceError, isBinanceError } from 'src/binance/model/binance.error';

export interface FetchOptions {
    url: string
    method: HttpMethod,
    body?: any
    headers: Object
}

@Injectable()
export class Http {

    private readonly logger = new Logger(Http.name)

    constructor (
        private readonly httpService: HttpService
    ) {}

    async fetch<ResultType>(config: AxiosRequestConfig): Promise<ResultType> {
        this.logger.warn(config.url)
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

    public handleErrorMessage(error): string {
        if (error instanceof AxiosError) {
            const errorData = error.response?.data
            if (isBinanceError(errorData)) {
                return errorData.msg
            }
            if (error.response?.status ?? 0 > 300) {
                return `[${error.response?.status}] ${error.response?.statusText}`
            }
        }
        // TODO remove
        console.log(error)
        return error
    }

    public handleFetchError(error): BinanceError {
        if (error instanceof AxiosError) {
            const errorData = error.response?.data
            if (isBinanceError(errorData)) {
                return errorData
            }
        }
        // TODO remove
        console.log(error)
        return error
    }

}

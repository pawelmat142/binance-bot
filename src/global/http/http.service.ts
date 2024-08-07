import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { AxiosError, AxiosRequestConfig } from 'axios';
import { lastValueFrom } from 'rxjs';
import * as JSONbig from 'json-bigint';
import { isBinanceError, BinanceError } from '../../binance/model/binance.error';

@Injectable()
export class Http {

    private readonly logger = new Logger(Http.name)

    constructor (
        private readonly httpService: HttpService,
    ) {}

    async fetch<ResultType>(config: AxiosRequestConfig): Promise<ResultType> {
        // const response = await lastValueFrom(this.httpService.request<ResultType>(config))
        config.responseType = 'text'
        const response = await lastValueFrom(this.httpService.request(config))

        const status = response.status
        if (status >= 300) {
            this.logger.error(`[${status}] Http status`)
            throw new Error(response.statusText)
        }

        const responseDataString = response.data
        if (!responseDataString) {
            return null
        }
        const data = JSONbig.parse(responseDataString)
        if (isBinanceError(data)) {
            throw new Error(response.data.msg)
        }
        return data as ResultType
    }

    public static handleErrorMessage(error): string {
        if (error instanceof AxiosError) {
            if (error.response?.data) {
                if (error.response.status === 404) {
                    return 'Not found 404'
                }
                const errorData = JSON.parse(error.response?.data)
                if (isBinanceError(errorData)) {
                    return errorData.msg
                }
            }
            if (error.response?.status ?? 0 > 300) {
                return `[${error.response?.status}] ${error.response?.statusText}`
            }
        }
        return error
    }

    public static handleFetchError(error): BinanceError {
        if (error instanceof AxiosError) {
            if (error.response?.data) {
                const errorData = JSON.parse(error.response?.data)
                if (isBinanceError(errorData)) {
                    return errorData
                }
            }
        }
        // TODO remove
        console.log(error)
        console.log('console.log2')
        return error
    }

}

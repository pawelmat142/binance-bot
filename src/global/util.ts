import * as moment from 'moment-timezone';
import * as crypto from 'crypto'
import { Types } from 'mongoose';
import { Unit } from 'src/unit/unit';
import Decimal from 'decimal.js';
import { Logger } from '@nestjs/common';

export const toDateString = (date: Date): string => {
    return moment(date).format('YY-MM-DD hh:mm:ss')
}

const getSignature = (queryString: string, unit: Unit): string => {
    return crypto.createHmac('sha256', unit.binanceApiSecret).update(queryString).digest('hex')
}

export const sign = (uri: string, queryString: string, unit: Unit): string => {
    const andSeparator = queryString ? `&` : ''
    const result = `${uri}?${queryString}${andSeparator}signature=${getSignature(queryString, unit)}`
    Logger.warn(result)
    return result
}

export const newObjectId = (): string => new Types.ObjectId().toHexString()


export const getHeaders = (unit: Unit): { [key: string]: string } => {
    return {
        'X-MBX-APIKEY': unit.binanceApiKey,
        'Content-Type': 'application/x-www/form-urlencoded'
    }
}

export const queryParams = (params: Object): string => {
    const queryString = Object.keys(params).map(key => {
        const value = params[key].toString()
        const encoded = encodeURIComponent(value)
        const keyValue = key + '=' + encoded
        return keyValue
    }).join('&')
    return queryString
}

export const roundWithFraction = (input: Decimal, fraction: Decimal) => {
    return new Decimal(Math.ceil(input.div(fraction).toNumber())).times(fraction)
}

export const findMax = (...values: Decimal[]) => {
    return new Decimal(Math.max(...values.map(v => v.toNumber())))
}
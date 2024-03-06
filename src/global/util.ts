import * as moment from 'moment-timezone';
import * as crypto from 'crypto'
import { Types } from 'mongoose';
import { Unit } from 'src/unit/unit';
import Decimal from 'decimal.js';

export const toDateString = (date: Date): string => {
    return moment(date).format('YY-MM-DD hh:mm:ss')
}

const getSignature = (queryString: string, unit: Unit): string => {
    return crypto.createHmac('sha256', unit.binanceApiSecret).update(queryString).digest('hex')
}

export const sign = (uri: string, queryString: string, unit: Unit): string => {
    const andSeparator = queryString ? `&` : ''
    return `${uri}?${queryString}${andSeparator}signature=${getSignature(queryString, unit)}`
}

export const newObjectId = (): string => new Types.ObjectId().toHexString()



export const getHeaders = (unit: Unit) => {
    return {
        'X-MBX-APIKEY': unit.binanceApiKey,
        'Content-Type': 'application/x-www/form-urlencoded'
    }
}

export const queryParams = (params: Object): string => {
    // return Object.keys(params).map(key => `${key}=${params[key]}`).join('&')
    // return Object.keys(params).map(key => `${key}=${encodeURIComponent(params[key])}`).join('&')
    const queryString = Object.keys(params).map(key => {
        const value = params[key].toString()
        const encoded = encodeURIComponent(value)
        const keyValue = key + '=' + encoded
        return keyValue
    }).join('&')
    return queryString
}

export const EVERY_45_MINUTES = '0 */45 * * * *'

export const roundWithFraction = (input: Decimal, fraction: Decimal) => {
    return new Decimal(Math.ceil(input.div(fraction).toNumber())).times(fraction)
}

export const findMax = (...values: Decimal[]) => {
    return new Decimal(Math.max(...values.map(v => v.toNumber())))
}
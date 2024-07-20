import { Logger } from "@nestjs/common"
import { Unit } from "../../unit/unit"
import * as crypto from 'crypto'
import { Types } from "mongoose"
import * as moment from 'moment-timezone';

export abstract class Util {

    public static payload(params: Object): string {
        return Object.entries(params).map(([key, val]) => `${key}=${encodeURIComponent(val)}`).join('&')
    }

    public static signPayload(payload: string, unit: Unit): string {
        return crypto.createHmac('sha256', unit.binanceApiSecret).update(payload).digest('hex')
    }

    public static sign(uri: string, params: Object, unit: Unit): string {
        const payload = this.payload(params)
        const and = payload ? `&` : ''
        const signature = `${and}signature=${this.signPayload(payload, unit)}`
        const result = `${uri}?${payload}${signature}`
        Logger.warn(result)
        return result
    }

    public static getHeaders(unit: Unit): { [key: string]: string } {
        return {
            'X-MBX-APIKEY': unit.binanceApiKey,
            'Content-Type': 'application/x-www/form-urlencoded'
        }
    }

    public static newObjectId(): string {
        return new Types.ObjectId().toHexString()
    }

    public static removeNumbersFromstring(string: string): string {
        return string.replace(/[0-9]/g, '');
    }

    public static toDateString(date: Date): string {
        return moment(date).format('YY-MM-DD hh:mm:ss')
    }

}
import { FuturesResult } from "./trade"

export interface BinanceError {
    code: number
    msg: string
}

export type BinanceResultOrError = FuturesResult | BinanceError


export const isBinanceError = (object: BinanceResultOrError): object is BinanceError => {
    // if (object instanceof Object) {
    return 'code' in object && 'msg' in object
    // }
    return false
}

export abstract class BinanceErrors {

    public static readonly CHANGE_MODE = -4046

}
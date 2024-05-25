export interface BinanceError {
    code: number
    msg: string
}

export const isBinanceError = (object: any): object is BinanceError => {
    return 'code' in object && 'msg' in object
}

export abstract class BinanceErrors {

    public static readonly CHANGE_MODE = -4046

}
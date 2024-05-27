export interface BinanceError {
    code: number
    msg: string
}

export const isBinanceError = (object: Object): object is BinanceError => {
    if (object instanceof Object) {
        return 'code' in object && 'msg' in object
    }
    return false
}

export abstract class BinanceErrors {

    public static readonly CHANGE_MODE = -4046

}
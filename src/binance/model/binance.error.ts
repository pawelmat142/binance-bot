export interface BinanceError {
    code: number
    msg: string
}

export const isBinanceError = (object: any): object is BinanceError => {
    return 'code' in object && 'msg' in object
}
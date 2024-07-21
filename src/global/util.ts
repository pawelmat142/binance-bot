import Decimal from 'decimal.js';


// deprecated
export const roundWithFraction = (input: Decimal, fraction: Decimal) => {
    return new Decimal(Math.ceil(input.div(fraction).toNumber())).times(fraction)
    }
    
// deprecated
export const findMax = (...values: Decimal[]) => {
    return new Decimal(Math.max(...values.map(v => v.toNumber())))
}
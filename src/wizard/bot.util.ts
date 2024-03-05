import { Wizard } from "./wizard"

export abstract class BotUtil {

    public static readonly USDT_PER_TRANSACTION_WIZARD = 'usdt-per-transaction'

    public static msgFrom = (lines: string[]) => {
        return (lines || []).reduce((acc, line) => acc + line + '\n', '')
    }

    public static readonly WiZARD_EXPIRATION_MINUTES = 15 

    public static isExpired = (wizard: Wizard): boolean => {
        const expirationTime = new Date(wizard.modified)
        expirationTime.setMinutes(expirationTime.getMinutes() + this.WiZARD_EXPIRATION_MINUTES)
        return expirationTime < new Date()
    }
    
    public static switchResponse = (wizardName: string) => {
        return [`switch ${wizardName}`]
    }

}
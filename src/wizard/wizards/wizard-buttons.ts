export abstract class WizBtn {

    static readonly AVOID_BUTTON_CALLBACK = 'AVOID_BUTTON_CALLBACK'

    static readonly STOP = 'stop' 
    static readonly BACK = 'back' 

    static readonly YES = 'yes' 
    static readonly NO = 'no' 

    static readonly deactivate = 'deactivate' 
    static readonly activate = 'activate' 

    static readonly amount = 'amount' 

    static readonly log = 'log' 


    static readonly trade = 'trade' 

    static readonly pendingPositions = 'pendingPositions'.toLocaleLowerCase()
    static readonly openOrders = 'openOrders'.toLocaleLowerCase()
    
    static readonly slToEntryPrice = 'slToEntryPrice'.toLocaleLowerCase()
    static readonly slTo = 'slTo'.toLocaleLowerCase()
    static readonly takeSomeProfits = 'takeSomeProfits'.toLocaleLowerCase()
    static readonly closePosition = 'closePosition'.toLocaleLowerCase()



    static readonly admin = 'admin' 

    static readonly signal = 'signal' 


    static readonly usdtPerTransaction = 'usdtPerTransaction'.toLowerCase()
    static readonly allow100perBtcTransaction = 'allow100perBtcTransaction'.toLowerCase()
    static readonly balance = 'balance' 

}
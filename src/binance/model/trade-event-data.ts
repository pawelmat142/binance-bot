export interface TradeEventData {
    unitIdentifier?: string

    e: string; // Event type
    T: number; // Trade time
    E: number; // Event time
    o: {
        s: string; // Symbol
        c: string; // Client order ID
        S: string; // Side (BUY/SELL)
        o: string; // Order type (LIMIT, MARKET, etc.)
        f: string; // Time in force
        q: string; // Quantity
        p: string; // Price
        ap: string; // Average price
        sp: string; // Stop price
        x: string; // Execution type
        X: string; // Order status
        i: number; // Order ID
        l: string; // Order last executed quantity
        z: string; // Order filled quantity
        L: string; // Last filled price
        n: string; // Commission asset
        N: string; // Commission asset
        T: number; // Order trade time
        t: number; // Trade ID
        b: string; // Bids notional value
        a: string; // Asks notional value
        m: boolean; // Is the buyer the market maker?
        R: boolean; // Reduce only
        wt: string; // Working type
        ot: string; // Original order type
        ps: string; // Position side
        cp: boolean; // Close position
        rp: string; // Realized profit
        pP: boolean; // Is maker buyer
        si: number; // Stop price working type
        ss: number; // Stop price trigger condition
        V: string; // Order type
        pm: string; // Time in force
        gtd: number; // Good till date
    };
}
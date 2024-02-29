import { Unit } from "./unit"
import { WebSocket } from 'ws';

export abstract class UnitUtil {

    public static readonly socketUri: string = 'wss://fstream.binance.com/ws'


    public static state(ws: WebSocket): string {
        switch (ws.readyState) {
            case 0: return 'CONNECTING'
            case 1: return 'OPEN'
            case 2: return 'CLOSING'
            case 3: return 'CLOSED'
            default: throw new Error ('Wronk readystate')
        }
    }

    public static socketOpened(unit: Unit): boolean {
        const readyState = unit.socket?.readyState
        if (WebSocket.OPEN === readyState || WebSocket.CONNECTING === readyState) {
            return true
        }
        return false
    }

}
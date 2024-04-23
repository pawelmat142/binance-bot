export interface TelegramMessage {

    date: number
    message: string
    id: number

    from_id: PeerUser
    peer_id: PeerUser

    via_bot_id: number

    out: boolean

    media: MessageMedia

    error?: any
}

export interface PeerId {
    channel_id: string
}

export interface PeerUser {
    user_id: number
    channel_id: string
}

export interface MessageMedia {
    photo: Photo
}

export interface Photo {
    has_stickers: boolean
    id: string
    access_hash: string
    file_reference: any
    date: number
    sizes: any
    video_sizes: any
    dc_id: number
    file_id: string
}
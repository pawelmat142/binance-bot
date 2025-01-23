import { TelegramMessage } from "./message";

export interface AuthUser {
  _: string; // Should be 'user'
  flags: number;
  self: boolean;
  contact: boolean;
  mutual_contact: boolean;
  deleted: boolean;
  bot: boolean;
  bot_chat_history: boolean;
  bot_nochats: boolean;
  verified: boolean;
  restricted: boolean;
  min: boolean;
  bot_inline_geo: boolean;
  support: boolean;
  scam: boolean;
  apply_min_photo: boolean;
  fake: boolean;
  bot_attach_menu: boolean;
  premium: boolean;
  attach_menu_enabled: boolean;
  flags2: number;
  bot_can_edit: boolean;
  id: string;
  access_hash: string;
  first_name: string;
  phone: string;
  status: {
    _: string; // Should be 'userStatusOffline'
    was_online: number;
  }
}

export interface AuthResponse {
  _: string; // Should be 'auth.authorization'
  flags: number;
  setup_password_required: boolean;
  future_auth_token: Uint8Array; // Array of bytes
  user: AuthUser
}
  

export interface TelegramUpdates {
  _: string;
  updates: TelegramUpdate[];
  users: AuthUser[];

  // TODO
  // chats: Chat[];
  chats: object[];
  date: number;
  seq: number;
}

export interface TelegramUpdate {
  _: string;
  message?: TelegramMessage; // Use a specific type or interface if available
  pts: number;
  pts_count: number;
  peer?: object; // Use a specific type or interface if available
  max_id?: number;
}
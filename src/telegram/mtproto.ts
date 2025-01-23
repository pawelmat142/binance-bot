import * as MTProto from '@mtproto/core';

export interface MTProtoConfig {
  api_id: number;
  api_hash: string;
  test?: boolean;
  sessionPath: string
}

export interface MTProtoResponse {
  [key: string]: any;
}

export class MTProtoClient {
  public mtproto: MTProto;

  constructor(config: MTProtoConfig) {
    this.mtproto = new MTProto({
      api_id: config.api_id,
      api_hash: config.api_hash,
      test: config.test || false,
      storageOptions: {
        path: config.sessionPath,
      },
    });
  }

  public async call(method: string, params?: Record<string, any>): Promise<MTProtoResponse> {
    try {
      const result = await this.mtproto.call(method, params);
      return result;
    } catch (error) {
      console.error('MTProto call error:', error);
      throw error;
    }
  }

  public async getUserInfo(userId: number): Promise<MTProtoResponse> {
    return this.call('users.getFullUser', { id: { user_id: userId } });
  }
}
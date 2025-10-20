import type ReconnectingWebSocket from 'reconnecting-websocket';

export interface WebSocketConnection {
  ticker: string;
  ws: ReconnectingWebSocket;
  isConnected: boolean;
}

export interface ConfirmationMessage {
  topic: string;
  time: string;
  message: {
    account: string;
    amount: string;
    hash: string;
    confirmation_type: string;
    block: {
      type: string;
      account: string;
      previous: string;
      representative: string;
      balance: string;
      link: string;
      link_as_account: string;
      signature: string;
      work: string;
      subtype: string;
    };
  };
}

export interface SubscriptionMessage {
  action: 'subscribe' | 'update';
  topic: string;
  options: {
    accounts?: string[];
    accounts_add?: string[];
    accounts_remove?: string[];
  };
}

export interface SubscriptionResponse {
  success?: string;
  error?: string;
}

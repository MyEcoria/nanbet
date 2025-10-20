import type { Response } from 'express';

export interface SSEClient {
  sessionId: string;
  response: Response;
  lastHeartbeat: Date;
}

export interface SSEBaseEvent {
  type: string;
}

export interface SSEConnectedEvent extends SSEBaseEvent {
  type: 'connected';
  message: string;
  sessionId: string;
}

export interface SSEAuthenticatedEvent extends SSEBaseEvent {
  type: 'authenticated';
  account: string;
  authToken: string;
  timestamp: string;
}

export interface SSEErrorEvent extends SSEBaseEvent {
  type: 'error';
  error: string;
  timestamp: string;
}

export type SSEEvent = SSEConnectedEvent | SSEAuthenticatedEvent | SSEErrorEvent;

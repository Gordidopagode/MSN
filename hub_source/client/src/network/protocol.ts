export type ServerMessageType =
  | "REGISTER_OK"
  | "AUTH_OK"
  | "RECONNECT_OK"
  | "SYNC_DATA"
  | "MESSAGE_ACK"
  | "MESSAGE"
  | "HISTORY"
  | "CONVERSATION_CREATED"
  | "USER_STATUS_CHANGED"
  | "LOGOUT_OK"
  | "SESSION_TAKEN"
  | "ERROR";

export type ClientCommand =
  | "REGISTER"
  | "LOGIN"
  | "RECONNECT"
  | "REQUEST_SYNC"
  | "CHANGE_STATUS"
  | "SEND_MESSAGE"
  | "GET_HISTORY"
  | "CREATE_GROUP"
  | "LOGOUT";

export type PresenceStatus = "online" | "away" | "busy" | "offline";

export interface ServerEnvelope<T = unknown> {
  type: ServerMessageType | string;
  payload: T;
}

export interface ErrorPayload {
  code: string;
  message: string;
  [key: string]: unknown;
}

export interface IdentityPayload {
  user_id: string;
  username: string;
  display_name: string;
}

export interface AuthPayload extends IdentityPayload {
  session_id: string;
}

export interface PresencePayload {
  status: PresenceStatus;
  status_message: string;
  username?: string;
  display_name?: string;
}

export interface MessagePayload {
  message_id: string;
  conversation_id: string;
  sender_id: string;
  timestamp: string;
  type: "text" | string;
  payload: {
    content?: string;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
}

export interface ConversationPayload {
  conversation_id: string;
  name: string | null;
  is_group: boolean;
  participants: string[];
  created_at: string;
  last_message_at: string | null;
}

export interface SyncDataPayload {
  version: string;
  timestamp: string;
  data: {
    identity: IdentityPayload;
    session: { session_id: string };
    presence: Record<string, PresencePayload>;
    conversations: ConversationPayload[];
    history: Record<string, MessagePayload[]>;
  };
}

export interface HistoryPayload {
  conversation_id: string;
  messages: MessagePayload[];
  before?: string | null;
}

export interface MessageAckPayload {
  message_id: string;
  conversation_id: string;
  duplicate: boolean;
}

export interface StatusChangedPayload extends PresencePayload {
  user_id: string;
  username: string;
  display_name: string;
}

export interface ConversationCreatedPayload {
  conversation: ConversationPayload;
  invited_by?: string;
}

export interface SessionTakenPayload {
  reason?: string;
}

export function isServerEnvelope(value: unknown): value is ServerEnvelope {
  return Boolean(
    value &&
      typeof value === "object" &&
      "type" in value &&
      typeof (value as { type?: unknown }).type === "string" &&
      "payload" in value,
  );
}

export function errorMessage(payload: unknown): string {
  if (payload && typeof payload === "object") {
    const candidate = payload as Partial<ErrorPayload>;
    if (typeof candidate.message === "string" && candidate.message.trim()) {
      return candidate.message;
    }
    if (typeof candidate.code === "string") return candidate.code;
  }
  return "O servidor retornou um erro inesperado.";
}

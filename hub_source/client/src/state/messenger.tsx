import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MSN_SERVER_URL } from "@/network/config";
import {
  AuthPayload,
  ConversationCreatedPayload,
  ConversationPayload,
  ErrorPayload,
  errorMessage,
  HistoryPayload,
  MessageAckPayload,
  MessagePayload,
  PresencePayload,
  ServerEnvelope,
  StatusChangedPayload,
  SyncDataPayload,
} from "@/network/protocol";
import {
  ConnectionState,
  MessengerWebSocket,
} from "@/network/websocket";

export type Status = "online" | "away" | "busy" | "offline";

export interface Identity {
  userId: string;
  username: string;
  displayName: string;
  sessionId: string;
}

export interface ChatMessage {
  id: string;
  author: "them" | "me";
  authorName: string;
  text: string;
  time: string;
}

export interface Conversation {
  id: string;
  name: string;
  initials: string;
  status: Status;
  lastMessage: string;
  time: string;
  color: string;
  kind: "person" | "group";
  messages: ChatMessage[];
  participantIds: string[];
}

type PendingRequest = {
  expected: string[];
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
};

type KnownUser = {
  userId: string;
  username: string;
  displayName: string;
};

export interface MessengerContextValue {
  session: Identity | null;
  connectionState: ConnectionState;
  serverUrl: string;
  error: string | null;
  busy: boolean;
  status: Status;
  conversations: Conversation[];
  presence: Record<string, PresencePayload>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, displayName: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changeStatus: (status: Status, statusMessage?: string) => Promise<void>;
  sendMessage: (conversationId: string, text: string) => Promise<void>;
  requestHistory: (conversationId: string, limit?: number) => Promise<void>;
  createGroup: (name: string, participants: string[]) => Promise<void>;
  reconnectNow: () => Promise<void>;
  clearError: () => void;
}

const MessengerContext = createContext<MessengerContextValue | null>(null);

const palette = ["#84b9d8", "#d8b4a1", "#b7c58b", "#b7a7cb", "#d3b47e"];

function displayTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function initialsFor(name: string, fallbackId: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  if (words.length === 1 && words[0].length >= 2) return words[0].slice(0, 2).toUpperCase();
  return fallbackId.slice(0, 2).toUpperCase() || "CO";
}

function colorFor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function textFromMessage(message: MessagePayload): string {
  if (typeof message.payload?.content === "string") return message.payload.content;
  return `[${message.type}]`;
}

function statusForConversation(
  conversation: ConversationPayload,
  ownUserId: string,
  presence: Record<string, PresencePayload>,
): Status {
  const otherIds = conversation.participants.filter((id) => id !== ownUserId);
  if (!otherIds.length) return "offline";
  const statuses = otherIds.map((id) => presence[id]?.status ?? "offline");
  if (statuses.includes("online")) return "online";
  if (statuses.includes("busy")) return "busy";
  if (statuses.includes("away")) return "away";
  return "offline";
}

function mapMessage(
  message: MessagePayload,
  identity: Identity,
  users: Record<string, KnownUser>,
): ChatMessage {
  const sender = users[message.sender_id];
  return {
    id: message.message_id,
    author: message.sender_id === identity.userId ? "me" : "them",
    authorName:
      message.sender_id === identity.userId
        ? identity.displayName
        : sender?.displayName || sender?.username || "Contato",
    text: textFromMessage(message),
    time: displayTime(message.timestamp),
  };
}

function mapConversation(
  conversation: ConversationPayload,
  history: MessagePayload[],
  identity: Identity,
  presence: Record<string, PresencePayload>,
  users: Record<string, KnownUser>,
): Conversation {
  const peerId = conversation.participants.find((id) => id !== identity.userId) || "";
  const peer = users[peerId];
  const name = conversation.is_group
    ? conversation.name || "Grupo sem nome"
    : peer?.displayName || peer?.username || `Contato ${peerId.slice(0, 6)}`;
  const messages = history.map((message) => mapMessage(message, identity, users));
  const last = history[history.length - 1];
  return {
    id: conversation.conversation_id,
    name,
    initials: initialsFor(name, conversation.conversation_id),
    status: statusForConversation(conversation, identity.userId, presence),
    lastMessage: last ? textFromMessage(last) : "Nenhuma mensagem ainda",
    time: last ? displayTime(last.timestamp) : displayTime(conversation.last_message_at),
    color: colorFor(conversation.conversation_id),
    kind: conversation.is_group ? "group" : "person",
    messages,
    participantIds: conversation.participants,
  };
}

function asError(payload: unknown): Error {
  return new Error(errorMessage(payload));
}

export function MessengerProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Identity | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [presence, setPresence] = useState<Record<string, PresencePayload>>({});
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [knownUsers, setKnownUsers] = useState<Record<string, KnownUser>>({});

  const sessionRef = useRef<Identity | null>(null);
  const presenceRef = useRef(presence);
  const knownUsersRef = useRef(knownUsers);
  const pendingRef = useRef<PendingRequest[]>([]);
  const handleMessageRef = useRef<(message: ServerEnvelope) => void>(() => undefined);
  const connectedRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    presenceRef.current = presence;
  }, [presence]);

  useEffect(() => {
    knownUsersRef.current = knownUsers;
  }, [knownUsers]);

  const client = useMemo(
    () =>
      new MessengerWebSocket({
        url: MSN_SERVER_URL,
        onStateChange: (nextState) => {
          setConnectionState(nextState);
          if (nextState === "disconnected" && sessionRef.current) {
            const disconnectError = new Error("A conexão com o servidor foi encerrada.");
            pendingRef.current.splice(0).forEach((pending) => pending.reject(disconnectError));
          }
        },
        onMessage: (message) => handleMessageRef.current(message),
        onConnected: () => void connectedRef.current(),
        getSessionId: () => sessionRef.current?.sessionId ?? null,
        onError: (networkError) => {
          if (sessionRef.current) {
            setError("A conexão com o servidor foi interrompida. Tentando reconectar...");
          }
        },
      }),
    [],
  );

  useEffect(() => () => client.close(), [client]);

  const clearSession = useCallback(() => {
    sessionRef.current = null;
    setSession(null);
    setPresence({});
    presenceRef.current = {};
    setConversations([]);
  }, []);

  const request = useCallback(
    <T,>(expected: string[], command: Parameters<MessengerWebSocket["send"]>[0], fields: Record<string, unknown> = {}) =>
      new Promise<T>((resolve, reject) => {
        pendingRef.current.push({
          expected,
          resolve: (payload) => resolve(payload as T),
          reject,
        });
        try {
          client.send(command, fields);
        } catch (requestError) {
          pendingRef.current = pendingRef.current.filter((item) => item.reject !== reject);
          reject(asError(requestError));
        }
      }),
    [client],
  );

  const applySync = useCallback((payload: SyncDataPayload) => {
    const identityData = payload.data.identity;
    const currentSession = sessionRef.current;
    if (!currentSession) return;
    const identity: Identity = {
      ...currentSession,
      userId: identityData.user_id,
      username: identityData.username,
      displayName: identityData.display_name,
      sessionId: payload.data.session.session_id,
    };
    const nextPresence = payload.data.presence || {};
    const nextUsers: Record<string, KnownUser> = {
      ...knownUsersRef.current,
      [identity.userId]: {
        userId: identity.userId,
        username: identity.username,
        displayName: identity.displayName,
      },
    };
    for (const [userId, userPresence] of Object.entries(nextPresence)) {
      if (userPresence.username && userPresence.display_name) {
        nextUsers[userId] = {
          userId,
          username: userPresence.username,
          displayName: userPresence.display_name,
        };
      }
    }
    const nextConversations = payload.data.conversations.map((conversation) =>
      mapConversation(
        conversation,
        payload.data.history[conversation.conversation_id] || [],
        identity,
        nextPresence,
        nextUsers,
      ),
    );
    sessionRef.current = identity;
    setSession(identity);
    setKnownUsers(nextUsers);
    knownUsersRef.current = nextUsers;
    setPresence(nextPresence);
    presenceRef.current = nextPresence;
    setConversations(nextConversations);
  }, []);

  const updateConversationStatus = useCallback(
    (userId: string, nextPresence: Record<string, PresencePayload>) => {
      setConversations((items) =>
        items.map((conversation) => {
          if (!conversation.participantIds.includes(userId)) return conversation;
          return {
            ...conversation,
            status: statusForConversation(
              {
                conversation_id: conversation.id,
                name: conversation.name,
                is_group: conversation.kind === "group",
                participants: conversation.participantIds,
                created_at: "",
                last_message_at: null,
              },
              sessionRef.current?.userId || "",
              nextPresence,
            ),
          };
        }),
      );
    },
    [],
  );

  const mergeHistory = useCallback((conversationId: string, messages: MessagePayload[], replace = true) => {
    const identity = sessionRef.current;
    if (!identity) return;
    setConversations((items) =>
      items.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        if (!replace) {
          const incoming = messages.map((message) =>
            mapMessage(message, identity, knownUsersRef.current),
          );
          const existingIds = new Set(conversation.messages.map((message) => message.id));
          const nextMessages = [
            ...conversation.messages,
            ...incoming.filter((message) => !existingIds.has(message.id)),
          ];
          const last = nextMessages[nextMessages.length - 1];
          return {
            ...conversation,
            messages: nextMessages,
            lastMessage: last?.text || conversation.lastMessage,
            time: last?.time || conversation.time,
          };
        }
        const mapped = messages.map((message) =>
          mapMessage(message, identity, knownUsersRef.current),
        );
        const last = mapped[mapped.length - 1];
        return {
          ...conversation,
          messages: mapped,
          lastMessage: last?.text || conversation.lastMessage,
          time: last?.time || conversation.time,
        };
      }),
    );
  }, []);

  const addConversation = useCallback((payload: ConversationCreatedPayload) => {
    const identity = sessionRef.current;
    if (!identity) return;
    setConversations((items) => {
      if (items.some((item) => item.id === payload.conversation.conversation_id)) return items;
      return [
        mapConversation(
          payload.conversation,
          [],
          identity,
          presenceRef.current,
          knownUsersRef.current,
        ),
        ...items,
      ];
    });
  }, []);

  const handleMessage = useCallback(
    (message: ServerEnvelope) => {
      const payload = message.payload;
      if (message.type === "ERROR") {
        const errorPayload = payload as ErrorPayload;
        const pending = pendingRef.current.shift();
        const messageError = asError(payload);
        if (pending) pending.reject(messageError);
        setError(messageError.message);
        if (errorPayload.code === "RECONNECT_INVALID") {
          client.setAutoReconnect(false);
          client.close();
          clearSession();
        }
        return;
      }

      switch (message.type) {
        case "AUTH_OK": {
          const auth = payload as AuthPayload;
          const nextSession: Identity = {
            sessionId: auth.session_id,
            userId: auth.user_id,
            username: auth.username,
            displayName: auth.display_name,
          };
          sessionRef.current = nextSession;
          setSession(nextSession);
          break;
        }
        case "SYNC_DATA":
          applySync(payload as SyncDataPayload);
          break;
        case "USER_STATUS_CHANGED": {
          const status = payload as StatusChangedPayload;
          const nextPresence = {
            ...presenceRef.current,
            [status.user_id]: {
              status: status.status,
              status_message: status.status_message,
              username: status.username,
              display_name: status.display_name,
            },
          };
          const nextUsers = {
            ...knownUsersRef.current,
            [status.user_id]: {
              userId: status.user_id,
              username: status.username,
              displayName: status.display_name,
            },
          };
          presenceRef.current = nextPresence;
          knownUsersRef.current = nextUsers;
          setPresence(nextPresence);
          setKnownUsers(nextUsers);
          updateConversationStatus(status.user_id, nextPresence);
          break;
        }
        case "MESSAGE": {
          const liveMessage = payload as { message: MessagePayload };
          mergeHistory(liveMessage.message.conversation_id, [liveMessage.message], false);
          break;
        }
        case "HISTORY": {
          const history = payload as HistoryPayload;
          mergeHistory(history.conversation_id, history.messages, true);
          break;
        }
        case "CONVERSATION_CREATED":
          addConversation(payload as ConversationCreatedPayload);
          break;
        case "SESSION_TAKEN":
          setError("Esta sessão foi assumida por outra conexão. Faça login novamente.");
          pendingRef.current.splice(0).forEach((pending) => pending.reject(new Error("Sessão assumida por outra conexão.")));
          client.setAutoReconnect(false);
          client.close();
          clearSession();
          break;
        default:
          break;
      }

      const pending = pendingRef.current[0];
      if (pending && pending.expected.includes(message.type)) {
        pendingRef.current.shift();
        pending.resolve(payload);
      }
    },
    [addConversation, applySync, clearSession, client, mergeHistory, updateConversationStatus],
  );

  handleMessageRef.current = handleMessage;

  const connectAndLogin = useCallback(
    async (username: string, password: string): Promise<void> => {
      client.setAutoReconnect(false);
      setError(null);
      await client.connect();
      const auth = await request<AuthPayload>(["AUTH_OK"], "LOGIN", {
        username,
        password,
      });
      const nextSession: Identity = {
        sessionId: auth.session_id,
        userId: auth.user_id,
        username: auth.username,
        displayName: auth.display_name,
      };
      sessionRef.current = nextSession;
      setSession(nextSession);
      client.setAutoReconnect(true);
      await request<SyncDataPayload>(["SYNC_DATA"], "REQUEST_SYNC");
    },
    [client, request],
  );

  const connectedWithSession = useCallback(async () => {
    if (!sessionRef.current || pendingRef.current.length > 0) return;
    try {
      await request(["RECONNECT_OK"], "RECONNECT", {
        session_id: sessionRef.current.sessionId,
      });
      await request<SyncDataPayload>(["SYNC_DATA"], "REQUEST_SYNC");
      setError(null);
    } catch (reconnectError) {
      setError(asError(reconnectError).message);
      client.setAutoReconnect(false);
      clearSession();
    }
  }, [clearSession, client, request]);

  connectedRef.current = connectedWithSession;

  const login = useCallback(
    async (username: string, password: string) => {
      setBusy(true);
      try {
        await connectAndLogin(username.trim(), password);
      } catch (loginError) {
        client.setAutoReconnect(false);
        client.close();
        clearSession();
        throw asError(loginError);
      } finally {
        setBusy(false);
      }
    },
    [clearSession, client, connectAndLogin],
  );

  const register = useCallback(
    async (username: string, displayName: string, password: string) => {
      setBusy(true);
      try {
        client.setAutoReconnect(false);
        await client.connect();
        await request(["REGISTER_OK"], "REGISTER", {
          username: username.trim(),
          display_name: displayName.trim(),
          password,
        });
        await connectAndLogin(username.trim(), password);
      } catch (registrationError) {
        client.setAutoReconnect(false);
        client.close();
        clearSession();
        throw asError(registrationError);
      } finally {
        setBusy(false);
      }
    },
    [clearSession, client, connectAndLogin, request],
  );

  const logout = useCallback(async () => {
    setBusy(true);
    try {
      await request(["LOGOUT_OK"], "LOGOUT");
      client.setAutoReconnect(false);
      client.close();
      clearSession();
    } catch (logoutError) {
      setError(asError(logoutError).message);
      throw asError(logoutError);
    } finally {
      setBusy(false);
    }
  }, [clearSession, client, request]);

  const changeStatus = useCallback(
    async (nextStatus: Status, statusMessage = "") => {
      setError(null);
      try {
        await request(["USER_STATUS_CHANGED"], "CHANGE_STATUS", {
          status: nextStatus,
          status_message: statusMessage,
        });
      } catch (statusError) {
        setError(asError(statusError).message);
        throw asError(statusError);
      }
    },
    [request],
  );

  const requestHistory = useCallback(
    async (conversationId: string, limit = 100) => {
      const history = await request<HistoryPayload>(["HISTORY"], "GET_HISTORY", {
        conversation_id: conversationId,
        limit,
      });
      mergeHistory(history.conversation_id, history.messages, true);
    },
    [mergeHistory, request],
  );

  const sendMessage = useCallback(
    async (conversationId: string, text: string) => {
      const messageId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      try {
        await request<MessageAckPayload>(["MESSAGE_ACK"], "SEND_MESSAGE", {
          conversation_id: conversationId,
          type: "text",
          payload: { content: text },
          message_id: messageId,
        });
        // MESSAGE_ACK deliberately contains no client-authored content. Read
        // the persisted history so the UI renders the server-confirmed row.
        await requestHistory(conversationId, 100);
      } catch (messageError) {
        setError(asError(messageError).message);
        throw asError(messageError);
      }
    },
    [request, requestHistory],
  );

  const createGroup = useCallback(
    async (name: string, participants: string[]) => {
      try {
        await request<ConversationCreatedPayload>(["CONVERSATION_CREATED"], "CREATE_GROUP", {
          name,
          participants,
        });
      } catch (groupError) {
        setError(asError(groupError).message);
        throw asError(groupError);
      }
    },
    [request],
  );

  const reconnectNow = useCallback(async () => {
    if (!sessionRef.current) return;
    client.setAutoReconnect(true);
    try {
      await client.connect();
    } catch (connectionError) {
      setError(asError(connectionError).message);
    }
  }, [client]);

  const value = useMemo<MessengerContextValue>(
    () => ({
      session,
      connectionState,
      serverUrl: MSN_SERVER_URL,
      error,
      busy,
      status: session ? presence[session.userId]?.status || "online" : "offline",
      conversations,
      presence,
      login,
      register,
      logout,
      changeStatus,
      sendMessage,
      requestHistory,
      createGroup,
      reconnectNow,
      clearError: () => setError(null),
    }),
    [
      busy,
      changeStatus,
      connectionState,
      conversations,
      createGroup,
      error,
      login,
      logout,
      presence,
      reconnectNow,
      register,
      requestHistory,
      sendMessage,
      session,
    ],
  );

  return <MessengerContext.Provider value={value}>{children}</MessengerContext.Provider>;
}

export function useMessenger(): MessengerContextValue {
  const value = useContext(MessengerContext);
  if (!value) throw new Error("useMessenger precisa estar dentro de MessengerProvider.");
  return value;
}

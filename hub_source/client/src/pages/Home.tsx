/**
 * Direção visual preservada: Retro Desktop Leve — skeuomorfismo web do início
 * dos anos 2000, janela compacta, moldura azul, presença por ícones pequenos e
 * superfícies claras. Este arquivo contém apenas a composição da UI; rede e
 * estado do Messenger ficam em state/messenger.tsx e network/.
 */
import { FormEvent, ReactNode, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  KeyRound,
  LogIn,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Search,
  Send,
  Server,
  Settings2,
  ShieldCheck,
  Smile,
  UserPlus,
  UserRound,
  UsersRound,
  Wifi,
  X,
} from "lucide-react";
import {
  ChatMessage,
  Conversation,
  Status,
  useMessenger,
} from "@/state/messenger";
import type { ConnectionState } from "@/network/websocket";

type ViewMode = "login" | "register" | "hub";

const statusCopy: Record<Status, string> = {
  online: "Online",
  away: "Ausente",
  busy: "Ocupado",
  offline: "Offline",
};

const statusNote: Record<Status, string> = {
  online: "Disponível para conversar",
  away: "Volto em alguns minutos",
  busy: "Não quero ser interrompido",
  offline: "Apareço como desconectado",
};

const statusOptions: Status[] = ["online", "away", "busy", "offline"];

function StatusDot({ status, className = "" }: { status: Status; className?: string }) {
  return <span aria-label={statusCopy[status]} className={`status-dot status-${status} ${className}`} />;
}

function Avatar({
  initials,
  color,
  status,
  group = false,
}: {
  initials: string;
  color: string;
  status: Status;
  group?: boolean;
}) {
  return (
    <span className={`avatar ${group ? "avatar-group" : ""}`} style={{ backgroundColor: color }}>
      {group ? <UsersRound size={17} strokeWidth={1.8} /> : initials}
      <StatusDot status={status} />
    </span>
  );
}

function IconButton({
  label,
  onClick,
  children,
  active = false,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      className={`icon-button ${active ? "is-active" : ""}`}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function WindowTopbar({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onClose?: () => void;
}) {
  return (
    <header className="window-topbar">
      <div className="window-title-wrap">
        <img className="window-title-mark" src="/assets/messenger-mark_663c8cf5.png" alt="" />
        <div>
          <p className="window-title">{title}</p>
          {subtitle && <p className="window-subtitle">{subtitle}</p>}
        </div>
      </div>
      <div className="window-tools">
        <span className="window-led" />
        {onClose && (
          <IconButton label="Voltar" onClick={onClose}>
            <X size={16} />
          </IconButton>
        )}
      </div>
    </header>
  );
}

function Field({
  label,
  icon,
  type = "text",
  placeholder,
  value,
  onChange,
}: {
  label: string;
  icon: ReactNode;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-control">
        <span className="field-icon">{icon}</span>
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  );
}

function AuthView({
  mode,
  onLogin,
  onRegister,
  onOpenRegister,
  onBack,
  busy,
  error,
  onClearError,
}: {
  mode: "login" | "register";
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, displayName: string, password: string) => Promise<void>;
  onOpenRegister?: () => void;
  onBack: () => void;
  busy: boolean;
  error: string | null;
  onClearError: () => void;
}) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const { serverUrl } = useMessenger();
  const isRegister = mode === "register";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    onClearError();
    if (!username.trim() || !password) {
      setLocalError("Informe seu nome de usuário e sua senha.");
      return;
    }
    if (isRegister) {
      if (!displayName.trim()) {
        setLocalError("Informe como você quer ser chamado.");
        return;
      }
      if (password !== confirmPassword) {
        setLocalError("A confirmação de senha não coincide.");
        return;
      }
      try {
        await onRegister(username, displayName, password);
      } catch (submitError) {
        setLocalError(submitError instanceof Error ? submitError.message : "Não foi possível criar a conta.");
      }
      return;
    }
    try {
      await onLogin(username, password);
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : "Não foi possível entrar.");
    }
  }

  const visibleError = localError || error;

  return (
    <main className="app-stage auth-stage">
      <section className="messenger-window auth-window" aria-label={isRegister ? "Criar conta" : "Login do Messenger"}>
        <WindowTopbar
          title={isRegister ? "Criar conta" : "MSN Messenger"}
          subtitle="um mensageiro para gente próxima"
          onClose={isRegister ? onBack : undefined}
        />
        <div className="auth-content">
          <div className="auth-form-area">
            <div className="auth-brand-row">
              <img className="brand-mark" src="/assets/messenger-mark_663c8cf5.png" alt="Marca do Messenger" />
              <div>
                <p className="eyebrow">mensageiro privado</p>
                <h1>{isRegister ? "Vamos criar seu acesso." : "Seu grupo, ali pertinho."}</h1>
                <p className="auth-intro">
                  {isRegister
                    ? "Preencha seus dados para criar um acesso persistente no servidor."
                    : "Entre para ver suas conversas reais e continuar de onde parou."}
                </p>
              </div>
            </div>

            <form className="form-stack" onSubmit={(event) => void handleSubmit(event)}>
              <Field
                label="Nome de usuário"
                icon={<UserRound size={15} />}
                placeholder="ex.: seu_nome"
                value={username}
                onChange={setUsername}
              />
              {isRegister && (
                <Field
                  label="Como quer ser chamado"
                  icon={<UserRound size={15} />}
                  placeholder="ex.: Maria Clara"
                  value={displayName}
                  onChange={setDisplayName}
                />
              )}
              <Field
                label="Senha"
                icon={<KeyRound size={15} />}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={setPassword}
              />
              {isRegister && (
                <Field
                  label="Confirmar senha"
                  icon={<ShieldCheck size={15} />}
                  type="password"
                  placeholder="Repita a senha"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                />
              )}
              {visibleError && (
                <div className="form-error" role="alert">
                  {visibleError}
                </div>
              )}
              <button className="primary-button" type="submit" disabled={busy}>
                {isRegister ? <UserPlus size={16} /> : <LogIn size={16} />}
                {busy ? "Aguarde..." : isRegister ? "Criar conta" : "Entrar"}
              </button>
            </form>

            <div className="auth-bottom-row">
              <button className="text-button" type="button" onClick={isRegister ? onBack : () => { onClearError(); onOpenRegister?.(); }}>
                {isRegister ? <><ArrowLeft size={14} /> Voltar ao login</> : "Criar uma conta"}
              </button>
              <span className="mini-note"><Check size={13} /> dados mantidos no servidor</span>
            </div>
          </div>

          <aside className="auth-side" aria-label="Informações do servidor">
            <img className="auth-orbit" src="/assets/messenger-orbit_15ab62ba.png" alt="" />
            <div className="auth-side-copy">
              <p className="side-kicker"><Wifi size={13} /> estado da conexão</p>
              <div className="connection-line"><StatusDot status="offline" /> <strong>Conecte para entrar</strong></div>
              <p>Servidor configurado</p>
              <code>{serverUrl}</code>
            </div>
            <img className="auth-badge" src="/assets/messenger-badge_e60698ec.png" alt="" />
          </aside>
        </div>
      </section>
    </main>
  );
}

function StatusSelector({ status, onChange }: { status: Status; onChange: (status: Status) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="status-selector">
      <button className="status-trigger" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <StatusDot status={status} />
        <span>{statusCopy[status]}</span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="status-menu">
          {statusOptions.map((option) => (
            <button
              type="button"
              className={option === status ? "selected" : ""}
              key={option}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
            >
              <StatusDot status={option} />
              <span>{statusCopy[option]}</span>
              {option === status && <Check size={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ConversationItem({ conversation, active, onClick }: { conversation: Conversation; active: boolean; onClick: () => void }) {
  return (
    <button className={`conversation-item ${active ? "is-active" : ""}`} type="button" onClick={onClick}>
      <Avatar initials={conversation.initials} color={conversation.color} status={conversation.status} group={conversation.kind === "group"} />
      <span className="conversation-copy">
        <span className="conversation-name-row"><strong>{conversation.name}</strong><time>{conversation.time}</time></span>
        <span className="conversation-preview">{conversation.lastMessage}</span>
      </span>
    </button>
  );
}

function SettingsPanel({
  session,
  serverUrl,
  connectionState,
  onLogout,
  onClose,
  busy,
}: {
  session: { username: string; displayName: string };
  serverUrl: string;
  connectionState: ConnectionState;
  onLogout: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  const connectionCopy: Record<ConnectionState, string> = {
    connecting: "conectando",
    connected: "conectado",
    disconnected: "desconectado",
    reconnecting: "reconectando",
  };
  const connectionStatus: Status = connectionState === "connected" ? "online" : connectionState === "disconnected" ? "offline" : "away";
  return (
    <aside className="settings-panel" aria-label="Configurações">
      <div className="settings-heading"><div><span className="eyebrow">configurações</span><h2>Detalhes do Hub</h2></div><IconButton label="Fechar configurações" onClick={onClose}><X size={15} /></IconButton></div>
      <div className="settings-list">
        <div className="settings-row"><Server size={15} /><span><small>Endereço do servidor</small><strong>{serverUrl}</strong></span></div>
        <div className="settings-row"><Wifi size={15} /><span><small>Estado real</small><strong className={connectionState === "connected" ? "green-text" : ""}><StatusDot status={connectionStatus} /> {connectionCopy[connectionState]}</strong></span></div>
        <div className="settings-row"><UserRound size={15} /><span><small>Nome de usuário</small><strong>{session.username}</strong></span></div>
        <div className="settings-row"><ShieldCheck size={15} /><span><small>Perfil</small><strong>{session.displayName}</strong></span></div>
      </div>
      <button className="logout-button" type="button" onClick={onLogout} disabled={busy}><LogOut size={15} /> {busy ? "Saindo..." : "Sair do Messenger"}</button>
    </aside>
  );
}

function GroupComposer({ onCreate, onClose, busy }: { onCreate: (name: string, participants: string[]) => Promise<void>; onClose: () => void; busy: boolean }) {
  const [name, setName] = useState("");
  const [participants, setParticipants] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const usernames = participants.split(",").map((value) => value.trim()).filter(Boolean);
    if (!name.trim() || usernames.length === 0) return;
    await onCreate(name.trim(), usernames);
    onClose();
  }
  return (
    <form className="group-composer" onSubmit={(event) => void submit(event)}>
      <div className="settings-heading"><div><span className="eyebrow">nova conversa</span><h2>Criar grupo</h2></div><IconButton label="Fechar" onClick={onClose}><X size={15} /></IconButton></div>
      <Field label="Nome do grupo" icon={<UsersRound size={15} />} placeholder="ex.: Equipe" value={name} onChange={setName} />
      <Field label="Participantes" icon={<UserPlus size={15} />} placeholder="nomes separados por vírgula" value={participants} onChange={setParticipants} />
      <button className="primary-button" type="submit" disabled={busy}><UsersRound size={15} /> {busy ? "Criando..." : "Criar grupo"}</button>
    </form>
  );
}

function ChatEmpty({ onNewGroup }: { onNewGroup: () => void }) {
  return (
    <section className="chat-pane chat-empty" aria-label="Nenhuma conversa selecionada">
      <div className="empty-chat-content">
        <MessageCircle size={36} strokeWidth={1.4} />
        <h2>Sem conversas por enquanto</h2>
        <p>As conversas e mensagens aparecem aqui quando existirem no servidor.</p>
        <button className="primary-button" type="button" onClick={onNewGroup}><UsersRound size={15} /> Criar um grupo</button>
      </div>
    </section>
  );
}

function ChatView({ conversation, onSend, onLoadHistory }: { conversation: Conversation; onSend: (text: string) => Promise<void>; onLoadHistory: (id: string) => Promise<void> }) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      await onSend(draft.trim());
      setDraft("");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="chat-pane" aria-label={`Conversa com ${conversation.name}`}>
      <header className="chat-header">
        <div className="chat-person"><Avatar initials={conversation.initials} color={conversation.color} status={conversation.status} group={conversation.kind === "group"} /><div><h2>{conversation.name}</h2><p><StatusDot status={conversation.status} /> {statusCopy[conversation.status]}</p></div></div>
        <div className="chat-actions"><IconButton label="Atualizar histórico" onClick={() => void onLoadHistory(conversation.id)}><Search size={16} /></IconButton><IconButton label="Mais opções"><MoreHorizontal size={17} /></IconButton></div>
      </header>
      <div className="chat-context"><MessageCircle size={14} /><span>histórico sincronizado do servidor</span><span className="context-line" /></div>
      <div className="chat-messages">
        {conversation.messages.length === 0 ? (
          <div className="empty-message-note">Nenhuma mensagem nesta conversa ainda.</div>
        ) : conversation.messages.map((message: ChatMessage) => (
          <div className={`message-row ${message.author === "me" ? "mine" : ""}`} key={message.id}>
            <div className="message-meta"><strong>{message.author === "me" ? "Você" : message.authorName}</strong><time>{message.time}</time></div>
            <div className="message-bubble">{message.text}</div>
          </div>
        ))}
      </div>
      <form className="message-composer" onSubmit={(event) => void submitMessage(event)}>
        <div className="composer-tools"><IconButton label="Anexar arquivo"><Paperclip size={15} /></IconButton><IconButton label="Adicionar emoji"><Smile size={15} /></IconButton></div>
        <input aria-label="Digite uma mensagem" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Digite uma mensagem..." disabled={sending} />
        <button className="send-button" type="submit" disabled={sending}><Send size={15} /> {sending ? "Enviando" : "Enviar"}</button>
      </form>
    </section>
  );
}

function Hub() {
  const {
    session,
    connectionState,
    serverUrl,
    error,
    busy,
    status,
    conversations,
    logout,
    changeStatus,
    sendMessage,
    requestHistory,
    createGroup,
    reconnectNow,
    clearError,
  } = useMessenger();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const visibleConversations = useMemo(
    () => conversations.filter((conversation) => conversation.name.toLowerCase().includes(searchTerm.trim().toLowerCase())),
    [conversations, searchTerm],
  );
  const selectedConversation = visibleConversations.find((conversation) => conversation.id === selectedId) || visibleConversations[0] || null;
  const activeId = selectedConversation?.id || null;
  const connectionLabel: Record<ConnectionState, string> = {
    connected: "Conectado",
    connecting: "Conectando...",
    disconnected: "Desconectado",
    reconnecting: "Reconectando...",
  };
  const connectionStatus: Status = connectionState === "connected" ? "online" : connectionState === "disconnected" ? "offline" : "away";
  const ownInitials = session ? (session.displayName || session.username).slice(0, 2).toUpperCase() : "??";

  if (!session) return null;

  async function handleStatus(nextStatus: Status) {
    if (nextStatus === "offline") {
      setSettingsOpen(false);
      await logout();
      return;
    }
    await changeStatus(nextStatus);
  }

  return (
    <main className="app-stage hub-stage">
      <section className="messenger-window hub-window" aria-label="Hub do MSN Messenger">
        <WindowTopbar title="MSN Messenger Hub" subtitle="grupo privado / dados reais" />
        {error && (
          <div className="hub-error" role="alert"><span>{error}</span><button type="button" onClick={clearError} aria-label="Fechar aviso"><X size={14} /></button></div>
        )}
        <div className="hub-body">
          <aside className="profile-rail">
            <div className="rail-profile">
              <div className="profile-avatar">{ownInitials}<StatusDot status={status} /></div>
              <div className="profile-name"><strong>{session.displayName}</strong><span>@{session.username}</span></div>
              <StatusSelector status={status} onChange={(nextStatus) => void handleStatus(nextStatus)} />
              <p className="status-description">{statusNote[status]}</p>
            </div>
            <div className="rail-divider" />
            <nav className="rail-nav" aria-label="Atalhos">
              <button type="button" className="rail-nav-item active"><MessageCircle size={15} /><span>Conversas</span><b>{conversations.length}</b></button>
              <button type="button" className="rail-nav-item" onClick={() => setSettingsOpen(true)}><Settings2 size={15} /><span>Configurações</span></button>
              <button type="button" className="rail-nav-item" onClick={() => void reconnectNow()} disabled={connectionState === "connected"}><Wifi size={15} /><span>{connectionState === "connected" ? "Conexão ativa" : "Reconectar"}</span></button>
            </nav>
            <div className="rail-footer">
              <div className="rail-server"><Server size={14} /><span><small>servidor</small><strong>{serverUrl}</strong></span></div>
              <button className="rail-logout" type="button" onClick={() => void logout()} disabled={busy}><LogOut size={14} /> Sair</button>
            </div>
            {settingsOpen && <SettingsPanel session={session} serverUrl={serverUrl} connectionState={connectionState} onLogout={() => void logout()} onClose={() => setSettingsOpen(false)} busy={busy} />}
            {groupOpen && <GroupComposer onCreate={createGroup} onClose={() => setGroupOpen(false)} busy={busy} />}
          </aside>

          <section className="conversation-pane" aria-label="Conversas">
            <div className="pane-heading"><div><span className="eyebrow">seus contatos</span><h1>Conversas</h1></div><button className="new-chat-button" type="button" title="Novo grupo" onClick={() => setGroupOpen(true)}><UserPlus size={15} /></button></div>
            <div className="search-box"><Search size={14} /><input placeholder="Procurar contato" aria-label="Procurar contato" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} /></div>
            <div className="conversation-section-label"><span>Recentes</span><span className="section-count">{visibleConversations.length}</span></div>
            <div className="conversation-list">
              {visibleConversations.length === 0 ? (
                <div className="empty-list-note">Nenhuma conversa encontrada.</div>
              ) : visibleConversations.map((conversation) => <ConversationItem key={conversation.id} conversation={conversation} active={conversation.id === activeId} onClick={() => setSelectedId(conversation.id)} />)}
            </div>
            <div className="conversation-footnote"><Bell size={14} /><span>Contatos e conversas vêm do servidor.</span></div>
          </section>

          {selectedConversation ? (
            <ChatView conversation={selectedConversation} onSend={(text) => sendMessage(selectedConversation.id, text)} onLoadHistory={requestHistory} />
          ) : <ChatEmpty onNewGroup={() => setGroupOpen(true)} />}
        </div>
        <footer className="connection-bar">
          <button type="button" className="connection-status" onClick={() => void reconnectNow()} disabled={connectionState === "connected"}><StatusDot status={connectionStatus} /><span>{connectionLabel[connectionState]}</span></button>
          <span className="connection-separator" />
          <span className="connection-server"><Server size={13} /> {serverUrl}</span>
          <span className="connection-spacer" />
          <span className="connection-help"><CircleHelp size={13} /> Messenger Hub · dados do servidor</span>
        </footer>
      </section>
    </main>
  );
}

export default function Home() {
  const [view, setView] = useState<ViewMode>("login");
  const { session, login, register, error, busy, clearError } = useMessenger();

  if (session) return <Hub />;
  if (view === "register") {
    return (
      <AuthView
        mode="register"
        busy={busy}
        error={error}
        onClearError={clearError}
        onLogin={login}
        onRegister={async (username, displayName, password) => {
          await register(username, displayName, password);
          setView("hub");
        }}
        onBack={() => { clearError(); setView("login"); }}
      />
    );
  }
  return (
    <AuthView
      mode="login"
      busy={busy}
      error={error}
      onClearError={clearError}
      onLogin={async (username, password) => {
        await login(username, password);
        setView("hub");
      }}
      onOpenRegister={() => setView("register")}
      onRegister={async () => { clearError(); setView("register"); }}
      onBack={() => setView("login")}
    />
  );
}

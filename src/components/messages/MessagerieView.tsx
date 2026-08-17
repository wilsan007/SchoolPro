"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Send, Plus, Search, CheckCheck, MoreVertical, Users, User,
  Megaphone, School, MessageSquare, Pin, Lock, Paperclip,
  Info, X, ArrowLeft, ArrowUp, Bell, BellOff, LogOut, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { NewConversationComposer } from "./NewConversationComposer";

interface Participant {
  id: string;
  name: string | null;
  role: string;
  avatarUrl: string | null;
}

interface Message {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  createdAt: string;
  readBy: string[];
  replyToId?: string | null;
  attachmentUrl?: string | null;
  attachmentType?: string | null;
  editedAt?: string | null;
}

interface Conversation {
  id: string;
  subject: string | null;
  isGroup: boolean;
  type?: string;
  classeId?: string | null;
  classeNom?: string | null;
  readOnly?: boolean;
  pinned?: boolean;
  createdBy?: string;
  myRole?: string;
  participants: Participant[];
  messages: Message[];
  lastMessage: Message | null;
  unreadCount: number;
}

type ConversationType =
  | "DIRECT"
  | "CLASS_ANNOUNCEMENT"
  | "CLASS_DISCUSSION"
  | "ADMIN_BROADCAST"
  | "PARENT_TEACHER"
  | "PARENT_ADMIN"
  | "STAFF_GROUP"
  | "FREE";

const TYPE_LABELS: Record<ConversationType, { label: string; icon: typeof Megaphone; color: string }> = {
  DIRECT: { label: "Message direct", icon: User, color: "text-blue-500" },
  CLASS_ANNOUNCEMENT: { label: "Annonce de classe", icon: Megaphone, color: "text-orange-500" },
  CLASS_DISCUSSION: { label: "Discussion de classe", icon: School, color: "text-green-500" },
  ADMIN_BROADCAST: { label: "Annonce générale", icon: Megaphone, color: "text-red-500" },
  PARENT_TEACHER: { label: "Parent ↔ Enseignant", icon: Users, color: "text-purple-500" },
  PARENT_ADMIN: { label: "Parent ↔ Administration", icon: Users, color: "text-indigo-500" },
  STAFF_GROUP: { label: "Groupe du personnel", icon: Users, color: "text-teal-500" },
  FREE: { label: "Groupe libre", icon: MessageSquare, color: "text-gray-500" },
};

type FilterTab = "all" | "unread" | "announcements" | "groups";

const FILTER_CONFIG: Record<FilterTab, { label: string; icon: typeof MessageSquare }> = {
  all: { label: "Toutes", icon: MessageSquare },
  unread: { label: "Non lues", icon: Bell },
  announcements: { label: "Annonces", icon: Megaphone },
  groups: { label: "Groupes", icon: Users },
};

const ANNOUNCEMENT_TYPES = ["CLASS_ANNOUNCEMENT", "ADMIN_BROADCAST"];
const GROUP_TYPES = ["CLASS_DISCUSSION", "STAFF_GROUP", "FREE"];

function dateSeparatorLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d >= today) return "Aujourd'hui";
  if (d >= yesterday) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

function shouldShowSeparator(prev: string | null, curr: string): boolean {
  if (!prev) return true;
  return new Date(prev).toDateString() !== new Date(curr).toDateString();
}

export function MessagerieView({ userRole }: { userRole: string }) {
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [canWrite, setCanWrite] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [oldestCursor, setOldestCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [showMobileMessages, setShowMobileMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Fetch conversations ---
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/messages/conversations");
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  // --- Fetch messages for a conversation ---
  const fetchMessages = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/messages/conversations/${convId}/messages?limit=50`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages ?? []);
      setHasMore(data.hasMore ?? false);
      setOldestCursor(data.oldestCursor ?? null);
      setCanWrite(data.canWrite ?? true);
    } catch {
      // silent
    }
  }, []);

  // --- Load older messages (pagination) ---
  const loadOlderMessages = useCallback(async () => {
    if (!activeConv || !hasMore || loadingMore || !oldestCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/messages/conversations/${activeConv.id}/messages?limit=50&before=${oldestCursor}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setMessages((prev) => [...(data.messages ?? []), ...prev]);
      setHasMore(data.hasMore ?? false);
      setOldestCursor(data.oldestCursor ?? null);
    } finally {
      setLoadingMore(false);
    }
  }, [activeConv, hasMore, loadingMore, oldestCursor]);

  // --- Initial load ---
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // --- Polling: refresh conversations every 10s ---
  useEffect(() => {
    pollRef.current = setInterval(fetchConversations, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchConversations]);

  // --- Polling: refresh active conversation messages every 5s ---
  useEffect(() => {
    if (!activeConv) return;
    const interval = setInterval(() => fetchMessages(activeConv.id), 5000);
    return () => clearInterval(interval);
  }, [activeConv, fetchMessages]);

  // --- Scroll to bottom on new messages ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // --- Select conversation ---
  const selectConv = (conv: Conversation) => {
    setActiveConv(conv);
    setMessages([]);
    fetchMessages(conv.id);
  };

  // --- Send message (with optimistic UI) ---
  const sendMessage = async () => {
    if (!input.trim() || !activeConv || !canWrite) return;
    const content = input.trim();
    setInput("");
    setSending(true);

    // Optimistic: add message immediately
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      content,
      senderId: "me",
      senderName: "Vous",
      createdAt: new Date().toISOString(),
      readBy: ["me"],
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const res = await fetch(`/api/messages/conversations/${activeConv.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error ?? "Échec d'envoi");
        // Remove optimistic message
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setInput(content); // restore input
      } else {
        const data = await res.json();
        // Replace optimistic with real message
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...data, senderName: "Vous" } : m))
        );
        fetchConversations(); // refresh sidebar
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  // --- Filter conversations by search + tab ---
  const filteredConvs = useMemo(() => {
    return conversations.filter((c) => {
      // Tab filter
      if (activeFilter === "unread" && c.unreadCount === 0) return false;
      if (activeFilter === "announcements" && !ANNOUNCEMENT_TYPES.includes(c.type ?? "DIRECT")) return false;
      if (activeFilter === "groups" && !GROUP_TYPES.includes(c.type ?? "DIRECT")) return false;

      // Search filter
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        c.subject?.toLowerCase().includes(q) ||
        c.lastMessage?.content.toLowerCase().includes(q) ||
        c.participants.some((p) => p.name?.toLowerCase().includes(q)) ||
        c.classeNom?.toLowerCase().includes(q)
      );
    });
  }, [conversations, activeFilter, search]);

  // --- Group conversations by sections ---
  const groupedConvs = useMemo(() => {
    const pinned = filteredConvs.filter((c) => c.pinned);
    const directs = filteredConvs.filter((c) => !c.pinned && (c.type === "DIRECT" || c.type === "PARENT_TEACHER" || c.type === "PARENT_ADMIN"));
    const classes = filteredConvs.filter((c) => !c.pinned && (c.type === "CLASS_ANNOUNCEMENT" || c.type === "CLASS_DISCUSSION"));
    const groups = filteredConvs.filter((c) => !c.pinned && (c.type === "STAFF_GROUP" || c.type === "FREE" || c.type === "ADMIN_BROADCAST"));
    return { pinned, directs, classes, groups };
  }, [filteredConvs]);

  // --- Filter tab counts ---
  const filterCounts = useMemo(() => ({
    all: conversations.length,
    unread: conversations.filter((c) => c.unreadCount > 0).length,
    announcements: conversations.filter((c) => ANNOUNCEMENT_TYPES.includes(c.type ?? "DIRECT")).length,
    groups: conversations.filter((c) => GROUP_TYPES.includes(c.type ?? "DIRECT")).length,
  }), [conversations]);

  const getConvDisplayName = (conv: Conversation) => {
    if (conv.subject) return conv.subject;
    if (conv.classeNom) return `Classe ${conv.classeNom}`;
    if (conv.type === "ADMIN_BROADCAST") return "Annonce générale";
    if (conv.type === "STAFF_GROUP") return "Groupe du personnel";
    const others = conv.participants.filter((p) => p.id !== "me");
    if (others.length === 1) return others[0].name ?? "—";
    if (others.length > 1) return `${others.length} participants`;
    return conv.subject ?? "Conversation";
  };

  const getConvIcon = (conv: Conversation) => {
    const type = (conv.type ?? "DIRECT") as ConversationType;
    return TYPE_LABELS[type]?.icon ?? User;
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  };

  const selectConvMobile = (conv: Conversation) => {
    selectConv(conv);
    setShowMobileMessages(true);
  };

  const renderConvItem = (conv: Conversation) => {
    const Icon = getConvIcon(conv);
    const isActive = activeConv?.id === conv.id;
    const isUnread = conv.unreadCount > 0;
    return (
      <button
        key={conv.id}
        onClick={() => selectConvMobile(conv)}
        className={cn(
          "w-full text-left p-3 hover:bg-accent transition-colors border-b",
          isActive && "bg-accent"
        )}
      >
        <div className="flex items-start gap-2.5">
          <div className={cn("mt-0.5 shrink-0", TYPE_LABELS[(conv.type ?? "DIRECT") as ConversationType]?.color)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span className={cn("text-sm truncate", isUnread ? "font-semibold" : "font-medium")}>
                {conv.pinned && <Pin className="inline h-3 w-3 mr-1 text-muted-foreground" />}
                {conv.readOnly && <Lock className="inline h-3 w-3 mr-1 text-muted-foreground" />}
                {getConvDisplayName(conv)}
              </span>
              {conv.lastMessage && (
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {formatTime(conv.lastMessage.createdAt)}
                </span>
              )}
            </div>
            {conv.lastMessage && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                <span className="font-medium">{conv.lastMessage.senderName}:</span>{" "}
                {conv.lastMessage.content}
              </p>
            )}
            {isUnread && (
              <span className="mt-1 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-semibold px-1">
                {conv.unreadCount}
              </span>
            )}
          </div>
        </div>
      </button>
    );
  };

  const renderSection = (title: string, items: Conversation[]) => {
    if (items.length === 0) return null;
    return (
      <div>
        <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/30">
          {title} ({items.length})
        </div>
        {items.map(renderConvItem)}
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Sidebar: conversations list */}
      <div className={cn(
        "w-full md:w-80 border-r flex flex-col bg-muted/30 shrink-0",
        "md:flex",
        showMobileMessages && "hidden md:flex"
      )}>
        {/* Header */}
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-sm">Messagerie</h2>
            </div>
            {userRole !== "STUDENT" && (
              <Button size="sm" variant="default" onClick={() => setShowNewModal(true)} className="gap-1.5 h-8">
                <Plus className="h-3.5 w-3.5" />
                Nouv.
              </Button>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Rechercher une conversation…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex border-b">
          {(Object.keys(FILTER_CONFIG) as FilterTab[]).map((tab) => {
            const cfg = FILTER_CONFIG[tab];
            const count = filterCounts[tab];
            const isActive = activeFilter === tab;
            const FIcon = cfg.icon;
            return (
              <button
                key={tab}
                onClick={() => setActiveFilter(tab)}
                className={cn(
                  "flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors relative",
                  isActive ? "text-primary font-medium" : "text-muted-foreground hover:bg-accent/50"
                )}
              >
                <div className="flex items-center gap-1">
                  <FIcon className="h-3 w-3" />
                  <span>{cfg.label}</span>
                </div>
                {count > 0 && (
                  <span className={cn(
                    "rounded-full px-1.5 text-[9px] font-semibold",
                    isActive ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}>
                    {count}
                  </span>
                )}
                {isActive && <div className="absolute bottom-0 inset-x-0 h-0.5 bg-primary" />}
              </button>
            );
          })}
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <div className="animate-pulse">Chargement…</div>
            </div>
          ) : filteredConvs.length === 0 ? (
            <div className="p-8 text-center">
              <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm text-muted-foreground">
                {search ? "Aucune conversation trouvée." : "Aucune conversation."}
              </p>
              {!search && userRole !== "STUDENT" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Cliquez sur « Nouv. » pour démarrer.
                </p>
              )}
            </div>
          ) : (
            <div>
              {renderSection("Épinglées", groupedConvs.pinned)}
              {renderSection("Messages directs", groupedConvs.directs)}
              {renderSection("Classes", groupedConvs.classes)}
              {renderSection("Groupes & Annonces", groupedConvs.groups)}
            </div>
          )}
        </div>
      </div>

      {/* Main: messages area */}
      <div className={cn(
        "flex-1 flex flex-col",
        !showMobileMessages && "hidden md:flex"
      )}>
        {activeConv ? (
          <>
            {/* Header */}
            <div className="p-3 border-b flex items-center justify-between bg-background">
              <div className="flex items-center gap-2.5 min-w-0">
                <Button size="sm" variant="ghost" className="md:hidden h-8 w-8 p-0 shrink-0" onClick={() => setShowMobileMessages(false)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                {(() => {
                  const Icon = getConvIcon(activeConv);
                  return <Icon className={cn("h-5 w-5 shrink-0", TYPE_LABELS[(activeConv.type ?? "DIRECT") as ConversationType]?.color)} />;
                })()}
                <div className="min-w-0">
                  <h3 className="font-medium text-sm truncate">{getConvDisplayName(activeConv)}</h3>
                  <p className="text-xs text-muted-foreground truncate">
                    {activeConv.readOnly ? (
                      <span className="inline-flex items-center gap-1">
                        <Lock className="h-3 w-3" /> Lecture seule
                      </span>
                    ) : "Discussion"}
                    {" · "}
                    {activeConv.participants.length} participant(s)
                    {activeConv.classeNom && ` · Classe ${activeConv.classeNom}`}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant={showInfoPanel ? "default" : "ghost"}
                className="h-8 w-8 p-0 shrink-0"
                onClick={() => setShowInfoPanel(!showInfoPanel)}
                title="Informations"
              >
                <Info className="h-4 w-4" />
              </Button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4">
              {hasMore && (
                <div className="text-center py-2 mb-3">
                  <Button size="sm" variant="outline" onClick={loadOlderMessages} disabled={loadingMore} className="gap-1.5">
                    <ArrowUp className="h-3.5 w-3.5" />
                    {loadingMore ? "Chargement…" : "Charger plus anciens"}
                  </Button>
                </div>
              )}
              <div className="space-y-2">
                {messages.map((msg, i) => {
                  const isMe = msg.senderId === "me" || msg.senderId === activeConv.createdBy;
                  const prevMsg = i > 0 ? messages[i - 1] : null;
                  const showSep = shouldShowSeparator(prevMsg?.createdAt ?? null, msg.createdAt);
                  const sender = activeConv.participants.find((p) => p.id === msg.senderId);
                  return (
                    <div key={msg.id}>
                      {showSep && (
                        <div className="flex items-center gap-2 my-4">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-[10px] text-muted-foreground px-2">
                            {dateSeparatorLabel(msg.createdAt)}
                          </span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      )}
                      <div
                        className={cn("flex gap-2 max-w-[75%]", isMe ? "ml-auto flex-row-reverse" : "flex-row")}
                      >
                        {!isMe && (
                          <Avatar className="h-7 w-7 shrink-0 mt-1">
                            <AvatarImage src={sender?.avatarUrl ?? undefined} />
                            <AvatarFallback className="text-[10px]">{msg.senderName?.[0] ?? "?"}</AvatarFallback>
                          </Avatar>
                        )}
                        <div className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
                          {!isMe && (
                            <span className="text-xs text-muted-foreground mb-0.5 px-1">{msg.senderName}</span>
                          )}
                          <div
                            className={cn(
                              "rounded-2xl px-3.5 py-2 text-sm",
                              isMe
                                ? "bg-primary text-primary-foreground rounded-br-md"
                                : "bg-muted rounded-bl-md"
                            )}
                          >
                            {msg.content}
                          </div>
                          <div className="flex items-center gap-1 px-1 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">{formatTime(msg.createdAt)}</span>
                            {isMe && msg.readBy.length > 1 && (
                              <CheckCheck className="h-3 w-3 text-blue-500" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input */}
            {canWrite ? (
              <div className="p-3 border-t bg-background">
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" disabled className="h-9 w-9 p-0 shrink-0" title="Joindre un fichier">
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Input
                    placeholder="Écrire un message…"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    disabled={sending}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={sendMessage}
                    disabled={!input.trim() || sending}
                    className="h-9 w-9 p-0 shrink-0 rounded-full"
                    title="Envoyer"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 px-1">
                  Entrée pour envoyer · Maj+Entrée = nouvelle ligne
                </p>
              </div>
            ) : (
              <div className="p-3 border-t flex items-center justify-center gap-2 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 text-sm">
                <Lock className="h-4 w-4 shrink-0" />
                <span>Cette conversation est en mode annonce — vous pouvez lire mais pas répondre</span>
              </div>
            )}

            {error && (
              <div className="px-3 py-1.5 bg-destructive/10 text-destructive text-xs text-center">
                {error}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Sélectionnez une conversation</p>
              <p className="text-xs mt-1">ou créez-en une nouvelle avec « + Nouv. »</p>
            </div>
          </div>
        )}
      </div>

      {/* Info panel (column 3) */}
      {showInfoPanel && activeConv && (
        <div className="w-72 border-l flex flex-col bg-background shrink-0 hidden lg:flex">
          <div className="p-3 border-b flex items-center justify-between">
            <h3 className="font-semibold text-sm">Informations</h3>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setShowInfoPanel(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {/* Type + contexte */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {(() => {
                  const Icon = getConvIcon(activeConv);
                  return <Icon className={cn("h-5 w-5", TYPE_LABELS[(activeConv.type ?? "DIRECT") as ConversationType]?.color)} />;
                })()}
                <div>
                  <p className="text-sm font-medium">{TYPE_LABELS[(activeConv.type ?? "DIRECT") as ConversationType]?.label ?? "Conversation"}</p>
                  {activeConv.classeNom && <p className="text-xs text-muted-foreground">Classe: {activeConv.classeNom}</p>}
                </div>
              </div>
              <div className="text-xs space-y-1 text-muted-foreground">
                <p>Participants: {activeConv.participants.length}</p>
                <p>Mode: {activeConv.readOnly ? "Lecture seule" : "Discussion"}</p>
              </div>
            </div>

            {/* Participants */}
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Participants ({activeConv.participants.length})
              </p>
              <div className="space-y-1.5">
                {activeConv.participants.slice(0, 10).map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={p.avatarUrl ?? undefined} />
                      <AvatarFallback className="text-[10px]">{p.name?.[0] ?? "?"}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs truncate flex-1">{p.name ?? "—"}</span>
                    {p.role === "ADMIN" && <Badge variant="default" className="text-[9px] h-4 px-1">Admin</Badge>}
                    {p.role === "READONLY" && <Badge variant="secondary" className="text-[9px] h-4 px-1">Lecture</Badge>}
                  </div>
                ))}
                {activeConv.participants.length > 10 && (
                  <p className="text-xs text-muted-foreground italic">+ {activeConv.participants.length - 10} autres</p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Actions</p>
              <div className="space-y-1">
                <button className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg hover:bg-accent transition-colors">
                  <Pin className="h-3.5 w-3.5" /> Épingler
                </button>
                <button className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg hover:bg-accent transition-colors">
                  <CheckCheck className="h-3.5 w-3.5" /> Marquer comme lu
                </button>
                <button className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg hover:bg-accent transition-colors">
                  <BellOff className="h-3.5 w-3.5" /> Couper les notifications
                </button>
                <div className="h-px bg-border my-1" />
                <button className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg hover:bg-destructive/10 text-destructive transition-colors">
                  <LogOut className="h-3.5 w-3.5" /> Quitter la conversation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New conversation modal */}
      {showNewModal && (
        <NewConversationComposer
          onClose={() => setShowNewModal(false)}
          onCreated={(conv) => {
            setShowNewModal(false);
            fetchConversations();
            selectConv(conv as unknown as Conversation);
          }}
        />
      )}
    </div>
  );
}

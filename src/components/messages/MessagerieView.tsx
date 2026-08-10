"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Send, Plus, Search, CheckCheck, MoreVertical, Users, User,
  Megaphone, School, MessageSquare, Pin, Lock, Paperclip,
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

  // --- Filter conversations by search ---
  const filteredConvs = conversations.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.subject?.toLowerCase().includes(q) ||
      c.lastMessage?.content.toLowerCase().includes(q) ||
      c.participants.some((p) => p.name?.toLowerCase().includes(q)) ||
      c.classeNom?.toLowerCase().includes(q)
    );
  });

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

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Sidebar: conversations list */}
      <div className="w-80 border-r flex flex-col bg-muted/30">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Messagerie</h2>
            {/* Un élève n'a que `messages:reply` : lui proposer « nouvelle
                conversation » ne produirait qu'un 403 à la validation. */}
            {userRole !== "STUDENT" && (
              <Button size="sm" variant="ghost" onClick={() => setShowNewModal(true)} title="Nouvelle conversation">
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Chargement...</div>
          ) : filteredConvs.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Aucune conversation. Cliquez sur + pour démarrer.
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredConvs.map((conv) => {
                const Icon = getConvIcon(conv);
                const isActive = activeConv?.id === conv.id;
                return (
                  <button
                    key={conv.id}
                    onClick={() => selectConv(conv)}
                    className={cn(
                      "w-full text-left p-3 hover:bg-accent transition-colors border-b",
                      isActive && "bg-accent"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5">
                        <Icon className={cn("h-4 w-4", TYPE_LABELS[(conv.type ?? "DIRECT") as ConversationType]?.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-medium text-sm truncate">
                            {conv.pinned && <Pin className="inline h-3 w-3 mr-1 text-muted-foreground" />}
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
                        {conv.unreadCount > 0 && (
                          <Badge variant="default" className="mt-1 h-4 text-[10px] px-1.5">
                            {conv.unreadCount}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main: messages area */}
      <div className="flex-1 flex flex-col">
        {activeConv ? (
          <>
            {/* Header */}
            <div className="p-3 border-b flex items-center justify-between bg-background">
              <div className="flex items-center gap-2">
                {(() => {
                  const Icon = getConvIcon(activeConv);
                  return <Icon className={cn("h-5 w-5", TYPE_LABELS[(activeConv.type ?? "DIRECT") as ConversationType]?.color)} />;
                })()}
                <div>
                  <h3 className="font-medium text-sm">{getConvDisplayName(activeConv)}</h3>
                  <p className="text-xs text-muted-foreground">
                    {activeConv.participants.length} participant(s)
                    {activeConv.readOnly && " · Annonce (lecture seule)"}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="ghost">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4">
              {hasMore && (
                <div className="text-center py-2">
                  <Button size="sm" variant="ghost" onClick={loadOlderMessages} disabled={loadingMore}>
                    {loadingMore ? "Chargement..." : "Charger plus de messages"}
                  </Button>
                </div>
              )}
              <div className="space-y-2">
                {messages.map((msg) => {
                  const isMe = msg.senderId === "me" || msg.senderId === activeConv.createdBy;
                  return (
                    <div
                      key={msg.id}
                      className={cn("flex flex-col max-w-[70%]", isMe ? "ml-auto items-end" : "items-start")}
                    >
                      {!isMe && (
                        <span className="text-xs text-muted-foreground mb-0.5 px-2">{msg.senderName}</span>
                      )}
                      <div
                        className={cn(
                          "rounded-lg px-3 py-2 text-sm",
                          isMe
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        )}
                      >
                        {msg.content}
                      </div>
                      <div className="flex items-center gap-1 px-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{formatTime(msg.createdAt)}</span>
                        {isMe && msg.readBy.length > 1 && (
                          <CheckCheck className="h-3 w-3 text-blue-500" />
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input */}
            {canWrite ? (
              <div className="p-3 border-t flex items-center gap-2 bg-background">
                <Button size="sm" variant="ghost" disabled>
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Input
                  placeholder="Écrire un message..."
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
                <Button size="sm" onClick={sendMessage} disabled={!input.trim() || sending}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="p-3 border-t flex items-center justify-center gap-2 bg-muted/30 text-muted-foreground text-sm">
                <Lock className="h-4 w-4" />
                Cette conversation est en mode annonce — vous ne pouvez que lire
              </div>
            )}

            {error && (
              <div className="px-3 py-1 bg-destructive/10 text-destructive text-xs text-center">
                {error}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>Sélectionnez une conversation</p>
            </div>
          </div>
        )}
      </div>

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

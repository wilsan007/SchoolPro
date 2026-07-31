"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { Send, Plus, Search, Circle, Check, CheckCheck, MoreVertical, Users, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { cn, getInitials, timeAgo } from "@/lib/utils";
import { useTranslations } from "next-intl";

const ROLE_KEYS: Record<string, string> = {
  SUPER_ADMIN: "roles.SUPER_ADMIN",
  TENANT_ADMIN: "roles.TENANT_ADMIN",
  PRINCIPAL: "roles.PRINCIPAL",
  TEACHER: "roles.TEACHER",
  STUDENT: "roles.STUDENT",
  PARENT: "roles.PARENT",
  ACCOUNTANT: "roles.ACCOUNTANT",
  LIBRARIAN: "roles.LIBRARIAN",
  NURSE: "roles.NURSE",
  GUARD: "roles.GUARD",
  STAFF: "roles.STAFF",
};

interface User {
  id: string;
  name: string | null;
  role: string;
  avatarUrl?: string | null;
}

interface Message {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  createdAt: string | Date;
  readBy: string[];
}

interface Conversation {
  id: string;
  participants: User[];
  messages: Message[];
  subject?: string;
  lastMessage?: Message;
  unreadCount: number;
}

function NewConversationModal({
  allUsers,
  currentUserId,
  onClose,
  onCreated,
}: {
  allUsers: User[];
  currentUserId: string;
  onClose: () => void;
  onCreated: (conv: Conversation) => void;
}) {
  const t = useTranslations("messages");
  const [selected, setSelected] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [firstMsg, setFirstMsg] = useState("");
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const others = allUsers.filter((u) => u.id !== currentUserId);
  const filtered = search
    ? others.filter((u) => u.name?.toLowerCase().includes(search.toLowerCase()) || t(ROLE_KEYS[u.role] ?? u.role)?.toLowerCase().includes(search.toLowerCase()))
    : others;

  function toggle(id: string) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.length === 0 || !firstMsg.trim()) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/messages/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participantIds: selected, subject, firstMessage: firstMsg }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        onCreated(data);
        toast.success(t("conversationCreated"));
        onClose();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t("sendError"));
      }
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold">{t("newConversation")}</h2>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">{t("searchRecipients")}</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1 border border-gray-100 dark:border-gray-800 rounded-lg p-2">
            {filtered.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => toggle(u.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left",
                  selected.includes(u.id)
                    ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800"
                )}
              >
                <Avatar className="w-8 h-8">
                  <AvatarImage src={u.avatarUrl ?? undefined} />
                  <AvatarFallback className="text-xs bg-green-100 text-green-700">
                    {getInitials(u.name ?? "?")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.name}</p>
                  <p className="text-xs text-gray-400">{t(ROLE_KEYS[u.role] ?? u.role)}</p>
                </div>
                {selected.includes(u.id) && (
                  <CheckCheck className="w-4 h-4 text-green-600 shrink-0" />
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-4">{t("noUsersFound")}</p>
            )}
          </div>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selected.map((id) => {
                const u = allUsers.find((x) => x.id === id);
                return u ? (
                  <span key={id} className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                    {u.name}
                    <button type="button" onClick={() => toggle(id)} className="hover:text-green-900">×</button>
                  </span>
                ) : null;
              })}
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">{t("subjectOptional")}</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("subjectPlaceholder")}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">{t("messageLabel")}</label>
            <textarea
              required
              value={firstMsg}
              onChange={(e) => setFirstMsg(e.target.value)}
              rows={3}
              placeholder={t("messagePlaceholder")}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>{t("cancel")}</Button>
            <Button
              type="submit"
              disabled={isPending || selected.length === 0 || !firstMsg.trim()}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              {isPending ? t("sending") : t("sendBtn")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function MessagerieView({
  currentUserId,
  currentUserName,
  allUsers,
}: {
  currentUserId: string;
  currentUserName: string;
  tenantId: string;
  allUsers: User[];
}) {
  const t = useTranslations("messages");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [newMsg, setNewMsg] = useState("");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Charger les conversations
  useEffect(() => {
    fetch("/api/messages/conversations")
      .then((r) => r.json())
      .then((data) => {
        setConversations(data.conversations ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedConv?.messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedConv || !newMsg.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/messages/conversations/${selectedConv.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newMsg }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const msg: Message = data;
      const updated: Conversation = {
        ...selectedConv,
        messages: [...selectedConv.messages, msg],
        lastMessage: msg,
      };
      setSelectedConv(updated);
      setConversations((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      );
      setNewMsg("");
    } catch {
      toast.error(t("sendError"));
    } finally {
      setSending(false);
    }
  }

  const filteredConvs = search
    ? conversations.filter((c) => {
        const other = c.participants.find((p) => p.id !== currentUserId);
        return other?.name?.toLowerCase().includes(search.toLowerCase()) ||
          c.subject?.toLowerCase().includes(search.toLowerCase());
      })
    : conversations;

  const totalUnread = conversations.reduce((s, c) => s + c.unreadCount, 0);

  return (
    <div className="flex h-full">
      {/* Sidebar conversations */}
      <div className="w-80 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-900">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">{t("messagesTitle")}</h2>
              {totalUnread > 0 && (
                <p className="text-xs text-green-600">{t("unread", { count: totalUnread })}</p>
              )}
            </div>
            <Button
              size="icon"
              className="bg-green-600 hover:bg-green-700 text-white w-8 h-8"
              onClick={() => setShowNew(true)}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search")}
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 border-0"
            />
          </div>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">{t("loading")}</div>
          ) : filteredConvs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400">
              <Users className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">{t("noConversations")}</p>
              <button
                onClick={() => setShowNew(true)}
                className="text-xs text-green-600 hover:underline mt-1"
              >
                {t("startNew")}
              </button>
            </div>
          ) : (
            filteredConvs.map((conv) => {
              const other = conv.participants.find((p) => p.id !== currentUserId) ?? conv.participants[0];
              const isSelected = selectedConv?.id === conv.id;
              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConv(conv)}
                  className={cn(
                    "w-full flex items-start gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left",
                    isSelected && "bg-green-50 dark:bg-green-900/10 border-l-2 border-l-green-600"
                  )}
                >
                  <div className="relative">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={other?.avatarUrl ?? undefined} />
                      <AvatarFallback className="bg-green-100 text-green-700 text-sm">
                        {getInitials(other?.name ?? "?")}
                      </AvatarFallback>
                    </Avatar>
                    <Circle className="absolute bottom-0 right-0 w-3 h-3 text-green-500 fill-current" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={cn("text-sm font-medium truncate", conv.unreadCount > 0 && "font-bold text-gray-900 dark:text-white")}>
                        {conv.participants.length > 2 ? (conv.subject ?? t("group")) : (other?.name ?? t("unknown"))}
                      </p>
                      <span className="text-xs text-gray-400 shrink-0 ml-2">
                        {conv.lastMessage ? timeAgo(conv.lastMessage.createdAt) : ""}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-gray-500 truncate">
                        {conv.lastMessage?.content ?? t("noMessages")}
                      </p>
                      {conv.unreadCount > 0 && (
                        <span className="ml-2 bg-green-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Zone de conversation */}
      <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-800/50">
        {selectedConv ? (
          <>
            {/* Conv header */}
            <div className="flex items-center gap-3 px-6 py-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              {(() => {
                const other = selectedConv.participants.find((p) => p.id !== currentUserId);
                return (
                  <>
                    <Avatar className="w-9 h-9">
                      <AvatarFallback className="bg-green-100 text-green-700 text-sm">
                        {getInitials(other?.name ?? "?")}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white text-sm">
                        {selectedConv.participants.length > 2
                          ? (selectedConv.subject ?? t("groupCount", { count: selectedConv.participants.length }))
                          : (other?.name ?? t("unknown"))}
                      </p>
                      {other && <p className="text-xs text-gray-400">{t(ROLE_KEYS[other.role] ?? other.role)}</p>}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {selectedConv.messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <p className="text-sm">{t("startConversation")}</p>
                </div>
              ) : (
                selectedConv.messages.map((msg) => {
                  const isMe = msg.senderId === currentUserId;
                  return (
                    <div key={msg.id} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[70%] space-y-1", isMe ? "items-end" : "items-start")}>
                        {!isMe && (
                          <p className="text-xs text-gray-400 px-1">{msg.senderName}</p>
                        )}
                        <div
                          className={cn(
                            "px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
                            isMe
                              ? "bg-green-600 text-white rounded-tr-sm"
                              : "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm rounded-tl-sm border border-gray-100 dark:border-gray-700"
                          )}
                        >
                          {msg.content}
                        </div>
                        <div className={cn("flex items-center gap-1 px-1", isMe ? "justify-end" : "justify-start")}>
                          <p className="text-xs text-gray-400">{timeAgo(msg.createdAt)}</p>
                          {isMe && (
                            <CheckCheck className="w-3.5 h-3.5 text-green-500" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input message */}
            <form
              onSubmit={sendMessage}
              className="flex items-end gap-3 px-6 py-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700"
            >
              <textarea
                value={newMsg}
                onChange={(e) => setNewMsg(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(e); }
                }}
                placeholder={t("typeMessage")}
                rows={2}
                className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500 border-0"
              />
              <Button
                type="submit"
                disabled={sending || !newMsg.trim()}
                size="icon"
                className="w-10 h-10 bg-green-600 hover:bg-green-700 text-white rounded-xl shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 space-y-3">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
              <Send className="w-7 h-7 opacity-40" />
            </div>
            <p className="font-medium text-gray-500">{t("selectConversation")}</p>
            <p className="text-sm">{t("orStartNew")}</p>
            <Button onClick={() => setShowNew(true)} variant="outline" className="mt-2 gap-2">
              <Plus className="w-4 h-4" />
              {t("newMessage")}
            </Button>
          </div>
        )}
      </div>

      {showNew && (
        <NewConversationModal
          allUsers={allUsers}
          currentUserId={currentUserId}
          onClose={() => setShowNew(false)}
          onCreated={(conv) => {
            setConversations((prev) => [conv, ...prev]);
            setSelectedConv(conv);
          }}
        />
      )}
    </div>
  );
}

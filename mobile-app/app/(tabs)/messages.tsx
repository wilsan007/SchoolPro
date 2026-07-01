import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Send } from "lucide-react-native";
import { apiFetch } from "@/lib/api";
import { cn, formatDate, getInitials } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";

interface ConversationItem {
  id: string;
  titre: string | null;
  type: string;
  updatedAt: string;
  participants: Array<{
    userId: string;
    user: { id: string; name: string; email: string };
  }>;
  messages: Array<{
    id: string;
    content: string;
    createdAt: string;
    senderId: string;
    sender: { id: string; name: string };
    readBy: string[];
  }>;
  _count: { messages: number };
}

interface MessagesResponse {
  conversations: ConversationItem[];
  nonLus: number;
}

export default function MessagesScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const currentUser = useAuthStore((s) => s.user);

  const { data, isLoading, refetch } = useQuery<MessagesResponse>({
    queryKey: ["messages"],
    queryFn: () => apiFetch<MessagesResponse>("/api/mobile/messages"),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const renderConversation = ({ item }: { item: ConversationItem }) => {
    const lastMsg = item.messages[0];
    const isUnread = lastMsg && lastMsg.senderId !== currentUser?.id && !lastMsg.readBy.includes(currentUser?.id ?? "");
    const otherParticipants = item.participants.filter((p) => p.userId !== currentUser?.id);
    const displayName = item.titre ?? otherParticipants.map((p) => p.user.name).join(", ") ?? "Conversation";

    return (
      <Pressable
        className="flex-row items-center bg-white px-4 py-3.5 active:opacity-70"
        style={{ borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}
      >
        <View className="w-12 h-12 rounded-full bg-primary/10 items-center justify-center mr-3">
          <Text className="text-sm font-bold text-primary">
            {getInitials(displayName)}
          </Text>
        </View>
        <View className="flex-1">
          <View className="flex-row items-center justify-between">
            <Text className={cn("text-sm flex-1", isUnread ? "font-bold text-gray-900" : "font-semibold text-gray-700")}>
              {displayName}
            </Text>
            {lastMsg && (
              <Text className="text-xs text-gray-400">{formatDate(lastMsg.createdAt)}</Text>
            )}
          </View>
          {lastMsg && (
            <Text
              className={cn("text-xs mt-0.5", isUnread ? "text-gray-700 font-medium" : "text-gray-500")}
              numberOfLines={2}
            >
              {lastMsg.senderId === currentUser?.id ? "Vous: " : `${lastMsg.sender.name}: `}
              {lastMsg.content}
            </Text>
          )}
          <View className="flex-row items-center mt-1">
            <MessageCircle size={12} color="#9ca3af" />
            <Text className="text-xs text-gray-400 ml-1">{item._count.messages} message{item._count.messages > 1 ? "s" : ""}</Text>
          </View>
        </View>
        {isUnread && (
          <View className="w-2.5 h-2.5 rounded-full bg-primary ml-2" />
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="bg-white px-5 pt-3 pb-3 border-b border-gray-100">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-bold text-gray-900">Messages</Text>
          {data && data.nonLus > 0 && (
            <View className="px-2.5 py-1 rounded-full bg-primary">
              <Text className="text-xs font-bold text-white">{data.nonLus} non lu{data.nonLus > 1 ? "s" : ""}</Text>
            </View>
          )}
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#4f46e5" />
        </View>
      ) : (
        <FlatList
          data={data?.conversations ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderConversation}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View className="items-center py-20">
              <Send size={40} color="#d1d5db" />
              <Text className="text-sm text-gray-400 mt-3">Aucune conversation</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

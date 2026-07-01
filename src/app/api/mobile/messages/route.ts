import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";
import { verifyMobileToken, mobileUnauthorized } from "@/lib/mobile-auth";

export async function GET(req: NextRequest) {
  const user = await verifyMobileToken(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "50");

  // Get conversations where user is a participant
  const { data: participantRows, error: partError } = await supabase
    .from("conversation_participants")
    .select("conversationId")
    .eq("userId", user.id);

  if (partError) {
    return NextResponse.json({ error: partError.message }, { status: 500 });
  }

  const conversationIds = (participantRows ?? []).map((p) => p.conversationId);
  if (conversationIds.length === 0) {
    return NextResponse.json({ conversations: [], nonLus: 0 });
  }

  const { data: conversations, error } = await supabase
    .from("conversations")
    .select(`
      id,
      titre,
      updatedAt,
      participants:conversation_participants (
        userId,
        user:userId ( id, name, email )
      )
    `)
    .in("id", conversationIds)
    .eq("tenantId", user.tenantId)
    .order("updatedAt", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch last message and count for each conversation
  const conversationsWithMessages = await Promise.all(
    (conversations ?? []).map(async (c) => {
      const { data: messages } = await supabase
        .from("messages")
        .select("id, senderId, content, readBy, createdAt, sender:senderId ( id, name )")
        .eq("conversationId", c.id)
        .order("createdAt", { ascending: false })
        .limit(1);

      const { count } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("conversationId", c.id);

      return {
        ...c,
        messages: messages ?? [],
        _count: { messages: count ?? 0 },
      };
    })
  );

  const nonLus = conversationsWithMessages.reduce((acc, c) => {
    const lastMsg = c.messages[0];
    if (lastMsg && lastMsg.senderId !== user.id && !(lastMsg.readBy ?? []).includes(user.id)) {
      return acc + 1;
    }
    return acc;
  }, 0);

  return NextResponse.json({ conversations: conversationsWithMessages, nonLus });
}

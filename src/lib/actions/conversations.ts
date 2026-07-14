"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/household";

/**
 * Start (or reopen) a conversation. For a 1:1 without a title, an existing
 * conversation with exactly the same two people is reused instead of
 * creating a duplicate thread.
 */
export async function startConversation(formData: FormData) {
  const membership = await getMembership();
  if (!membership) redirect("/onboarding");

  const targets = [...new Set(formData.getAll("to").map(String).filter(Boolean))];
  const title = String(formData.get("title") ?? "").trim().slice(0, 80) || null;
  if (targets.length === 0)
    redirect(`/messages/new?error=${encodeURIComponent("Pick at least one person")}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const me = user.id;
  const others = targets.filter((t) => t !== me);
  if (others.length === 0)
    redirect(`/messages/new?error=${encodeURIComponent("Pick someone other than yourself")}`);

  // validate: each target is a household member or shares a trip with me
  const [{ data: hhMembers }, { data: myTrips }] = await Promise.all([
    supabase
      .from("household_members")
      .select("user_id")
      .eq("household_id", membership.household_id),
    supabase.from("trip_participants").select("trip_id").eq("user_id", me),
  ]);
  const memberIds = new Set((hhMembers ?? []).map((m) => m.user_id));
  const tripIds = (myTrips ?? []).map((t) => t.trip_id);
  let companionIds = new Set<string>();
  if (tripIds.length > 0) {
    const { data: companions } = await supabase
      .from("trip_participants")
      .select("user_id")
      .in("trip_id", tripIds)
      .not("user_id", "is", null);
    companionIds = new Set((companions ?? []).map((c) => c.user_id as string));
  }
  for (const t of others) {
    if (!memberIds.has(t) && !companionIds.has(t))
      redirect(`/messages/new?error=${encodeURIComponent("You can only message family members and trip companions")}`);
  }

  const isGroup = others.length > 1 || Boolean(title);

  // reuse an existing 1:1
  if (!isGroup) {
    const other = others[0];
    const { data: mine } = await supabase
      .from("conversation_participants")
      .select("conversation_id, conversations!inner(is_group)")
      .eq("user_id", me)
      .eq("conversations.is_group", false);
    const myConvIds = (mine ?? []).map((r) => r.conversation_id);
    if (myConvIds.length > 0) {
      const { data: theirs } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", other)
        .in("conversation_id", myConvIds);
      for (const row of theirs ?? []) {
        const { count } = await supabase
          .from("conversation_participants")
          .select("user_id", { count: "exact", head: true })
          .eq("conversation_id", row.conversation_id);
        if (count === 2) redirect(`/messages/dm/${row.conversation_id}`);
      }
    }
  }

  const { data: conv, error } = await supabase
    .from("conversations")
    .insert({
      household_id: membership.household_id,
      is_group: isGroup,
      title,
      created_by: me,
    })
    .select("id")
    .single();
  if (error || !conv)
    redirect(`/messages/new?error=${encodeURIComponent(error?.message ?? "Could not start chat")}`);

  const rows = [me, ...others].map((uid) => ({ conversation_id: conv.id, user_id: uid }));
  const { error: pErr } = await supabase.from("conversation_participants").insert(rows);
  if (pErr) redirect(`/messages/new?error=${encodeURIComponent(pErr.message)}`);

  redirect(`/messages/dm/${conv.id}`);
}

export async function markConversationRead(conversationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id);
}

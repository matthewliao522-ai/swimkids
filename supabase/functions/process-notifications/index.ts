import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FALLBACK_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async () => {
  const now = new Date().toISOString();

  const { data: notifications } = await supabase
    .from("pending_notifications")
    .select("id, guardian_id, venue_id, message, guardians(line_user_id, notify_enabled)")
    .lte("send_at", now)
    .is("sent_at", null);

  for (const notif of notifications || []) {
    const guardian = notif.guardians as { line_user_id: string | null; notify_enabled: boolean } | null;

    // 取得場館 token 與對應的 line_user_id
    let token = FALLBACK_TOKEN;
    let lineUserId = guardian?.line_user_id || null;

    if (notif.venue_id) {
      const { data: venue } = await supabase
        .from("venues")
        .select("line_channel_access_token")
        .eq("id", notif.venue_id)
        .maybeSingle();

      if (venue?.line_channel_access_token) token = venue.line_channel_access_token;

      const { data: binding } = await supabase
        .from("guardian_line_bindings")
        .select("line_user_id")
        .eq("guardian_id", notif.guardian_id)
        .eq("venue_id", notif.venue_id)
        .maybeSingle();

      if (binding?.line_user_id) lineUserId = binding.line_user_id;
    }

    if (!lineUserId || guardian?.notify_enabled === false) {
      await supabase.from("pending_notifications").update({ sent_at: now }).eq("id", notif.id);
      continue;
    }

    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: "text", text: notif.message }],
      }),
    });

    await supabase.from("pending_notifications").update({ sent_at: now }).eq("id", notif.id);
  }

  return new Response(JSON.stringify({ processed: (notifications || []).length }), {
    headers: { "Content-Type": "application/json" },
  });
});

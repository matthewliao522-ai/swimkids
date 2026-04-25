import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function pushMessage(userId: string, text: string) {
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: "text", text }],
    }),
  });
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  const bodyText = await req.text();
  if (!bodyText) return new Response("ok", { status: 200 });

  const body = JSON.parse(bodyText);
  if (!body.events?.length) return new Response("ok", { status: 200 });

  for (const event of body.events || []) {
    if (event.type !== "message" || event.message?.type !== "text") continue;

    const lineUserId = event.source?.userId;
    const text = event.message.text.trim().replace(/[\s\-]/g, "");

    if (/^09\d{8}$/.test(text)) {
      const formatted = `${text.slice(0,4)}-${text.slice(4,7)}-${text.slice(7)}`;
      const { data: guardian } = await supabase
        .from("guardians")
        .select("id, name")
        .or(`phone.eq.${text},phone.eq.${formatted}`)
        .maybeSingle();

      if (guardian) {
        await supabase
          .from("guardians")
          .update({ line_user_id: lineUserId })
          .eq("id", guardian.id);

        await pushMessage(lineUserId, `${guardian.name} 您好！LINE 通知已成功綁定，孩子的考試結果出爐時將立即通知您 🎉`);
      } else {
        await pushMessage(lineUserId, `找不到手機號碼 ${text} 的家長資料，請確認號碼是否正確。`);
      }
    }
  }

  return new Response("ok", { status: 200 });
});

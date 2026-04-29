import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { cert_print_request_id } = await req.json();
    if (!cert_print_request_id) {
      return new Response(JSON.stringify({ error: "缺少 cert_print_request_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase
      .from("cert_print_requests")
      .select(`
        id, level, status,
        students ( name ),
        guardians ( id, name, line_user_id ),
        venues ( name, line_channel_access_token )
      `)
      .eq("id", cert_print_request_id)
      .single();

    if (error || !data) {
      return new Response(JSON.stringify({ error: "查無申請記錄" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const guardian = data.guardians as { id: string; name: string; line_user_id: string | null };
    const student  = data.students  as { name: string };
    const venue    = data.venues    as { name: string; line_channel_access_token: string | null };
    const level    = data.level;

    if (!guardian.line_user_id) {
      return new Response(JSON.stringify({ error: "家長未綁定 LINE，無法發送通知" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = venue.line_channel_access_token;
    if (!token) {
      return new Response(JSON.stringify({ error: "此場館未設定 LINE Channel Token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const message =
`【小泳士】${guardian.name} 您好！
孩子 ${student.name} 的第 ${level} 級認證泳帽已完成印製，請至 ${venue.name} 領取。
請攜帶此通知至服務台，完成領取手續。`;
    const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: guardian.line_user_id,
        messages: [{ type: "text", text: message }],
      }),
    });

    if (!lineRes.ok) {
      const errText = await lineRes.text();
      return new Response(JSON.stringify({ error: `LINE 發送失敗：${errText}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("cert_print_requests")
      .update({ status: "done", notified_at: new Date().toISOString() })
      .eq("id", cert_print_request_id);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

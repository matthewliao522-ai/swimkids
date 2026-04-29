import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // 驗證呼叫者為 admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "未授權" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "未授權" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: staffRole } = await supabase
      .from("staff_roles").select("role").eq("auth_id", user.id).maybeSingle();
    if (staffRole?.role !== "admin") {
      return new Response(JSON.stringify({ error: "需要管理員權限" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { guardian_id } = await req.json();
    if (!guardian_id) {
      return new Response(JSON.stringify({ error: "缺少 guardian_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 取得家長資訊
    const { data: guardian } = await supabase
      .from("guardians").select("email, auth_id").eq("id", guardian_id).maybeSingle();
    if (!guardian) {
      return new Response(JSON.stringify({ error: "找不到此家長記錄" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 刪除 student_guardian 關聯
    await supabase.from("student_guardian").delete().eq("guardian_id", guardian_id);

    // 若為副家長（fake email），同步刪除 auth user 及 guardians 記錄
    if (guardian.email?.endsWith("@swimkids.app")) {
      if (guardian.auth_id) {
        await supabase.auth.admin.deleteUser(guardian.auth_id);
      }
      await supabase.from("guardians").delete().eq("id", guardian_id);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

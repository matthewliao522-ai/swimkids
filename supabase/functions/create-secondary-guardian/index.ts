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
    const { primary_phone, secondary_phone, secondary_name } = await req.json();

    if (!primary_phone || !secondary_phone || !secondary_name) {
      return new Response(JSON.stringify({ error: "缺少必要欄位" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fmt = (p: string) => {
      const d = p.replace(/\D/g, "");
      return `${d.slice(0,4)}-${d.slice(4,7)}-${d.slice(7)}`;
    };
    const primaryFmt  = fmt(primary_phone);
    const secondaryFmt = fmt(secondary_phone);

    // 確認主要家長存在
    const { data: primaryGuardian } = await supabase
      .from("guardians")
      .select("id, name")
      .or(`phone.eq.${primary_phone},phone.eq.${primaryFmt}`)
      .maybeSingle();

    if (!primaryGuardian) {
      return new Response(JSON.stringify({ error: "找不到此登記手機的家長資料" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 確認第二家長手機尚未存在
    const { data: existing } = await supabase
      .from("guardians")
      .select("id")
      .or(`phone.eq.${secondary_phone},phone.eq.${secondaryFmt}`)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "此手機號碼已在系統中，請直接使用首次啟用" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 找主要家長的所有學員
    const { data: sgLinks } = await supabase
      .from("student_guardian")
      .select("student_id, students(name)")
      .eq("guardian_id", primaryGuardian.id);

    if (!sgLinks || sgLinks.length === 0) {
      return new Response(JSON.stringify({ error: "此家長尚無連結的學員" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 建立新的 guardian 記錄
    const fakeEmail = `${secondary_phone.replace(/\D/g,"")}@swimkids.app`;
    const { data: newGuardian, error: insertErr } = await supabase
      .from("guardians")
      .insert({ name: secondary_name, phone: secondaryFmt, email: fakeEmail })
      .select("id")
      .single();

    if (insertErr || !newGuardian) {
      return new Response(JSON.stringify({ error: "建立家長記錄失敗：" + insertErr?.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 複製 student_guardian 連結
    const newLinks = sgLinks.map(l => ({ student_id: l.student_id, guardian_id: newGuardian.id }));
    await supabase.from("student_guardian").insert(newLinks);

    const students = sgLinks.map(l => ({ name: (l.students as any)?.name || "" }));

    return new Response(JSON.stringify({ success: true, students }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

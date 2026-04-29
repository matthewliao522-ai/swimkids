import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

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
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase
      .from("cert_print_requests")
      .select(`id, level, created_at, students(name), guardians(name), venues(name, notify_email)`)
      .eq("id", cert_print_request_id)
      .single();

    if (error || !data) {
      return new Response(JSON.stringify({ error: "查無申請記錄" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const venue    = data.venues    as { name: string; notify_email: string | null };
    const student  = data.students  as { name: string };
    const guardian = data.guardians as { name: string };
    const level    = data.level;

    if (!venue?.notify_email) {
      return new Response(JSON.stringify({ error: "場館未設定通知 Email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gmailUser = Deno.env.get("GMAIL_USER")!;
    const gmailPass = Deno.env.get("GMAIL_APP_PASSWORD")!.replace(/\s/g, "");

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });

    await transporter.sendMail({
      from: `小泳士系統 <${gmailUser}>`,
      to: venue.notify_email,
      subject: `【小泳士】印製申請 - ${student.name} 第 ${level} 級`,
      text: `${venue.name} 您好，\n\n家長 ${guardian.name} 申請為學員 ${student.name} 印製第 ${level} 級恆動力認證泳帽。\n\n請確認後安排印製作業，完成後請至小泳士管理後台標記完成，系統將自動通知家長前來領取。\n\n小泳士管理系統`,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: '未授權' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 確認呼叫者是 admin
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: callerUser }, error: authErr } = await supabaseAdmin.auth.getUser(token)
    if (authErr || !callerUser) {
      return new Response(JSON.stringify({ error: '驗證失敗' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const { data: staffRole } = await supabaseAdmin.from('staff_roles').select('role').eq('auth_id', callerUser.id).maybeSingle()
    if (!staffRole || staffRole.role !== 'admin') {
      return new Response(JSON.stringify({ error: '僅管理員可建立教練帳號' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { email, password, name, phone, role, status } = await req.json()
    if (!email || !password || !name || !phone || !role) {
      return new Response(JSON.stringify({ error: '缺少必要欄位' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 建立 Auth 使用者
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createErr) {
      return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 建立教練資料
    const { data: coach, error: coachErr } = await supabaseAdmin
      .from('coaches').insert({ name, phone, role, status: status || 'active' }).select('id').single()
    if (coachErr) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
      return new Response(JSON.stringify({ error: coachErr.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 建立 staff_roles（所有教練統一用 coach，exam/teach 由 coaches.role 區分）
    const { error: roleErr } = await supabaseAdmin.from('staff_roles').insert({
      auth_id: newUser.user.id,
      role: 'coach',
      coach_id: coach.id,
    })
    if (roleErr) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
      await supabaseAdmin.from('coaches').delete().eq('id', coach.id)
      return new Response(JSON.stringify({ error: roleErr.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(
      JSON.stringify({ success: true, coach_id: coach.id, auth_id: newUser.user.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

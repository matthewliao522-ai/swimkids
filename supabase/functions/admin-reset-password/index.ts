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

    const { auth_id, new_password } = await req.json()
    if (!auth_id || !new_password) {
      return new Response(
        JSON.stringify({ error: '缺少必要參數' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const callerToken = authHeader.replace('Bearer ', '')
    const { data: { user: callerUser }, error: authErr } = await supabaseAdmin.auth.getUser(callerToken)
    if (authErr || !callerUser) {
      return new Response(JSON.stringify({ error: '驗證失敗' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const { data: staffRole } = await supabaseAdmin.from('staff_roles').select('role').eq('auth_id', callerUser.id).maybeSingle()
    if (!staffRole || staffRole.role !== 'admin') {
      return new Response(JSON.stringify({ error: '僅管理員可重設密碼' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(auth_id, {
      password: new_password
    })
    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

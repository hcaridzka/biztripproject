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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json()
    const { action, userId, email, password, name, nip, role, jabatan, pt_access, is_super_admin, newPassword } = body

    // 1. CREATE USER
    if (action === 'create') {
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, nip, role, jabatan }
      })

      if (authError) throw authError

      // Upsert/Update profile di database
      const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
        id: authUser.user.id,
        email,
        name,
        nip,
        role,
        jabatan,
        pt_access: pt_access || [],
        is_super_admin: is_super_admin || false
      })

      if (profileError) throw profileError

      return new Response(JSON.stringify({ user: authUser.user }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // 2. UPDATE USER (Metadata Profile & Email)
    if (action === 'update') {
      // Update data auth jika email berubah
      if (email) {
        await supabaseAdmin.auth.admin.updateUserById(userId, { email })
      }

      // Update tabel profiles
      const { error: updateError } = await supabaseAdmin.from('profiles').update({
        name,
        email,
        nip,
        role,
        jabatan,
        pt_access,
        is_super_admin
      }).eq('id', userId)

      if (updateError) throw updateError

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // 3. DELETE USER (Auth + Profile Cascades)
    if (action === 'delete') {
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
      if (deleteError) throw deleteError

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // 4. RESET / CHANGE PASSWORD
    if (action === 'change_email_password') {
      const { error: pwdError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: newPassword
      })
      if (pwdError) throw pwdError

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    return new Response(JSON.stringify({ error: 'Action tidak valid' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

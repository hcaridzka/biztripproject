import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error('Supabase environment variables belum lengkap');
    }

    /*
     * 1. VALIDASI USER YANG MEMANGGIL FUNCTION
     */
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    /*
     * Client user:
     * dipakai untuk membaca siapa caller sebenarnya.
     */
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user: caller },
      error: callerError,
    } = await supabaseUser.auth.getUser();

    if (callerError || !caller) {
      return jsonResponse({ error: 'Session tidak valid' }, 401);
    }

    /*
     * 2. ADMIN CLIENT
     *
     * Service role hanya berada di Edge Function,
     * tidak pernah dikirim ke React/frontend.
     */
    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    /*
     * 3. CHECK ROLE CALLER
     */
    const { data: callerProfile, error: profileError } =
      await supabaseAdmin
        .from('profiles')
        .select('id, role, is_super_admin')
        .eq('id', caller.id)
        .single();

    if (profileError || !callerProfile) {
      return jsonResponse(
        { error: 'Profile caller tidak ditemukan' },
        403
      );
    }

    if (callerProfile.role !== 'HR Manager') {
      return jsonResponse(
        { error: 'Hanya HR Manager yang dapat mengelola user' },
        403
      );
    }

    /*
     * 4. BODY
     */
    const body = await req.json();

    const {
      action,
      userId,
      email,
      password,
      newPassword,
      name,
      nip,
      role,
      jabatan,
      pt_unit,
      pt_access,
      is_super_admin,
      is_demo,
    } = body;

    /*
     * =========================================================
     * CREATE USER
     * =========================================================
     */
    if (action === 'create') {
      if (!email || !password || !name || !role || !jabatan) {
        return jsonResponse(
          {
            error:
              'Nama, email, password, role, dan jabatan wajib diisi',
          },
          400
        );
      }

      if (password.length < 8) {
        return jsonResponse(
          { error: 'Password minimal 8 karakter' },
          400
        );
      }

      /*
       * CREATE AUTH USER
       */
      const { data: authData, error: authError } =
        await supabaseAdmin.auth.admin.createUser({
          email: email.trim().toLowerCase(),
          password,
          email_confirm: true,
          user_metadata: {
            name,
            nip: nip || null,
            role,
            jabatan,
          },
        });

      if (authError) throw authError;

      const createdUser = authData.user;

      try {
        /*
         * SYNC PROFILE
         */
        const { error: profileInsertError } =
          await supabaseAdmin
            .from('profiles')
            .upsert({
              id: createdUser.id,
              email: email.trim().toLowerCase(),
              name: name.trim(),
              nip: nip || null,
              role,
              jabatan,
              pt_unit: pt_unit || null,
              pt_access: Array.isArray(pt_access)
                ? pt_access
                : [],
              is_super_admin: Boolean(is_super_admin),
              is_demo: Boolean(is_demo),
            });

        if (profileInsertError) {
          throw profileInsertError;
        }
      } catch (profileSyncError) {
        /*
         * Rollback supaya tidak ada Auth user
         * tanpa profile kalau insert profile gagal.
         */
        await supabaseAdmin.auth.admin.deleteUser(
          createdUser.id
        );

        throw profileSyncError;
      }

      return jsonResponse({
        success: true,
        user: {
          id: createdUser.id,
          email: createdUser.email,
        },
      });
    }

    /*
     * Semua action berikut butuh target user.
     */
    if (!userId) {
      return jsonResponse(
        { error: 'User ID wajib diisi' },
        400
      );
    }

    /*
     * Proteksi HR agar tidak delete akun sendiri
     */
    if (
      action === 'delete' &&
      userId === caller.id
    ) {
      return jsonResponse(
        { error: 'Anda tidak dapat menghapus akun sendiri' },
        400
      );
    }

    /*
     * =========================================================
     * UPDATE USER
     * Auth + Profile
     * =========================================================
     */
    if (action === 'update') {
      const authUpdates: Record<string, any> = {};

      if (email) {
        authUpdates.email = email.trim().toLowerCase();
        authUpdates.email_confirm = true;
      }

      authUpdates.user_metadata = {
        name,
        nip: nip || null,
        role,
        jabatan,
      };

      const { error: authUpdateError } =
        await supabaseAdmin.auth.admin.updateUserById(
          userId,
          authUpdates
        );

      if (authUpdateError) throw authUpdateError;

      const { error: profileUpdateError } =
        await supabaseAdmin
          .from('profiles')
          .update({
            email: email?.trim().toLowerCase(),
            name: name?.trim(),
            nip: nip || null,
            role,
            jabatan,
            pt_unit: pt_unit || null,
            pt_access: Array.isArray(pt_access)
              ? pt_access
              : [],
            is_super_admin: Boolean(is_super_admin),
            is_demo: Boolean(is_demo),
          })
          .eq('id', userId);

      if (profileUpdateError) throw profileUpdateError;

      return jsonResponse({
        success: true,
      });
    }

    /*
     * =========================================================
     * CHANGE PASSWORD BY HR
     * =========================================================
     */
    if (
      action === 'change_password' ||
      action === 'change_email_password'
    ) {
      const targetPassword =
        newPassword || password;

      if (
        !targetPassword ||
        targetPassword.length < 8
      ) {
        return jsonResponse(
          { error: 'Password baru minimal 8 karakter' },
          400
        );
      }

      const { error: passwordError } =
        await supabaseAdmin.auth.admin.updateUserById(
          userId,
          {
            password: targetPassword,
          }
        );

      if (passwordError) throw passwordError;

      return jsonResponse({
        success: true,
      });
    }

    /*
     * =========================================================
     * SEND RESET PASSWORD EMAIL
     *
     * Ini sebenarnya tidak butuh admin API,
     * tapi action tetap disediakan supaya semua
     * user-management lewat satu pintu.
     * =========================================================
     */
    if (action === 'send_reset_password') {
      if (!email) {
        return jsonResponse(
          { error: 'Email wajib diisi' },
          400
        );
      }

      /*
       * Admin function tidak mengirim password plaintext.
       * Untuk recovery email kita generate recovery link.
       */
      const { data: linkData, error: linkError } =
        await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email: email.trim().toLowerCase(),
        });

      if (linkError) throw linkError;

      return jsonResponse({
        success: true,
        actionLink: linkData.properties?.action_link,
      });
    }

    /*
     * =========================================================
     * DELETE PERMANENTLY
     * Auth + Profile
     * =========================================================
     */
    if (action === 'delete') {
      /*
       * Delete profile dulu supaya tidak bergantung
       * pada cascade FK yang belum kita pastikan.
       */
      const { error: profileDeleteError } =
        await supabaseAdmin
          .from('profiles')
          .delete()
          .eq('id', userId);

      if (profileDeleteError) {
        throw profileDeleteError;
      }

      const { error: authDeleteError } =
        await supabaseAdmin.auth.admin.deleteUser(
          userId
        );

      if (authDeleteError) {
        throw authDeleteError;
      }

      return jsonResponse({
        success: true,
      });
    }

    return jsonResponse(
      { error: 'Action tidak valid' },
      400
    );
  } catch (err: any) {
    console.error('manage-user error:', err);

    return jsonResponse(
      {
        error:
          err?.message ||
          'Terjadi kesalahan pada manage-user',
      },
      400
    );
  }
});

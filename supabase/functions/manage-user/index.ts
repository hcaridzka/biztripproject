import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  action: 'create' | 'update' | 'delete' | 'change_email_password';
  email?: string;
  password?: string;
  role?: string;
  name?: string;
  nip?: string;
  jabatan?: string;
  pt_access?: string[];
  is_super_admin?: boolean;
  userId?: string;
  newEmail?: string;
  newPassword?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Missing env vars" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body: RequestBody = await req.json();

    switch (body.action) {
      case 'create': {
        if (!body.email || !body.password || !body.name) {
          return new Response(JSON.stringify({ error: "Email, password, and name are required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data, error } = await supabase.auth.admin.createUser({
          email: body.email,
          password: body.password,
          email_confirm: true,
          user_metadata: { name: body.name, role: body.role, nip: body.nip, jabatan: body.jabatan },
          app_metadata: { role: body.role },
        });
        if (error) throw new Error(error.message);
        if (data.user) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            email: body.email,
            role: body.role,
            name: body.name,
            nip: body.nip,
            jabatan: body.jabatan,
            pt_access: body.pt_access ?? [],
            is_super_admin: body.is_super_admin ?? false,
            is_demo: false,
          });
        }
        return new Response(JSON.stringify({ success: true, userId: data.user?.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case 'update': {
        if (!body.userId) throw new Error("userId required");
        const updateData: Record<string, unknown> = {};
        if (body.password) updateData.password = body.password;
        if (body.email) updateData.email = body.email;
        updateData.email_confirm = true;
        updateData.user_metadata = { name: body.name, role: body.role, nip: body.nip, jabatan: body.jabatan };
        updateData.app_metadata = { role: body.role };

        const { error: authErr } = await supabase.auth.admin.updateUserById(body.userId, updateData);
        if (authErr) throw new Error(authErr.message);

        const profileUpdate: Record<string, unknown> = {
          role: body.role, name: body.name, nip: body.nip, jabatan: body.jabatan,
          pt_access: body.pt_access ?? [],
          is_super_admin: body.is_super_admin ?? false,
        };
        if (body.email) profileUpdate.email = body.email;

        const { error: profErr } = await supabase.from('profiles').update(profileUpdate).eq('id', body.userId);
        if (profErr) throw new Error(profErr.message);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case 'delete': {
        if (!body.userId) throw new Error("userId required");
        const { error: authErr } = await supabase.auth.admin.deleteUser(body.userId);
        if (authErr) throw new Error(authErr.message);
        await supabase.from('profiles').delete().eq('id', body.userId);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case 'change_email_password': {
        if (!body.userId) throw new Error("userId required");
        const updateData: Record<string, unknown> = { email_confirm: true };
        if (body.newEmail) updateData.email = body.newEmail;
        if (body.newPassword) updateData.password = body.newPassword;

        const { error: authErr } = await supabase.auth.admin.updateUserById(body.userId, updateData);
        if (authErr) throw new Error(authErr.message);

        if (body.newEmail) {
          await supabase.from('profiles').update({ email: body.newEmail, is_demo: false }).eq('id', body.userId);
        } else {
          await supabase.from('profiles').update({ is_demo: false }).eq('id', body.userId);
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DEMO_USERS = [
  { email: "employee@company.com", role: "Employee", name: "Andi Pratama", nip: "EMP-2024-001", jabatan: "Staff", pt_access: [] as string[], is_super_admin: false },
  { email: "manager@company.com", role: "Manager", name: "Rudi Hartono", nip: "MGR-2024-001", jabatan: "Head Department", pt_access: ["PT APN", "PT FRL"], is_super_admin: false },
  { email: "obligo@company.com", role: "PIC Obligo", name: "Slamet Riyadi", nip: "OBL-2024-001", jabatan: "TAD", pt_access: [] as string[], is_super_admin: false },
  { email: "direksi@company.com", role: "Direksi", name: "Bambang Susilo", nip: "DIR-2024-001", jabatan: "Direksi", pt_access: ["PT APN", "PT FRL", "PT SMK", "PT PKS"], is_super_admin: false },
  { email: "hr@company.com", role: "HR Manager", name: "Rina Wati", nip: "HR-2024-001", jabatan: "Head Department", pt_access: [] as string[], is_super_admin: true },
];

const PASSWORD = "Aridzka2025!";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false } });

    const results: { email: string; status: string }[] = [];

    for (const user of DEMO_USERS) {
      // Check if user exists
      const { data: existing } = await supabase.auth.admin.listUsers();
      const found = existing?.users?.find((u: { email?: string }) => u.email === user.email);

      if (found) {
        // ALWAYS reset the password so demo accounts are consistent across sessions
        const { error: pwErr } = await supabase.auth.admin.updateUserById(found.id, {
          password: PASSWORD,
          email_confirm: true,
        });
        if (pwErr) {
          results.push({ email: user.email, status: `password error: ${pwErr.message}` });
          continue;
        }
        // Update profile
        await supabase.from("profiles").upsert({
          id: found.id,
          email: user.email,
          role: user.role,
          name: user.name,
          nip: user.nip,
          jabatan: user.jabatan,
          pt_access: user.pt_access,
          is_super_admin: user.is_super_admin,
          is_demo: true,
        });
        results.push({ email: user.email, status: "password reset + profile updated" });
      } else {
        // Create new user
        const { data, error } = await supabase.auth.admin.createUser({
          email: user.email,
          password: PASSWORD,
          email_confirm: true,
        });
        if (error) {
          results.push({ email: user.email, status: `error: ${error.message}` });
          continue;
        }
        await supabase.from("profiles").upsert({
          id: data.user.id,
          email: user.email,
          role: user.role,
          name: user.name,
          nip: user.nip,
          jabatan: user.jabatan,
          pt_access: user.pt_access,
          is_super_admin: user.is_super_admin,
          is_demo: true,
        });
        results.push({ email: user.email, status: "created" });
      }
    }

    // Seed demo vehicles and drivers if missing
    const { data: existingVehicles } = await supabase.from("vehicles").select("id").limit(1);
    if (!existingVehicles || existingVehicles.length === 0) {
      await supabase.from("vehicles").insert([
        { vehicle_type: "Toyota Innova", plate_number: "BM 1234 AB", status: "available", assigned_driver: "Pak Joko", fuel_monthly_cost: 1500000 },
        { vehicle_type: "Toyota Avanza", plate_number: "BM 5678 CD", status: "available", assigned_driver: "Pak Surya", fuel_monthly_cost: 1200000 },
        { vehicle_type: "Mitsubishi Pajero", plate_number: "BM 9999 EF", status: "maintenance", assigned_driver: null, fuel_monthly_cost: 2000000 },
      ]);
    }

    const { data: existingDrivers } = await supabase.from("drivers").select("id").limit(1);
    if (!existingDrivers || existingDrivers.length === 0) {
      await supabase.from("drivers").insert([
        { name: "Pak Joko", license_number: "SIM-A 1234567", status: "available" },
        { name: "Pak Surya", license_number: "SIM-A 2345678", status: "available" },
        { name: "Pak Bambang", license_number: "SIM-A 3456789", status: "off" },
      ]);
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

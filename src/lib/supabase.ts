import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnnonKey) {
  console.error('Kredensial supabase tidak ditemukan!'); }

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

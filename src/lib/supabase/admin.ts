import "server-only";
import { createClient } from "@supabase/supabase-js";

// Klien admin: nembus RLS. HANYA dipakai di server (route/action).
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );
}
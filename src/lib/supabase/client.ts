import { createClient } from "@supabase/supabase-js";

// Klien publik: aman dipakai di browser. Dibatasi aturan RLS di database.
export function supabasePublik() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
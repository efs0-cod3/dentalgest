import { createClient } from '@supabase/supabase-js'

// Uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS) — only use server-side
export function createSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY no está configurada')
  return createClient(url, key, { auth: { persistSession: false } })
}

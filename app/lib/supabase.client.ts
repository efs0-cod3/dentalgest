import { createBrowserClient } from '@supabase/ssr'

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    window.__env.SUPABASE_URL,
    window.__env.SUPABASE_ANON_KEY,
  )
}

declare global {
  interface Window {
    __env: {
      SUPABASE_URL: string
      SUPABASE_ANON_KEY: string
    }
  }
}

'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase-Client für Client Components (Browser).
 * Läuft mit dem Anon-Key; jede Abfrage unterliegt RLS.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase-Admin-Client mit Service-Role-Key.
 * NUR serverseitig verwenden (Seeds, Invites) – niemals im Client!
 * RLS wird mit diesem Client umgangen.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY ist nicht gesetzt.');
  }
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

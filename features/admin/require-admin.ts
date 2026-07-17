import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Serverseitige Zugriffsprüfung für den Adminbereich: nur platform_admins.
 * Redirect auf /login (öffentliche URL der Admin-Domain) für alle anderen.
 */
export async function requirePlatformAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: adminRow } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!adminRow) redirect('/login');

  return { user, supabase };
}

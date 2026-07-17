import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * PKCE-Callback (z.B. Passwort-Reset-Mail): tauscht den ?code gegen eine
 * Session und leitet auf `next` weiter. Redirects immer über den öffentlichen
 * Tenant-Origin (Host-Header), nie über die interne Rewrite-URL.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/hub';

  const host = request.headers.get('host') ?? 'localhost:3000';
  const proto = request.headers.get('x-forwarded-proto') ?? 'http';
  const origin = `${proto}://${host}`;

  // Nur relative Pfade zulassen (kein Open Redirect)
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/hub';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}

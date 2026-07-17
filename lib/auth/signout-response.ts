import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Logout als echter HTTP-Redirect (303) nach nativem Form-POST:
 * kein Client-JavaScript, keine Race mit React-/Router-Verarbeitung
 * (siehe CLAUDE.md-Stolperfalle), Middleware löst den Zielpfad neu auf.
 */
export async function signOutAndRedirect(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const host = request.headers.get('host') ?? 'localhost:3000';
  const proto = request.headers.get('x-forwarded-proto') ?? 'http';
  return NextResponse.redirect(`${proto}://${host}/`, 303);
}

import type { EmailOtpType } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { texts } from '@/lib/texts';

/**
 * OTP-Bestätigung über token_hash (Invite/Recovery, siehe
 * docs/SUPABASE-MAILVORLAGEN.md):
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
 *
 * WICHTIG – Schutz vor E-Mail-Link-Scannern (Outlook/Defender «Safe Links»):
 * Der Einmal-Token wird NICHT beim GET verifiziert. Automatische
 * Sicherheitsprüfungen öffnen Links per GET vorab und würden den Token
 * sonst entwerten (Symptome: «Link ungültig oder abgelaufen», Konto gilt
 * als bereits bestätigt, ohne dass der Nutzer je ein Passwort setzt). GET
 * zeigt daher nur eine Zwischenseite mit «Fortfahren»; erst der aktive
 * Klick (POST) verifiziert – Scanner senden kein POST.
 */

const VALID_TYPES: EmailOtpType[] = [
  'invite',
  'recovery',
  'signup',
  'email_change',
  'magiclink',
  'email',
];

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function originOf(request: NextRequest): string {
  const host = request.headers.get('host') ?? 'localhost:3000';
  const proto = request.headers.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}

function safeNextOf(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//')
    ? next
    : '/passwort-neu';
}

/** Zwischenseite – verifiziert NICHT (Scanner-Schutz), rendert «Fortfahren». */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash') ?? '';
  const typeRaw = searchParams.get('type') ?? '';
  const next = safeNextOf(searchParams.get('next'));

  const validToken = /^[A-Za-z0-9._-]+$/.test(tokenHash);
  const validType = VALID_TYPES.includes(typeRaw as EmailOtpType);
  if (!validToken || !validType) {
    return NextResponse.redirect(`${originOf(request)}/login?error=auth`);
  }

  const t = texts.auth;
  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${htmlEscape(t.confirmTitle)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center;
    justify-content: center; background: #f6f6f4; color: #2b2b2b;
    font-family: Montserrat, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    padding: 24px; }
  .card { width: 100%; max-width: 420px; background: #fff; border: 1px solid #e5e5e5;
    padding: 32px; }
  h1 { font-family: Antonio, system-ui, sans-serif; text-transform: uppercase;
    letter-spacing: 0.04em; font-size: 20px; margin: 0 0 12px; }
  p { font-size: 14px; line-height: 1.55; color: #5a5a5a; margin: 0 0 20px; }
  .note { font-size: 11px; color: #7c7c7c; margin: 16px 0 0; }
  button { width: 100%; border: 0; background: #70ad47; color: #fff; cursor: pointer;
    font-family: Antonio, system-ui, sans-serif; text-transform: uppercase;
    letter-spacing: 0.12em; font-size: 13px; font-weight: 600; padding: 14px; }
  button:hover { opacity: 0.92; }
</style>
</head>
<body>
  <main class="card">
    <h1>${htmlEscape(t.confirmTitle)}</h1>
    <p>${htmlEscape(t.confirmIntro)}</p>
    <form method="POST" action="/auth/confirm">
      <input type="hidden" name="token_hash" value="${htmlEscape(tokenHash)}" />
      <input type="hidden" name="type" value="${htmlEscape(typeRaw)}" />
      <input type="hidden" name="next" value="${htmlEscape(next)}" />
      <button type="submit">${htmlEscape(t.confirmButton)}</button>
    </form>
    <p class="note">${htmlEscape(t.confirmNote)}</p>
  </main>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Zwischenseite nicht cachen (Token ist einmalig)
      'cache-control': 'no-store',
    },
  });
}

/** Verifiziert den Token – nur der aktive Klick (Formular-POST) kommt hier an. */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const tokenHash = String(form.get('token_hash') ?? '');
  const type = String(form.get('type') ?? '') as EmailOtpType;
  const next = safeNextOf(String(form.get('next') ?? ''));
  const origin = originOf(request);

  if (tokenHash && VALID_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      // 303: Browser folgt mit GET auf die Zielseite (Session-Cookie gesetzt)
      return NextResponse.redirect(`${origin}${next}`, { status: 303 });
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`, { status: 303 });
}

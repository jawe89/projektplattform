'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { texts } from '@/lib/texts';

/**
 * Wichtig: KEIN redirect() in diesen Actions. Next.js rendert das
 * Redirect-Ziel innerhalb desselben Requests – die Tenant-Middleware
 * läuft dabei nicht und der interne Pfad (/p/[projectId]/…) stimmt nicht.
 * Stattdessen liefern die Actions `redirectTo` zurück und der Client
 * navigiert hart (window.location), damit die Middleware neu auflöst.
 */
export interface AuthFormState {
  error?: string;
  success?: string;
  redirectTo?: string;
}

/** Öffentlicher Origin des Tenants (Host-Header, nicht die Rewrite-URL). */
async function getRequestOrigin(): Promise<string> {
  const headerStore = await headers();
  const host = headerStore.get('host') ?? 'localhost:3000';
  const proto = headerStore.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}

/** Projekt-ID aus dem Middleware-Header (Tenant-Erkennung). */
async function getProjectId(): Promise<string | null> {
  const headerStore = await headers();
  return headerStore.get('x-project-id');
}

/**
 * Login: Passwort-Anmeldung + serverseitige Prüfung, dass das Konto Mitglied
 * DIESES Projekts ist (falsche Domain-/Projektzuordnung unmöglich).
 */
export async function signIn(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: texts.auth.invalidCredentials };
  }

  const supabase = await createClient();
  const { data: signInData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !signInData.user) {
    return { error: texts.auth.invalidCredentials };
  }

  const projectId = await getProjectId();
  if (!projectId) {
    await supabase.auth.signOut();
    return { error: texts.auth.noProjectAccess };
  }

  const { data: membership } = await supabase
    .from('project_members')
    .select('role_id')
    .eq('project_id', projectId)
    .eq('user_id', signInData.user.id)
    .maybeSingle();

  if (!membership) {
    await supabase.auth.signOut();
    return { error: texts.auth.noProjectAccess };
  }

  return { redirectTo: '/hub' };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

/** Passwort-Reset anfordern (Antwort verrät nicht, ob das Konto existiert). */
export async function requestPasswordReset(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) {
    return { error: texts.auth.resetSent, success: undefined };
  }

  const origin = await getRequestOrigin();
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/passwort-neu`,
  });

  return { success: texts.auth.resetSent };
}

/** Neues Passwort setzen (Session stammt aus dem Recovery-Link). */
export async function updatePassword(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get('password') ?? '');
  const passwordRepeat = String(formData.get('passwordRepeat') ?? '');

  if (password.length < 8) {
    return { error: texts.auth.passwordTooShort };
  }
  if (password !== passwordRepeat) {
    return { error: texts.auth.passwordMismatch };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: texts.auth.linkInvalid };
  }

  return { redirectTo: '/hub' };
}

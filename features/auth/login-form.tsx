'use client';

import Link from 'next/link';
import { useActionState, useEffect } from 'react';
import { signIn, type AuthFormState } from '@/features/auth/actions';
import { texts } from '@/lib/texts';

const initialState: AuthFormState = {};

/**
 * Login-Formular (Landing-Karte und /login).
 *
 * Navigation NIE innerhalb des Action-Aufrufs (unterbricht die Verarbeitung
 * der Action-Response → «Application error»-Blitzer, siehe CLAUDE.md).
 * Stattdessen navigiert ein useEffect nach dem Commit. Damit der Effekt
 * sicher läuft, bleibt diese Komponente auch im eingeloggten Zustand
 * gemountet (sie rendert dann den Link statt des Formulars).
 */
export function LoginForm({
  isLoggedIn = false,
  initialError,
}: {
  isLoggedIn?: boolean;
  initialError?: string;
}) {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const error = state.error ?? initialError;

  useEffect(() => {
    if (state.redirectTo) window.location.assign(state.redirectTo);
  }, [state.redirectTo]);

  // Nach erfolgreichem Login (Navigation läuft) oder bei bereits
  // angemeldetem Benutzer: Link statt Formular – gleiche Komponente,
  // kein Unmount.
  if (state.redirectTo || isLoggedIn) {
    return (
      <div className="flex flex-col gap-3">
        <Link
          href="/hub"
          className="display-title block w-full bg-accent px-4 py-3 text-center text-[15px] font-medium tracking-[0.18em] text-white transition-opacity hover:opacity-90"
        >
          {texts.landing.toHub}
        </Link>
        {state.redirectTo && (
          <p className="text-xs text-primary">{texts.landing.loginPending}</p>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-[0.08em] text-primary">
          {texts.landing.loginEmail}
        </span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="border border-line bg-bg px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-[0.08em] text-primary">
          {texts.landing.loginPassword}
        </span>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className="border border-line bg-bg px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
        />
      </label>
      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="display-title mt-1 bg-accent px-4 py-3 text-[15px] font-medium tracking-[0.18em] text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? texts.landing.loginPending : texts.landing.loginButton}
      </button>
      <Link
        href="/passwort-vergessen"
        className="text-center text-xs text-primary underline-offset-2 hover:text-primary-dark hover:underline"
      >
        {texts.landing.forgotPassword}
      </Link>
    </form>
  );
}

'use client';

import Link from 'next/link';
import { useActionState, useEffect } from 'react';
import { signInAdmin } from '@/features/admin/actions';
import type { AuthFormState } from '@/features/auth/actions';
import { texts } from '@/lib/texts';

const initialState: AuthFormState = {};

/**
 * Admin-Login. Navigation nach dem Commit via useEffect – nie im
 * Action-Aufruf (siehe CLAUDE.md-Stolperfalle). Eingeloggt rendert die
 * Komponente den Link zur Projektliste statt des Formulars (kein Unmount,
 * kein serverseitiger Redirect-Race auf der Login-Seite).
 */
export function AdminLoginForm({
  isLoggedIn = false,
}: {
  isLoggedIn?: boolean;
}) {
  const [state, formAction, pending] = useActionState(signInAdmin, initialState);

  useEffect(() => {
    if (state.redirectTo) window.location.assign(state.redirectTo);
  }, [state.redirectTo]);

  if (state.redirectTo || isLoggedIn) {
    return (
      <div className="flex flex-col gap-3">
        <Link
          href="/"
          className="display-title block w-full bg-accent px-4 py-2.5 text-center text-[12px] font-medium tracking-[0.14em] text-white transition-opacity hover:opacity-90"
        >
          {texts.admin.projects}
        </Link>
        {state.redirectTo && (
          <p className="text-xs text-primary">{texts.landing.loginPending}</p>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="display-title text-[10px] font-medium tracking-[0.12em] text-primary-dark">
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
      <label className="flex flex-col gap-1">
        <span className="display-title text-[10px] font-medium tracking-[0.12em] text-primary-dark">
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
      {state.error && (
        <p role="alert" className="text-xs text-error">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="display-title bg-accent px-4 py-2.5 text-[12px] font-medium tracking-[0.14em] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? texts.landing.loginPending : texts.landing.loginButton}
      </button>
    </form>
  );
}

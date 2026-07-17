'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signIn, type AuthFormState } from '@/features/auth/actions';
import { texts } from '@/lib/texts';

const initialState: AuthFormState = {};

/** Login-Formular (Landing-Karte und /login). */
export function LoginForm({ initialError }: { initialError?: string }) {
  // Navigation direkt im Action-Wrapper (nicht in useEffect): nach dem Login
  // rendert der Server die Seite neu und unmountet dieses Formular, bevor
  // Effekte laufen. Harte Navigation, damit die Tenant-Middleware neu auflöst.
  const [state, formAction, pending] = useActionState(
    async (prev: AuthFormState, formData: FormData) => {
      const result = await signIn(prev, formData);
      if (result.redirectTo) window.location.assign(result.redirectTo);
      return result;
    },
    initialState,
  );
  const error = state.error ?? initialError;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-primary-dark">
          {texts.landing.loginEmail}
        </span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-primary-dark">
          {texts.landing.loginPassword}
        </span>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className="border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
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
        className="bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-dark disabled:opacity-60"
      >
        {pending ? texts.landing.loginPending : texts.landing.loginButton}
      </button>
      <Link
        href="/passwort-vergessen"
        className="text-xs text-primary underline-offset-2 hover:text-primary-dark hover:underline"
      >
        {texts.landing.forgotPassword}
      </Link>
    </form>
  );
}

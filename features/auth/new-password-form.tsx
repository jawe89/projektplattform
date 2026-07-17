'use client';

import { useActionState, useEffect } from 'react';
import { updatePassword, type AuthFormState } from '@/features/auth/actions';
import { texts } from '@/lib/texts';

const initialState: AuthFormState = {};

export function NewPasswordForm() {
  // Navigation nach dem Commit via useEffect – nie im Action-Aufruf
  // (siehe CLAUDE.md-Stolperfalle; die Seite ersetzt dieses Formular nicht,
  // der Effekt läuft also sicher).
  const [state, formAction, pending] = useActionState(
    updatePassword,
    initialState,
  );

  useEffect(() => {
    if (state.redirectTo) window.location.assign(state.redirectTo);
  }, [state.redirectTo]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-primary-dark">
          {texts.auth.newPasswordLabel}
        </span>
        <input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-primary-dark">
          {texts.auth.newPasswordRepeatLabel}
        </span>
        <input
          type="password"
          name="passwordRepeat"
          required
          minLength={8}
          autoComplete="new-password"
          className="border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
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
        className="bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-dark disabled:opacity-60"
      >
        {pending ? texts.auth.newPasswordPending : texts.auth.newPasswordButton}
      </button>
    </form>
  );
}

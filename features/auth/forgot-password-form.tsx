'use client';

import { useActionState } from 'react';
import {
  requestPasswordReset,
  type AuthFormState,
} from '@/features/auth/actions';
import { texts } from '@/lib/texts';

const initialState: AuthFormState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  if (state.success) {
    return <p className="text-sm leading-relaxed text-ink">{state.success}</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed text-primary-dark">
        {texts.auth.resetIntro}
      </p>
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
        {pending ? texts.auth.resetPending : texts.auth.resetButton}
      </button>
    </form>
  );
}

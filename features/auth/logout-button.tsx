'use client';

import { useTransition } from 'react';
import { signOut } from '@/features/auth/actions';
import { texts } from '@/lib/texts';

/** Abmelden + harte Navigation zur Landingpage (Middleware löst neu auf). */
export function LogoutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await signOut();
          window.location.assign('/');
        })
      }
      className="border border-line bg-white px-4 py-2 text-sm text-primary-dark transition-colors hover:border-primary disabled:opacity-60"
    >
      {texts.hub.logout}
    </button>
  );
}

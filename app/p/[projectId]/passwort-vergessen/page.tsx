import Link from 'next/link';
import { ForgotPasswordForm } from '@/features/auth/forgot-password-form';
import { texts } from '@/lib/texts';

export const dynamic = 'force-dynamic';

/** Passwort-Reset anfordern. */
export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <h1 className="display-title text-3xl text-ink">
        {texts.auth.resetTitle}
      </h1>
      <div className="border border-line bg-white p-6">
        <ForgotPasswordForm />
      </div>
      <Link
        href="/login"
        className="text-xs text-primary underline-offset-2 hover:text-primary-dark hover:underline"
      >
        {texts.auth.backToLogin}
      </Link>
    </main>
  );
}

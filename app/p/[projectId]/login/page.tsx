import Link from 'next/link';
import { LoginForm } from '@/features/auth/login-form';
import { createClient } from '@/lib/supabase/server';
import { getTenantData } from '@/lib/tenant';
import { texts } from '@/lib/texts';

export const dynamic = 'force-dynamic';

/**
 * Login-Seite (Supabase Auth, E-Mail + Passwort). Kein serverseitiger
 * Redirect für eingeloggte Benutzer: Der würde auch beim Re-Render nach der
 * Login-Action feuern und mit der Client-Navigation rennen – die LoginForm
 * zeigt eingeloggt stattdessen den Hub-Link.
 */
export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { projectId } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const tenant = await getTenantData(projectId);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <div>
        {tenant && (
          <p className="display-title mb-2 text-xs tracking-[0.2em] text-primary">
            {tenant.project.name}
          </p>
        )}
        <h1 className="display-title text-3xl text-ink">
          {texts.landing.loginTitle}
        </h1>
      </div>
      <div className="border border-line bg-white p-6">
        <LoginForm
          isLoggedIn={Boolean(user)}
          initialError={error === 'auth' ? texts.auth.linkInvalid : undefined}
        />
      </div>
      <Link
        href="/"
        className="text-xs text-primary underline-offset-2 hover:text-primary-dark hover:underline"
      >
        {texts.auth.backToLanding}
      </Link>
    </main>
  );
}

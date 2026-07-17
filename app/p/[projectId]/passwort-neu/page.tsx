import { redirect } from 'next/navigation';
import { NewPasswordForm } from '@/features/auth/new-password-form';
import { createClient } from '@/lib/supabase/server';
import { texts } from '@/lib/texts';

export const dynamic = 'force-dynamic';

/** Neues Passwort setzen (nach Klick auf den Recovery-Link). */
export default async function NewPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Ohne Recovery-Session gibt es hier nichts zu tun.
  if (!user) redirect('/login?error=auth');

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <h1 className="display-title text-3xl text-ink">
        {texts.auth.newPasswordTitle}
      </h1>
      <div className="border border-line bg-white p-6">
        <NewPasswordForm />
      </div>
    </main>
  );
}

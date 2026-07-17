import { redirect } from 'next/navigation';
import { AdminLoginForm } from '@/features/admin/admin-login-form';
import { createClient } from '@/lib/supabase/server';
import { texts } from '@/lib/texts';

export const dynamic = 'force-dynamic';

/** Login des Adminbereichs (nur platform_admins kommen weiter). */
export default async function AdminLoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: adminRow } = await supabase
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (adminRow) redirect('/');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <div>
        <p className="display-title mb-2 text-xs tracking-[0.2em] text-primary">
          {texts.common.platformName}
        </p>
        <h1 className="display-title text-3xl text-ink">
          {texts.admin.loginTitle}
        </h1>
      </div>
      <div className="border border-line bg-white p-6">
        <AdminLoginForm />
      </div>
    </main>
  );
}

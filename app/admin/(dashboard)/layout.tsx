import Link from 'next/link';
import { AdminSidebar } from '@/features/admin/admin-sidebar';
import { requirePlatformAdmin } from '@/features/admin/require-admin';
import { LogoutButton } from '@/features/auth/logout-button';
import { texts } from '@/lib/texts';

export const dynamic = 'force-dynamic';

/**
 * Gerüst des Adminbereichs (Design-Referenz): dunkle Ink-Topbar mit
 * Monogramm und «Administration», darunter Sidebar (Projekte + Sektionen)
 * neben dem Inhaltsbereich. Zugriff nur für platform_admins.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, supabase } = await requirePlatformAdmin();

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .order('created_at')
    .returns<{ id: string; name: string }[]>();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 bg-ink">
        <div className="flex h-13 items-center justify-between gap-3 px-4 sm:h-14 sm:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="display-title flex h-7 w-7 shrink-0 items-center justify-center border border-white text-sm font-semibold text-white">
              {texts.common.platformName.charAt(0)}
            </span>
            <span className="display-title truncate text-[13px] font-medium tracking-[0.14em] text-white sm:text-[15px]">
              {texts.admin.headerTitle}
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-3 sm:gap-5">
            <span className="hidden text-xs text-white/60 md:block">
              {user.email}
            </span>
            <LogoutButton variant="dark" />
          </div>
        </div>
      </header>
      <div className="flex flex-1 flex-col lg:flex-row lg:items-stretch">
        <AdminSidebar projects={projects ?? []} />
        <main className="min-w-0 flex-1 px-5 py-6 sm:px-10 sm:py-8">
          <div className="w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

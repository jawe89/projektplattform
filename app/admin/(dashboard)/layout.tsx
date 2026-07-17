import Link from 'next/link';
import { requirePlatformAdmin } from '@/features/admin/require-admin';
import { LogoutButton } from '@/features/auth/logout-button';
import { texts } from '@/lib/texts';

export const dynamic = 'force-dynamic';

/** Gerüst des Adminbereichs: Zugriff nur für platform_admins. */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePlatformAdmin();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-baseline gap-3">
            <Link href="/" className="display-title text-sm text-ink">
              {texts.common.platformName}
            </Link>
            <span className="display-title text-xs text-primary">
              {texts.admin.title}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-xs text-primary underline-offset-2 hover:text-ink hover:underline"
            >
              {texts.admin.projects}
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

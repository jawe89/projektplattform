import { notFound } from 'next/navigation';
import { brandingToCssVars, googleFontsUrl } from '@/features/theming/theme';
import { getTenantData } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

/**
 * Tenant-Layout: lädt Projekt + Branding und setzt die CSS-Variablen
 * serverseitig (Theming-Grundlage gemäss CLAUDE.md).
 */
export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const tenant = await getTenantData(projectId);
  if (!tenant) notFound();

  return (
    <>
      {/* React hoistet <link> in den <head> */}
      <link rel="stylesheet" href={googleFontsUrl(tenant.branding)} />
      <div
        style={brandingToCssVars(tenant.branding)}
        className="min-h-screen bg-bg font-body text-ink"
      >
        {children}
      </div>
    </>
  );
}

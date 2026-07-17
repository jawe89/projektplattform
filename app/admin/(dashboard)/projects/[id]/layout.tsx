import { notFound } from 'next/navigation';
import { requirePlatformAdmin } from '@/features/admin/require-admin';
import { texts } from '@/lib/texts';

export const dynamic = 'force-dynamic';

/**
 * Projekt-Rahmen im Adminbereich: schmale Kontextzeile (Projekt-Nr. + Name,
 * Domain-Link, Export) – die Navigation übernimmt die Sidebar, den grossen
 * Titel der Sektionskopf der jeweiligen Seite (Design-Referenz).
 */
export default async function AdminProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requirePlatformAdmin();

  const { data: project } = await supabase
    .from('projects')
    .select('name, project_no, slug, domain')
    .eq('id', id)
    .maybeSingle();
  if (!project) notFound();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <p className="display-title min-w-0 truncate text-[11px] font-medium tracking-[0.18em] text-primary sm:text-xs sm:tracking-[0.2em]">
          {project.project_no && `${project.project_no} · `}
          {project.name}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {/* Nur die öffentliche Projekt-Domain anzeigen – keine internen
              Entwicklungs-URLs im Produktivbetrieb. */}
          {project.domain && (
            <a
              href={`https://${project.domain}`}
              target="_blank"
              rel="noreferrer"
              className="hidden border border-line bg-white px-3 py-1.5 text-xs text-primary-dark transition-colors hover:border-primary sm:block"
            >
              {project.domain} ↗
            </a>
          )}
          <a
            href={`/projects/${id}/export`}
            className="border border-line bg-white px-3 py-1.5 text-xs text-primary-dark transition-colors hover:border-primary"
          >
            {texts.admin.exportLabel}
          </a>
        </div>
      </div>
      {children}
    </div>
  );
}

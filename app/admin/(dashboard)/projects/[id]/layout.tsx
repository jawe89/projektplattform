import { notFound } from 'next/navigation';
import { ProjectTabs } from '@/features/admin/project-tabs';
import { requirePlatformAdmin } from '@/features/admin/require-admin';
import { texts } from '@/lib/texts';

export const dynamic = 'force-dynamic';

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
    .select('name, project_no, slug')
    .eq('id', id)
    .maybeSingle();
  if (!project) notFound();

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="display-title text-xs tracking-[0.2em] text-primary">
            {project.project_no}
          </p>
          <h1 className="display-title text-2xl text-ink">{project.name}</h1>
          <p className="mt-1 text-xs text-primary">
            http://{project.slug}.localhost:3000
          </p>
        </div>
        <a
          href={`/projects/${id}/export`}
          className="shrink-0 border border-line bg-white px-3 py-1.5 text-xs text-primary-dark hover:border-primary"
        >
          {texts.admin.exportLabel}
        </a>
      </div>
      <ProjectTabs projectId={id} />
      {children}
    </div>
  );
}

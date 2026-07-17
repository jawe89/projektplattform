import { notFound } from 'next/navigation';
import { DatenForm } from '@/features/admin/daten-form';
import { requirePlatformAdmin } from '@/features/admin/require-admin';
import { AdminSectionHeader } from '@/features/admin/section-header';
import { texts } from '@/lib/texts';
import type { Project, ProjectBranding } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ProjectDatenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requirePlatformAdmin();

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .maybeSingle<Project>();
  if (!project) notFound();

  const { data: branding } = await supabase
    .from('project_branding')
    .select('*')
    .eq('project_id', id)
    .maybeSingle<ProjectBranding>();

  return (
    <>
      <AdminSectionHeader
        title={texts.admin.daten.title}
        description={texts.admin.sections.daten}
      />
      <DatenForm project={project} heroPath={branding?.hero_path ?? null} />
    </>
  );
}

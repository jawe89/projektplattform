import { notFound } from 'next/navigation';
import { DatenForm } from '@/features/admin/daten-form';
import { requirePlatformAdmin } from '@/features/admin/require-admin';
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

  return <DatenForm project={project} heroPath={branding?.hero_path ?? null} />;
}

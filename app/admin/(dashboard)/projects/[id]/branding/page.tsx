import { notFound } from 'next/navigation';
import { BrandingForm } from '@/features/admin/branding-form';
import { requirePlatformAdmin } from '@/features/admin/require-admin';
import type { Project, ProjectBranding } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ProjectBrandingPage({
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
    <BrandingForm
      projectId={id}
      projectName={project.name}
      landing={project.landing ?? {}}
      branding={branding}
    />
  );
}

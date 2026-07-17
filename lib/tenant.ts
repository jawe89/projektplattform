import { createClient } from '@/lib/supabase/server';
import type { Project, ProjectBranding } from '@/lib/types';

export interface TenantData {
  project: Project;
  branding: ProjectBranding | null;
}

/**
 * Lädt Projekt und Branding für einen Tenant (öffentliche Landingpage-Daten,
 * via RLS für anon lesbar). Gibt null zurück, wenn das Projekt nicht existiert
 * oder archiviert ist.
 */
export async function getTenantData(projectId: string): Promise<TenantData | null> {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('status', 'active')
    .maybeSingle<Project>();

  if (!project) return null;

  const { data: branding } = await supabase
    .from('project_branding')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle<ProjectBranding>();

  return { project, branding };
}

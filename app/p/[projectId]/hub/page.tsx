import { redirect } from 'next/navigation';
import { HubClient } from '@/features/hub/hub-client';
import { MODULES } from '@/lib/modules';
import { publicBrandingUrl } from '@/lib/storage';
import { createClient } from '@/lib/supabase/server';
import { getTenantData } from '@/lib/tenant';
import type {
  Category,
  DocumentEntry,
  ProjectModule,
  RoleModuleAccess,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Dokumenten-Hub (M2). Geschützt: ohne Login → /login, ohne Mitgliedschaft →
 * Abmeldung. Kategorien und Dokumente kommen RLS-gefiltert (nur can_view der
 * eigenen Rolle); die Upload-Rechte werden serverseitig aus der Rollen-Matrix
 * bestimmt – das UI blendet Bearbeitungselemente nur ein, die Durchsetzung
 * liegt in den RLS-Policies.
 */
export default async function HubPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('project_members')
    .select('role_id, is_project_admin')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle<{ role_id: string; is_project_admin: boolean }>();

  if (!membership) {
    await supabase.auth.signOut();
    redirect('/login');
  }

  const tenant = await getTenantData(projectId);

  // RLS filtert auf can_view-Kategorien der eigenen Rolle
  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('project_id', projectId)
    .order('sort')
    .returns<Category[]>();

  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .eq('project_id', projectId)
    .order('sort')
    .returns<DocumentEntry[]>();

  // Upload-Rechte aus der Rollen-Matrix (Projekt-Admins: alles)
  const canUploadByCategory: Record<string, boolean> = {};
  if (membership.is_project_admin) {
    for (const category of categories ?? []) {
      canUploadByCategory[category.id] = true;
    }
  } else {
    const { data: access } = await supabase
      .from('role_category_access')
      .select('category_id, can_upload')
      .eq('role_id', membership.role_id);
    for (const row of access ?? []) {
      canUploadByCategory[row.category_id] = row.can_upload;
    }
  }

  // Module (P2-M1): aktiviert UND für die Rolle freigegeben (Admins: alle
  // aktivierten). Die Filterung ist serverseitig – das UI bekommt nur die
  // sichtbaren Module; die Modul-Route prüft zusätzlich selbst.
  const { data: projectModules } = await supabase
    .from('project_modules')
    .select('*')
    .eq('project_id', projectId)
    .eq('enabled', true)
    .returns<ProjectModule[]>();
  const enabledKeys = new Set((projectModules ?? []).map((m) => m.module_key));

  let visibleModuleKeys: Set<string>;
  if (membership.is_project_admin) {
    visibleModuleKeys = enabledKeys;
  } else {
    const { data: moduleAccess } = await supabase
      .from('role_module_access')
      .select('*')
      .eq('role_id', membership.role_id)
      .returns<RoleModuleAccess[]>();
    visibleModuleKeys = new Set(
      (moduleAccess ?? [])
        .filter((a) => a.can_view && enabledKeys.has(a.module_key))
        .map((a) => a.module_key),
    );
  }
  const visibleModules = MODULES.filter((m) => visibleModuleKeys.has(m.key));

  const branding = tenant?.branding ?? null;

  return (
    <HubClient
      projectId={projectId}
      projectName={tenant?.project.name ?? ''}
      projectNo={tenant?.project.project_no ?? null}
      managementName={branding?.management_name ?? null}
      managementLogoUrl={
        branding?.management_logo_path
          ? publicBrandingUrl(branding.management_logo_path)
          : null
      }
      heroUrl={branding?.hero_path ? publicBrandingUrl(branding.hero_path) : null}
      modules={visibleModules}
      categories={categories ?? []}
      initialDocuments={documents ?? []}
      canUploadByCategory={canUploadByCategory}
    />
  );
}

import { requirePlatformAdmin } from '@/features/admin/require-admin';
import { RollenMatrix } from '@/features/admin/rollen-matrix';
import { MODULES } from '@/lib/modules';
import type {
  Category,
  ProjectModule,
  Role,
  RoleCategoryAccess,
  RoleModuleAccess,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ProjectRollenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requirePlatformAdmin();

  const { data: roles } = await supabase
    .from('roles')
    .select('*')
    .eq('project_id', id)
    .order('name')
    .returns<Role[]>();

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('project_id', id)
    .order('sort')
    .returns<Category[]>();

  const roleIds = (roles ?? []).map((r) => r.id);
  const { data: access } = roleIds.length
    ? await supabase
        .from('role_category_access')
        .select('*')
        .in('role_id', roleIds)
        .returns<RoleCategoryAccess[]>()
    : { data: [] as RoleCategoryAccess[] };

  // Aktivierte Module (P2-M1) → zusätzliche Matrix-Spalten
  const { data: projectModules } = await supabase
    .from('project_modules')
    .select('*')
    .eq('project_id', id)
    .eq('enabled', true)
    .returns<ProjectModule[]>();
  const enabledModules = MODULES.filter((m) =>
    (projectModules ?? []).some((pm) => pm.module_key === m.key),
  );

  const { data: moduleAccess } = roleIds.length
    ? await supabase
        .from('role_module_access')
        .select('*')
        .in('role_id', roleIds)
        .returns<RoleModuleAccess[]>()
    : { data: [] as RoleModuleAccess[] };

  return (
    <RollenMatrix
      projectId={id}
      roles={roles ?? []}
      categories={categories ?? []}
      access={access ?? []}
      modules={enabledModules}
      moduleAccess={moduleAccess ?? []}
    />
  );
}

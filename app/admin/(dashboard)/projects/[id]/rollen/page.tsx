import { requirePlatformAdmin } from '@/features/admin/require-admin';
import { RollenMatrix } from '@/features/admin/rollen-matrix';
import type { Category, Role, RoleCategoryAccess } from '@/lib/types';

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

  return (
    <RollenMatrix
      projectId={id}
      roles={roles ?? []}
      categories={categories ?? []}
      access={access ?? []}
    />
  );
}

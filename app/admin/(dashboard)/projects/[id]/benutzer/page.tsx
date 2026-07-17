import {
  BenutzerVerwaltung,
  type MemberRow,
} from '@/features/admin/benutzer-verwaltung';
import { requirePlatformAdmin } from '@/features/admin/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Role } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ProjectBenutzerPage({
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

  const { data: memberships } = await supabase
    .from('project_members')
    .select('user_id, is_project_admin, roles(name)')
    .eq('project_id', id)
    .returns<
      { user_id: string; is_project_admin: boolean; roles: { name: string } | null }[]
    >();

  // E-Mail-Adressen nur serverseitig über die Service-Role auflösen
  // (Zugriff ist oben bereits auf platform_admins beschränkt).
  const admin = createAdminClient();
  const { data: userList } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const emailById = new Map(
    (userList?.users ?? []).map((u) => [u.id, u.email ?? '']),
  );

  const members: MemberRow[] = (memberships ?? []).map((m) => ({
    userId: m.user_id,
    email: emailById.get(m.user_id) ?? m.user_id,
    roleName: m.roles?.name ?? '',
    isProjectAdmin: m.is_project_admin,
  }));

  return (
    <BenutzerVerwaltung projectId={id} roles={roles ?? []} members={members} />
  );
}

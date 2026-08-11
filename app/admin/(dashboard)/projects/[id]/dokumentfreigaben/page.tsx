import { requirePlatformAdmin } from '@/features/admin/require-admin';
import { DokumentfreigabenMatrix } from '@/features/admin/dokumentfreigaben-matrix';
import { AdminSectionHeader } from '@/features/admin/section-header';
import { texts } from '@/lib/texts';
import type {
  Category,
  DocumentEntry,
  DocumentRoleAccess,
  Role,
  RoleCategoryAccess,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Dokumentgenaue Sicht-Freigabe (0015): pro Kategorie eine Dokument×Rollen-
 * Matrix. Zeigt nur Rollen mit Kategorie-Sichtbarkeit als Spalten – andere
 * Rollen sehen die Kategorie ohnehin nicht.
 */
export default async function ProjectDokumentfreigabenPage({
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

  const { data: documents } = await supabase
    .from('documents')
    .select('id, category_id, parent_id, data, sort')
    .eq('project_id', id)
    .order('sort')
    .returns<
      Pick<DocumentEntry, 'id' | 'category_id' | 'parent_id' | 'data' | 'sort'>[]
    >();

  const roleIds = (roles ?? []).map((r) => r.id);
  const { data: access } = roleIds.length
    ? await supabase
        .from('role_category_access')
        .select('*')
        .in('role_id', roleIds)
        .returns<RoleCategoryAccess[]>()
    : { data: [] as RoleCategoryAccess[] };

  const docIds = (documents ?? []).map((d) => d.id);
  const { data: docAccess } = docIds.length
    ? await supabase
        .from('document_role_access')
        .select('*')
        .in('document_id', docIds)
        .returns<DocumentRoleAccess[]>()
    : { data: [] as DocumentRoleAccess[] };

  return (
    <>
      <AdminSectionHeader
        title={texts.admin.dokumentfreigaben.title}
        description={texts.admin.sections.dokumentfreigaben}
      />
      <DokumentfreigabenMatrix
        roles={roles ?? []}
        categories={categories ?? []}
        documents={documents ?? []}
        categoryAccess={access ?? []}
        documentAccess={docAccess ?? []}
      />
    </>
  );
}

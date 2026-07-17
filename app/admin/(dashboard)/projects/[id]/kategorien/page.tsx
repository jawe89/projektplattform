import { KategorienEditor } from '@/features/admin/kategorien-editor';
import { requirePlatformAdmin } from '@/features/admin/require-admin';
import type { Category } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ProjectKategorienPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requirePlatformAdmin();

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('project_id', id)
    .order('sort')
    .returns<Category[]>();

  return <KategorienEditor projectId={id} categories={categories ?? []} />;
}

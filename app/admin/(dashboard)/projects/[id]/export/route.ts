import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * JSON-Export pro Projekt (Backup): Projektdaten, Branding, Kategorien,
 * Rollen, Sichtbarkeits-Matrix und Dokumente-Metadaten.
 * Nur platform_admins; keine Benutzerdaten (PII) im Export.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  }
  const { data: adminRow } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!adminRow) {
    return NextResponse.json({ error: 'Kein Zugriff.' }, { status: 403 });
  }

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: 'Nicht gefunden.' }, { status: 404 });
  }

  const [{ data: branding }, { data: categories }, { data: roles }, { data: documents }] =
    await Promise.all([
      supabase.from('project_branding').select('*').eq('project_id', id).maybeSingle(),
      supabase.from('categories').select('*').eq('project_id', id).order('sort'),
      supabase.from('roles').select('*').eq('project_id', id).order('name'),
      supabase
        .from('documents')
        .select('id, category_id, parent_id, data, file_path, external_url, sort, created_at, updated_at')
        .eq('project_id', id)
        .order('sort'),
    ]);

  const roleIds = (roles ?? []).map((r) => r.id);
  const { data: access } = roleIds.length
    ? await supabase.from('role_category_access').select('*').in('role_id', roleIds)
    : { data: [] };

  const payload = {
    exportedAt: new Date().toISOString(),
    project,
    branding,
    categories,
    roles,
    roleCategoryAccess: access,
    documents,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="projekt-${project.slug}-export.json"`,
    },
  });
}

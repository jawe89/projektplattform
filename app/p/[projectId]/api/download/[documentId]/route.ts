import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SIGNED_URL_TTL_SECONDS = 3600; // 1 h gemäss Spezifikation

/**
 * Dateiauslieferung über signierte URLs (1 h). Doppelte serverseitige Prüfung:
 * 1. Das Dokument muss via RLS lesbar sein (can_view der Kategorie) –
 *    unsichtbare Dokumente sind schlicht «nicht gefunden».
 * 2. Die Signierung läuft mit dem User-Token – die Storage-Policies
 *    (can_view auf dem Pfad {project_id}/{category_key}/…) greifen erneut.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> },
) {
  const { projectId, documentId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  }

  const { data: doc } = await supabase
    .from('documents')
    .select('file_path, external_url')
    .eq('id', documentId)
    .eq('project_id', projectId)
    .maybeSingle<{ file_path: string | null; external_url: string | null }>();

  if (!doc) {
    return NextResponse.json({ error: 'Nicht gefunden.' }, { status: 404 });
  }

  if (doc.external_url) {
    return NextResponse.redirect(doc.external_url);
  }
  if (!doc.file_path) {
    return NextResponse.json({ error: 'Keine Datei hinterlegt.' }, { status: 404 });
  }

  const { data: signed, error } = await supabase.storage
    .from('project-files')
    .createSignedUrl(doc.file_path, SIGNED_URL_TTL_SECONDS);

  if (error || !signed) {
    return NextResponse.json({ error: 'Kein Zugriff.' }, { status: 403 });
  }

  return NextResponse.redirect(signed.signedUrl);
}

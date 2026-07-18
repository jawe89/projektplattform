import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SIGNED_URL_TTL_SECONDS = 3600; // 1 h gemäss Spezifikation

/**
 * Signierte Auslieferung von Modul-Dateien (Dokumente + Berichte).
 * Doppelte Prüfung wie die Hub-Download-Route: Pfad muss zum Projekt und
 * Modul gehören; die Signierung läuft mit dem User-Token, sodass die
 * Storage-Policies (can_view_module) erneut greifen.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  }

  const path = request.nextUrl.searchParams.get('path');
  if (!path || !path.startsWith(`${projectId}/offertenvergleich/`)) {
    return NextResponse.json({ error: 'Ungültiger Pfad.' }, { status: 400 });
  }

  const { data: signed, error } = await supabase.storage
    .from('project-files')
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !signed) {
    return NextResponse.json({ error: 'Kein Zugriff.' }, { status: 403 });
  }

  return NextResponse.redirect(signed.signedUrl);
}

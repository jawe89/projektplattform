import { waitUntil } from '@vercel/functions';
import { NextRequest, NextResponse } from 'next/server';
import { runVollstaendigkeitJob } from '@/features/offertenvergleich/vollstaendigkeit';
import { createClient } from '@/lib/supabase/server';

/**
 * Vollständigkeitsprüfung starten (O-M2): legt einen ov_jobs-Eintrag an
 * (RLS erzwingt die Modul-Bearbeitungsrechte) und verarbeitet über waitUntil
 * im Hintergrund. Endet der Job mit stufe 'fortsetzung' (Zeitbudget),
 * startet der Client automatisch den Folge-Job – die Extraktion setzt beim
 * letzten fertigen Chunk auf.
 */
export const maxDuration = 300; // Vercel Pro – KI-Extraktion grosser Scans

export async function POST(
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

  const body = (await request.json().catch(() => null)) as {
    vergabeId?: string;
  } | null;
  if (!body?.vergabeId) {
    return NextResponse.json({ error: 'vergabeId fehlt.' }, { status: 400 });
  }

  const { data: job, error } = await supabase
    .from('ov_jobs')
    .insert({
      project_id: projectId,
      vergabe_id: body.vergabeId,
      typ: 'vollstaendigkeit',
      status: 'queued',
      heartbeat_at: new Date().toISOString(),
    })
    .select('id')
    .single<{ id: string }>();
  if (error || !job) {
    // RLS-Verweigerung (keine Bearbeitungsrechte) landet hier
    return NextResponse.json({ error: 'Kein Zugriff.' }, { status: 403 });
  }

  const work = runVollstaendigkeitJob(supabase, {
    projectId,
    vergabeId: body.vergabeId,
    jobId: job.id,
  });
  try {
    waitUntil(work);
  } catch {
    // Lokale Entwicklung ohne Vercel-Kontext: lose weiterlaufen lassen
    void work;
  }

  return NextResponse.json({ jobId: job.id });
}

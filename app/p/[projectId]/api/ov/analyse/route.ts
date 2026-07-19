import { waitUntil } from '@vercel/functions';
import { NextRequest, NextResponse } from 'next/server';
import { runAnalyseJob } from '@/features/offertenvergleich/analyse';
import { createClient } from '@/lib/supabase/server';

/**
 * Analyse starten (O-M1): legt einen ov_jobs-Eintrag an (RLS erzwingt die
 * Modul-Bearbeitungsrechte) und verarbeitet über waitUntil im Hintergrund –
 * der Client pollt GET /api/ov/jobs/[jobId] (Job-Muster aus O-M0 (c)).
 */
export const maxDuration = 300; // Vercel Pro – lange Analysen (KI-Stufe)

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
    quelle?: 'positionenvergleich' | 'offerten';
  } | null;
  if (!body?.vergabeId) {
    return NextResponse.json({ error: 'vergabeId fehlt.' }, { status: 400 });
  }
  const quelle =
    body.quelle === 'offerten' ? 'offerten' : 'positionenvergleich';

  const { data: job, error } = await supabase
    .from('ov_jobs')
    .insert({
      project_id: projectId,
      vergabe_id: body.vergabeId,
      typ: 'analyse',
      status: 'queued',
      heartbeat_at: new Date().toISOString(),
    })
    .select('id')
    .single<{ id: string }>();
  if (error || !job) {
    // RLS-Verweigerung (keine Bearbeitungsrechte) landet hier
    return NextResponse.json({ error: 'Kein Zugriff.' }, { status: 403 });
  }

  const work = runAnalyseJob(
    supabase,
    { projectId, vergabeId: body.vergabeId, jobId: job.id },
    quelle,
  );
  try {
    waitUntil(work);
  } catch {
    // Lokale Entwicklung ohne Vercel-Kontext: lose weiterlaufen lassen
    void work;
  }

  return NextResponse.json({ jobId: job.id });
}

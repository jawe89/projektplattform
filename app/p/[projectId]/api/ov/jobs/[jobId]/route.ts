import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { OvJobRow } from '@/lib/types';

/**
 * Job-Polling (O-M0 (c)). Watchdog: läuft ein Job ohne Heartbeat länger
 * als 2 Minuten weiter, wird er als Zeitüberschreitung markiert – Retry
 * ist gefahrlos (Analysen sind idempotent).
 */
const HEARTBEAT_TIMEOUT_MS = 2 * 60 * 1000;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; jobId: string }> },
) {
  const { jobId } = await params;
  const supabase = await createClient();

  const { data: job } = await supabase
    .from('ov_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle<OvJobRow>();
  if (!job) {
    return NextResponse.json({ error: 'Nicht gefunden.' }, { status: 404 });
  }

  if (
    (job.status === 'running' || job.status === 'queued') &&
    job.heartbeat_at &&
    Date.now() - new Date(job.heartbeat_at).getTime() > HEARTBEAT_TIMEOUT_MS
  ) {
    const { data: updated } = await supabase
      .from('ov_jobs')
      .update({
        status: 'error',
        fehler: 'Zeitüberschreitung – bitte erneut versuchen.',
        finished_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .select('*')
      .maybeSingle<OvJobRow>();
    return NextResponse.json(updated ?? job);
  }

  return NextResponse.json(job);
}

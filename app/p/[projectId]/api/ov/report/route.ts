import { NextRequest, NextResponse } from 'next/server';
import { buildReportForVergabe } from '@/features/offertenvergleich/report/build-report';
import { createClient } from '@/lib/supabase/server';

/**
 * PDF-Report erzeugen (synchron – reines Rendern ohne KI-Aufruf).
 * Bearbeitungsrechte werden über die RLS des Auswertungs-Updates und die
 * Storage-Policies erzwungen (Schreiben nur mit can_edit_module).
 */
export const maxDuration = 60;

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

  try {
    const result = await buildReportForVergabe(supabase, {
      projectId,
      vergabeId: body.vergabeId,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Bericht fehlgeschlagen.' },
      { status: 400 },
    );
  }
}

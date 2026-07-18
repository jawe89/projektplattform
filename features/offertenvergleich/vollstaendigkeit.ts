/**
 * Vollständigkeits-Job (O-M2, Konzept Prüfmodul 1 / Schritt 4a):
 * KI-Extraktion der Ausschreibungs-/Offerten-Positionslisten (chunk-weise,
 * wiederaufnehmbar) → deterministischer Abgleich gegen die Referenzliste
 * (Ausschreibung, sonst Positionenvergleich) → ov_abweichungen mit
 * Bewertungsschleife.
 *
 * Zeitbudget: Läuft die Extraktion an das maxDuration-Limit (300 s, Vercel
 * Pro), beendet sich der Job mit stufe 'fortsetzung'; der Client startet
 * automatisch einen Folge-Job, der beim letzten fertigen Chunk aufsetzt
 * (Fortschritt in ov_dokumente.parse_fortschritt, O-M0 (c) Punkt 4).
 *
 * Idempotenz: Abweichungen werden über (dokument_id, typ, npk) gemergt –
 * die manuelle Bewertung (kritisch/tolerierbar/ignoriert) und Notizen
 * überleben eine erneute Prüfung.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CHUNK_PAGES,
  extractChunk,
  splitPdfChunks,
} from '@/features/offertenvergleich/extract';
import {
  matchOfferte,
  type OvMatchOffertePosition,
  type OvMatchReferenzPosition,
} from '@/lib/ov-match';
import type {
  OvAbweichungRow,
  OvBieterRow,
  OvDokPositionRow,
  OvDokument,
  OvParseFortschritt,
  OvPositionRow,
  OvVergabe,
} from '@/lib/types';

export interface VollstaendigkeitJobContext {
  projectId: string;
  vergabeId: string;
  jobId: string;
}

/** Kein neuer Chunk mehr, wenn dafür voraussichtlich keine Zeit bleibt */
const MAX_LAUFZEIT_MS = 280_000;
/** Startannahme für die Dauer eines Extraktions-Chunks */
const CHUNK_DAUER_ANNAHME_MS = 90_000;
/** Heartbeat-Intervall während langer Extraktions-Aufrufe */
const HEARTBEAT_INTERVAL_MS = 45_000;
const MAX_HINWEISE = 50;

async function setStufe(
  supabase: SupabaseClient,
  jobId: string,
  stufe: string,
): Promise<void> {
  await supabase
    .from('ov_jobs')
    .update({ stufe, status: 'running', heartbeat_at: new Date().toISOString() })
    .eq('id', jobId);
}

async function failJob(
  supabase: SupabaseClient,
  jobId: string,
  fehler: string,
): Promise<void> {
  await supabase
    .from('ov_jobs')
    .update({ status: 'error', fehler, finished_at: new Date().toISOString() })
    .eq('id', jobId);
}

async function finishJob(
  supabase: SupabaseClient,
  jobId: string,
  stufe: 'fertig' | 'fortsetzung',
): Promise<void> {
  await supabase
    .from('ov_jobs')
    .update({
      status: 'done',
      stufe,
      finished_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

export async function runVollstaendigkeitJob(
  supabase: SupabaseClient,
  { projectId, vergabeId, jobId }: VollstaendigkeitJobContext,
): Promise<void> {
  const start = Date.now();
  // Heartbeat auch während eines langen Einzel-Aufrufs (Scan-Chunks können
  // > 2 min dauern – der Polling-Watchdog würde den Job sonst abschreiben)
  const heartbeat = setInterval(() => {
    void supabase
      .from('ov_jobs')
      .update({ heartbeat_at: new Date().toISOString() })
      .eq('id', jobId);
  }, HEARTBEAT_INTERVAL_MS);

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      await failJob(
        supabase,
        jobId,
        'ANTHROPIC_API_KEY ist nicht konfiguriert – die Vollständigkeitsprüfung liest die Dokumente über die KI.',
      );
      return;
    }

    const [{ data: vergabe }, { data: dokumente }, { data: bieter }] =
      await Promise.all([
        supabase
          .from('ov_vergaben')
          .select('*')
          .eq('id', vergabeId)
          .maybeSingle<OvVergabe>(),
        supabase
          .from('ov_dokumente')
          .select('*')
          .eq('vergabe_id', vergabeId)
          .in('art', ['ausschreibung', 'offerte'])
          .order('created_at', { ascending: true })
          .returns<OvDokument[]>(),
        supabase
          .from('ov_bieter')
          .select('*')
          .eq('vergabe_id', vergabeId)
          .returns<OvBieterRow[]>(),
      ]);
    if (!vergabe) {
      await failJob(supabase, jobId, 'Vergabe nicht gefunden.');
      return;
    }
    const offerten = (dokumente ?? []).filter((d) => d.art === 'offerte');
    // Bei mehreren Ausschreibungs-Uploads gilt der jüngste
    const ausschreibung =
      (dokumente ?? []).filter((d) => d.art === 'ausschreibung').at(-1) ?? null;
    if (offerten.length === 0) {
      await failJob(
        supabase,
        jobId,
        'Keine Offerten hochgeladen – die Vollständigkeitsprüfung vergleicht Offerten gegen die Referenzliste.',
      );
      return;
    }
    const bieterName = new Map((bieter ?? []).map((b) => [b.id, b.name]));

    // --- Stufe 1: Extraktion (chunk-weise, mit Zeitbudget) ---
    await setStufe(supabase, jobId, 'extraktion');
    let chunkDauerMax = CHUNK_DAUER_ANNAHME_MS;
    const zuLesen = [...(ausschreibung ? [ausschreibung] : []), ...offerten];
    for (const dokument of zuLesen) {
      const fortschritt: OvParseFortschritt = {
        ...(dokument.parse_fortschritt ?? {}),
      };
      // Fortschritt ungültig, wenn sich die Fenstergrösse geändert hat
      if (
        fortschritt.seitenProChunk !== undefined &&
        fortschritt.seitenProChunk !== CHUNK_PAGES
      ) {
        await supabase
          .from('ov_dok_positionen')
          .delete()
          .eq('dokument_id', dokument.id);
        fortschritt.chunksTotal = undefined;
        fortschritt.chunksDone = [];
        fortschritt.hinweise = [];
      }
      const done = new Set(fortschritt.chunksDone ?? []);
      if (
        fortschritt.chunksTotal !== undefined &&
        done.size >= fortschritt.chunksTotal
      ) {
        continue; // Dokument bereits vollständig gelesen
      }

      const { data: blob, error: downloadError } = await supabase.storage
        .from('project-files')
        .download(dokument.file_path);
      if (downloadError || !blob) {
        throw new Error(
          `Download «${dokument.original_name}» fehlgeschlagen: ${downloadError?.message}`,
        );
      }
      const chunks = await splitPdfChunks(
        new Uint8Array(await blob.arrayBuffer()),
      );
      fortschritt.chunksTotal = chunks.length;
      fortschritt.seitenProChunk = CHUNK_PAGES;
      fortschritt.chunksDone = [...done];
      fortschritt.hinweise = fortschritt.hinweise ?? [];

      for (let i = 0; i < chunks.length; i++) {
        if (done.has(i)) continue;
        if (Date.now() - start + chunkDauerMax * 1.5 > MAX_LAUFZEIT_MS) {
          await finishJob(supabase, jobId, 'fortsetzung');
          return;
        }
        const t0 = Date.now();
        const result = await extractChunk(chunks[i].bytes, {
          art: dokument.art,
          bkp: vergabe.bkp,
          titel: vergabe.titel,
          bieterName: dokument.bieter_id
            ? (bieterName.get(dokument.bieter_id) ?? null)
            : null,
        });
        chunkDauerMax = Math.max(chunkDauerMax, Date.now() - t0);

        // Innerhalb des Chunks deduplizieren; über Chunks gewinnt der erste
        const seen = new Set<string>();
        const rows = result.positionen
          .filter((p) => {
            if (seen.has(p.npk)) return false;
            seen.add(p.npk);
            return true;
          })
          .map((p) => ({
            project_id: projectId,
            vergabe_id: vergabeId,
            dokument_id: dokument.id,
            npk: p.npk,
            bezeichnung: p.bezeichnung,
            menge: p.menge,
            einheit: p.einheit,
            betrag_rp: p.betragRp,
            produkt: p.produkt,
            bemerkung: p.bemerkung,
            chunk: i,
          }));
        if (rows.length > 0) {
          const { error } = await supabase
            .from('ov_dok_positionen')
            .upsert(rows, {
              onConflict: 'dokument_id,npk',
              ignoreDuplicates: true,
            });
          if (error) throw error;
        }

        done.add(i);
        fortschritt.chunksDone = [...done].sort((a, b) => a - b);
        fortschritt.hinweise = [
          ...fortschritt.hinweise,
          ...result.hinweise.map(
            (h) => `S. ${chunks[i].von}–${chunks[i].bis}: ${h}`,
          ),
        ].slice(0, MAX_HINWEISE);
        await supabase
          .from('ov_dokumente')
          .update({ parse_fortschritt: fortschritt })
          .eq('id', dokument.id);
        await setStufe(supabase, jobId, 'extraktion');
      }

      await supabase
        .from('ov_dokumente')
        .update({
          parse_status: 'geparst',
          parse_fehler: null,
          seiten: chunks.at(-1)?.bis ?? null,
          parse_fortschritt: fortschritt,
        })
        .eq('id', dokument.id);
    }

    // --- Stufe 2: Abgleich gegen die Referenzliste ---
    await setStufe(supabase, jobId, 'abgleich');

    let referenz: OvMatchReferenzPosition[];
    if (ausschreibung) {
      const { data } = await supabase
        .from('ov_dok_positionen')
        .select('*')
        .eq('dokument_id', ausschreibung.id)
        .returns<OvDokPositionRow[]>();
      referenz = (data ?? []).map((p) => ({
        npk: p.npk,
        bezeichnung: p.bezeichnung ?? p.npk,
        menge: p.menge === null ? null : Number(p.menge),
        einheit: p.einheit,
        produkt: p.produkt,
        bemerkung: p.bemerkung,
      }));
    } else {
      const { data } = await supabase
        .from('ov_positionen')
        .select('*')
        .eq('vergabe_id', vergabeId)
        .returns<OvPositionRow[]>();
      referenz = (data ?? []).map((p) => ({
        npk: p.npk,
        bezeichnung: p.bezeichnung,
        menge: p.menge === null ? null : Number(p.menge),
        einheit: p.einheit,
      }));
    }
    if (referenz.length === 0) {
      await failJob(
        supabase,
        jobId,
        'Keine Referenzliste vorhanden: zuerst die Analyse des Positionenvergleichs ausführen oder eine Ausschreibung hochladen.',
      );
      return;
    }

    // Preis-Stichprobe (Selbstprüfung): extrahierte Beträge gegen die Matrix
    const { data: matrixPositionen } = await supabase
      .from('ov_positionen')
      .select('id,npk')
      .eq('vergabe_id', vergabeId)
      .returns<{ id: string; npk: string }[]>();
    const positionIdByNpk = new Map(
      (matrixPositionen ?? []).map((p) => [p.npk, p.id]),
    );

    for (const dokument of offerten) {
      const { data } = await supabase
        .from('ov_dok_positionen')
        .select('*')
        .eq('dokument_id', dokument.id)
        .returns<OvDokPositionRow[]>();
      const offerte: OvMatchOffertePosition[] = (data ?? []).map((p) => ({
        npk: p.npk,
        bezeichnung: p.bezeichnung,
        menge: p.menge === null ? null : Number(p.menge),
        einheit: p.einheit,
        produkt: p.produkt,
        bemerkung: p.bemerkung,
      }));
      const abweichungen = matchOfferte(referenz, offerte);

      // Merge (Bewertungen bleiben erhalten), Stale-Einträge entfernen
      const { data: existing } = await supabase
        .from('ov_abweichungen')
        .select('*')
        .eq('dokument_id', dokument.id)
        .returns<OvAbweichungRow[]>();
      const existingByKey = new Map(
        (existing ?? []).map((a) => [`${a.typ}:${a.npk}`, a]),
      );
      const currentKeys = new Set<string>();
      for (const a of abweichungen) {
        const key = `${a.typ}:${a.npk}`;
        currentKeys.add(key);
        const details = {
          ...(a.erwartet !== undefined ? { erwartet: a.erwartet } : {}),
          ...(a.gefunden !== undefined ? { gefunden: a.gefunden } : {}),
        };
        const found = existingByKey.get(key);
        if (found) {
          await supabase
            .from('ov_abweichungen')
            .update({ titel: a.titel, details, bieter_id: dokument.bieter_id })
            .eq('id', found.id);
        } else {
          const { error } = await supabase.from('ov_abweichungen').insert({
            project_id: projectId,
            vergabe_id: vergabeId,
            dokument_id: dokument.id,
            bieter_id: dokument.bieter_id,
            typ: a.typ,
            npk: a.npk,
            titel: a.titel,
            details,
          });
          if (error) throw error;
        }
      }
      const stale = (existing ?? []).filter(
        (a) => !currentKeys.has(`${a.typ}:${a.npk}`),
      );
      if (stale.length > 0) {
        await supabase
          .from('ov_abweichungen')
          .delete()
          .in('id', stale.map((a) => a.id));
      }

      // Stichprobe nur für Offerten mit zugeordnetem Bieter
      if (dokument.bieter_id) {
        const mitBetrag = (data ?? []).filter(
          (p) => p.betrag_rp !== null && positionIdByNpk.has(p.npk),
        );
        let abweichend = 0;
        if (mitBetrag.length > 0) {
          const { data: angebote } = await supabase
            .from('ov_angebote')
            .select('position_id,betrag_rp')
            .eq('bieter_id', dokument.bieter_id)
            .in('position_id', mitBetrag.map((p) => positionIdByNpk.get(p.npk)!))
            .returns<{ position_id: string; betrag_rp: number | null }[]>();
          const matrixByPosition = new Map(
            (angebote ?? []).map((a) => [a.position_id, a.betrag_rp]),
          );
          for (const p of mitBetrag) {
            const matrixWert = matrixByPosition.get(
              positionIdByNpk.get(p.npk)!,
            );
            if (
              matrixWert !== undefined &&
              matrixWert !== null &&
              Math.abs(Number(p.betrag_rp) - matrixWert) > 1
            ) {
              abweichend++;
            }
          }
        }
        // Frisch lesen – parse_fortschritt wurde in der Extraktionsstufe
        // aktualisiert, das geladene dokument-Objekt ist veraltet
        const { data: aktuell } = await supabase
          .from('ov_dokumente')
          .select('parse_fortschritt')
          .eq('id', dokument.id)
          .maybeSingle<{ parse_fortschritt: OvParseFortschritt }>();
        const fortschritt: OvParseFortschritt = {
          ...(aktuell?.parse_fortschritt ?? {}),
          stichprobe: { verglichen: mitBetrag.length, abweichend },
        };
        await supabase
          .from('ov_dokumente')
          .update({ parse_fortschritt: fortschritt })
          .eq('id', dokument.id);
      }
    }

    await supabase
      .from('ov_vergaben')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', vergabeId);
    await finishJob(supabase, jobId, 'fertig');
  } catch (err) {
    await failJob(
      supabase,
      jobId,
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    clearInterval(heartbeat);
  }
}

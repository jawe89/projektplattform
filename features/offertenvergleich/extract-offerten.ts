/**
 * Gemeinsame Offerten-/Ausschreibungs-Extraktion (O-M2 und O-M3-Preisquelle).
 *
 * Kapselt die chunk-weise KI-Extraktion in ov_dok_positionen inkl.
 * Wiederaufnahme (parse_fortschritt) und Zeitbudget, damit sowohl die
 * Vollständigkeitsprüfung (vollstaendigkeit.ts) als auch die zweite
 * Preisquelle (analyse.ts, Preise aus Offerten) denselben Weg nutzen.
 *
 * baueOffertenMatrix() baut aus den extrahierten Offerten-Positionen die
 * Preismatrix (werteRp je Bieter) – die Alternative zum BauPlus-Vergleich,
 * wenn dieser preislos ist (Offerten ausserhalb BauPlus ausgefüllt).
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CHUNK_PAGES,
  extractChunk,
  splitPdfChunks,
} from '@/features/offertenvergleich/extract';
import type { OvDokument, OvParseFortschritt } from '@/lib/types';

// Reine Matrix-Logik (unit-getestet) aus dem Server-Modul re-exportieren
export {
  baueOffertenMatrix,
  type OffertenMatrix,
} from '@/lib/ov-offerten-matrix';

/** Kein neuer Chunk mehr, wenn dafür voraussichtlich keine Zeit bleibt */
const MAX_LAUFZEIT_MS = 280_000;
const CHUNK_DAUER_ANNAHME_MS = 90_000;
const MAX_HINWEISE = 50;

export interface ExtraktionKontext {
  projectId: string;
  vergabeId: string;
  bkp: string;
  titel: string;
  bieterNameById: Map<string, string>;
  /** Job-Startzeit (Date.now()) für das Zeitbudget */
  startMs: number;
  /** Fortschritt/Heartbeat aktualisieren (nach jedem Chunk) */
  onProgress: () => Promise<void>;
}

/**
 * Liest die übergebenen Dokumente chunk-weise; setzt beim Zeitbudget aus
 * (fertig=false → Aufrufer beendet den Job mit stufe 'fortsetzung' und der
 * Client startet die nächste Runde). Bereits gelesene Chunks werden
 * übersprungen (parse_fortschritt).
 */
export async function extrahiereDokumente(
  supabase: SupabaseClient,
  dokumente: OvDokument[],
  ctx: ExtraktionKontext,
): Promise<{ fertig: boolean }> {
  let chunkDauerMax = CHUNK_DAUER_ANNAHME_MS;

  for (const dokument of dokumente) {
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
    const chunks = await splitPdfChunks(new Uint8Array(await blob.arrayBuffer()));
    fortschritt.chunksTotal = chunks.length;
    fortschritt.seitenProChunk = CHUNK_PAGES;
    fortschritt.chunksDone = [...done];
    fortschritt.hinweise = fortschritt.hinweise ?? [];

    for (let i = 0; i < chunks.length; i++) {
      if (done.has(i)) continue;
      if (Date.now() - ctx.startMs + chunkDauerMax * 1.5 > MAX_LAUFZEIT_MS) {
        return { fertig: false };
      }
      const t0 = Date.now();
      const result = await extractChunk(chunks[i].bytes, {
        art: dokument.art,
        bkp: ctx.bkp,
        titel: ctx.titel,
        bieterName: dokument.bieter_id
          ? (ctx.bieterNameById.get(dokument.bieter_id) ?? null)
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
          project_id: ctx.projectId,
          vergabe_id: ctx.vergabeId,
          dokument_id: dokument.id,
          npk: p.npk,
          bezeichnung: p.bezeichnung,
          menge: p.menge,
          einheit: p.einheit,
          betrag_rp: p.betragRp,
          produkt: p.produkt,
          bemerkung: p.bemerkung,
          handschriftlich: p.handschriftlich,
          chunk: i,
        }));
      if (rows.length > 0) {
        const { error } = await supabase
          .from('ov_dok_positionen')
          .upsert(rows, { onConflict: 'dokument_id,npk', ignoreDuplicates: true });
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
      await ctx.onProgress();
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

  return { fertig: true };
}

/**
 * Analyse-Job des Moduls Offertenvergleich (O-M1): Parsing → Persistierung
 * (Merge) → Statistik → KI-Erkenntnisse → Auswertungs-Snapshot.
 *
 * Läuft serverseitig im Route Handler (waitUntil, siehe O-M0 (c)); der
 * Fortschritt wird über ov_jobs (stufe/heartbeat) fürs Polling geführt.
 * Analysen sind idempotent: Bieter werden über den Namen, Positionen über
 * die NPK-Nummer gemergt – manuell erfasste Kontrollsummen und
 * «wichtig»-Entscheide bleiben bei Re-Analysen erhalten.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateInsights } from '@/features/offertenvergleich/insights';
import {
  autoWichtig,
  computeAnalyse,
  kostenblockOf,
  positionStat,
  type OvCalcPosition,
} from '@/lib/ov-calc';
import { parsePositionenvergleich } from '@/lib/ov-parse';
import type {
  OvAuswertungInhalt,
  OvBieterRow,
  OvDokument,
  OvPositionRow,
} from '@/lib/types';

export interface AnalyseJobContext {
  projectId: string;
  vergabeId: string;
  jobId: string;
}

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
    .update({
      status: 'error',
      fehler,
      finished_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

export async function runAnalyseJob(
  supabase: SupabaseClient,
  { projectId, vergabeId, jobId }: AnalyseJobContext,
): Promise<void> {
  try {
    await setStufe(supabase, jobId, 'parsing');

    // Jüngster Positionenvergleich der Vergabe
    const { data: dokument, error: dokError } = await supabase
      .from('ov_dokumente')
      .select('*')
      .eq('vergabe_id', vergabeId)
      .eq('art', 'positionenvergleich')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<OvDokument>();
    if (dokError) throw dokError;
    if (!dokument) {
      await failJob(supabase, jobId, 'Kein Positionenvergleich hochgeladen.');
      return;
    }

    const { data: blob, error: downloadError } = await supabase.storage
      .from('project-files')
      .download(dokument.file_path);
    if (downloadError || !blob) {
      throw new Error(`Download fehlgeschlagen: ${downloadError?.message}`);
    }
    const parsed = await parsePositionenvergleich(
      new Uint8Array(await blob.arrayBuffer()),
    );

    // Selbstprüfung 1 (hart): jede LV-Zeile muss dem Preismuster entsprechen
    if (parsed.unparsedLines.length > 0) {
      await supabase
        .from('ov_dokumente')
        .update({
          parse_status: 'fehler',
          parse_fehler: `${parsed.unparsedLines.length} Zeilen nicht lesbar`,
        })
        .eq('id', dokument.id);
      await failJob(
        supabase,
        jobId,
        `Parser unvollständig: ${parsed.unparsedLines.length} Preiszeilen nicht lesbar (z.B. «${parsed.unparsedLines[0].slice(0, 80)}»).`,
      );
      return;
    }
    if (parsed.bieter.length < 2) {
      await failJob(
        supabase,
        jobId,
        'Weniger als zwei Bieter im Positionenvergleich erkannt.',
      );
      return;
    }

    await setStufe(supabase, jobId, 'statistik');

    // --- Bieter mergen (Schlüssel: Name) ---
    const { data: existingBieter } = await supabase
      .from('ov_bieter')
      .select('*')
      .eq('vergabe_id', vergabeId)
      .returns<OvBieterRow[]>();
    const bieterByName = new Map(
      (existingBieter ?? []).map((b) => [b.name, b]),
    );
    const bieterIds: string[] = [];
    const kontrollsummen: (number | null)[] = [];
    for (const [sort, b] of parsed.bieter.entries()) {
      const existing = bieterByName.get(b.name);
      if (existing) {
        await supabase
          .from('ov_bieter')
          .update({ ort: b.ort, telefon: b.telefon, sort })
          .eq('id', existing.id);
        bieterIds.push(existing.id);
        kontrollsummen.push(existing.kontrollsumme_rp);
      } else {
        const { data: created, error } = await supabase
          .from('ov_bieter')
          .insert({
            project_id: projectId,
            vergabe_id: vergabeId,
            name: b.name,
            ort: b.ort,
            telefon: b.telefon,
            sort,
          })
          .select('id')
          .single<{ id: string }>();
        if (error || !created) throw error ?? new Error('Bieter-Insert leer');
        bieterIds.push(created.id);
        kontrollsummen.push(null);
      }
    }
    const parsedNames = new Set(parsed.bieter.map((b) => b.name));
    const staleBieter = (existingBieter ?? []).filter(
      (b) => !parsedNames.has(b.name),
    );
    if (staleBieter.length > 0) {
      await supabase
        .from('ov_bieter')
        .delete()
        .in('id', staleBieter.map((b) => b.id));
    }

    // --- Statistik ---
    const calcRows: OvCalcPosition[] = parsed.positionen.map((p) => ({
      npk: p.npk,
      kapitel: p.kapitel,
      gruppe: p.gruppe,
      bezeichnung: p.bezeichnung,
      menge: p.menge,
      einheit: p.einheit,
      werteRp: p.werteRp,
    }));
    const analyse = computeAnalyse(calcRows, parsed.bieter.length, kontrollsummen);
    const wichtigAuto = autoWichtig(analyse);

    // --- Positionen mergen (Schlüssel: NPK); «wichtig» bleibt erhalten ---
    const { data: existingPositionen } = await supabase
      .from('ov_positionen')
      .select('*')
      .eq('vergabe_id', vergabeId)
      .returns<OvPositionRow[]>();
    const posByNpk = new Map(
      (existingPositionen ?? []).map((p) => [p.npk, p]),
    );
    const positionIds = new Map<string, string>();
    for (const [sort, p] of parsed.positionen.entries()) {
      const kostenblock = kostenblockOf(p.kapitel, p.gruppe);
      const existing = posByNpk.get(p.npk);
      if (existing) {
        await supabase
          .from('ov_positionen')
          .update({
            bezeichnung: p.bezeichnung,
            menge: p.menge,
            einheit: p.einheit,
            kostenblock,
            sort,
          })
          .eq('id', existing.id);
        positionIds.set(p.npk, existing.id);
      } else {
        const { data: created, error } = await supabase
          .from('ov_positionen')
          .insert({
            project_id: projectId,
            vergabe_id: vergabeId,
            npk: p.npk,
            bezeichnung: p.bezeichnung,
            menge: p.menge,
            einheit: p.einheit,
            kostenblock,
            wichtig: wichtigAuto.has(p.npk),
            sort,
          })
          .select('id')
          .single<{ id: string }>();
        if (error || !created) throw error ?? new Error('Position-Insert leer');
        positionIds.set(p.npk, created.id);
      }
    }
    const parsedNpk = new Set(parsed.positionen.map((p) => p.npk));
    const stalePositionen = (existingPositionen ?? []).filter(
      (p) => !parsedNpk.has(p.npk),
    );
    if (stalePositionen.length > 0) {
      await supabase
        .from('ov_positionen')
        .delete()
        .in('id', stalePositionen.map((p) => p.id));
    }

    // --- Angebote (PK position/bieter, Flags aus der Statistik) ---
    const angebotRows = parsed.positionen.flatMap((p) => {
      const stat = positionStat({
        npk: p.npk,
        kapitel: p.kapitel,
        gruppe: p.gruppe,
        bezeichnung: p.bezeichnung,
        menge: p.menge,
        einheit: p.einheit,
        werteRp: p.werteRp,
      });
      return p.werteRp.map((wert, i) => ({
        project_id: projectId,
        position_id: positionIds.get(p.npk)!,
        bieter_id: bieterIds[i],
        betrag_rp: wert,
        is_inkl: wert === null,
        flags: stat.flags[i],
      }));
    });
    for (let i = 0; i < angebotRows.length; i += 500) {
      const { error } = await supabase
        .from('ov_angebote')
        .upsert(angebotRows.slice(i, i + 500), {
          onConflict: 'position_id,bieter_id',
        });
      if (error) throw error;
    }

    // --- KI-Erkenntnisse + Fazit ---
    await setStufe(supabase, jobId, 'ki');
    const insights = await generateInsights({
      meta: {
        projektzeile: parsed.meta.projektzeile,
        projectNo: parsed.meta.projectNo,
        bkp: parsed.meta.bkp,
        titel: parsed.meta.titel,
      },
      bieter: parsed.bieter.map((b) => ({ name: b.name, ort: b.ort })),
      analyse,
      positionen: parsed.positionen,
    });

    // --- Auswertungs-Snapshot ---
    const inhalt: OvAuswertungInhalt = {
      meta: parsed.meta,
      bieter: parsed.bieter,
      analyse,
      selbstpruefung: {
        positionCount: parsed.positionen.length,
        unparsedCount: 0,
        warnings: parsed.warnings,
        kiUebersprungen: insights.uebersprungen,
        kiZahlenOhneBeleg: insights.zahlenOhneBeleg,
      },
      erkenntnisse: insights.erkenntnisse,
      fazit: insights.fazit,
    };
    const { data: auswertung, error: auswertungError } = await supabase
      .from('ov_auswertungen')
      .insert({ project_id: projectId, vergabe_id: vergabeId, inhalt })
      .select('id')
      .single<{ id: string }>();
    if (auswertungError || !auswertung) {
      throw auswertungError ?? new Error('Auswertung-Insert leer');
    }

    await supabase
      .from('ov_dokumente')
      .update({ parse_status: 'geparst', parse_fehler: null, seiten: parsed.seiten })
      .eq('id', dokument.id);
    await supabase
      .from('ov_vergaben')
      .update({
        status: 'in_pruefung',
        stand: parsed.meta.datum,
        updated_at: new Date().toISOString(),
      })
      .eq('id', vergabeId);
    await supabase
      .from('ov_jobs')
      .update({
        status: 'done',
        stufe: 'fertig',
        auswertung_id: auswertung.id,
        finished_at: new Date().toISOString(),
      })
      .eq('id', jobId);
  } catch (err) {
    await failJob(
      supabase,
      jobId,
      err instanceof Error ? err.message : String(err),
    );
  }
}

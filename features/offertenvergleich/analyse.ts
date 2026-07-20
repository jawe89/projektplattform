/**
 * Analyse-Job des Moduls Offertenvergleich: Parsing → Persistierung (Merge)
 * → Statistik → KI-Erkenntnisse → Auswertungs-Snapshot.
 *
 * Zwei Preisquellen (O-M3):
 *  - 'positionenvergleich' (Standard): Preismatrix aus dem BauPlus-Export.
 *    Enthält der Vergleich KEINE Preise (Offerten ausserhalb BauPlus
 *    ausgefüllt), bricht der Job VOR der KI mit einer Frühwarnung ab
 *    (stufe 'keine_preise') statt einer teuren Nullanalyse.
 *  - 'offerten': Preismatrix aus der KI-Extraktion der Offerten (pdf-lib +
 *    Anthropic-Vision, auch Scans/Handschrift). Bieter kommen aus dem
 *    Vergleichskopf, Positionen und Preise aus den Offerten.
 *
 * Läuft serverseitig (waitUntil); Fortschritt über ov_jobs (stufe/heartbeat)
 * fürs Polling. Die Offerten-Extraktion ist chunk-weise wiederaufnehmbar –
 * beim Zeitbudget endet der Job mit stufe 'fortsetzung' und der Client
 * startet die nächste Runde. Analysen sind idempotent (Bieter über Name,
 * Positionen über NPK); Kontrollsummen und «wichtig»-Entscheide bleiben.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  baueOffertenMatrix,
  extrahiereDokumente,
} from '@/features/offertenvergleich/extract-offerten';
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
  OvDokPositionRow,
  OvDokument,
  OvPositionRow,
  OvPreisquelle,
} from '@/lib/types';

export interface AnalyseJobContext {
  projectId: string;
  vergabeId: string;
  jobId: string;
}

const HEARTBEAT_INTERVAL_MS = 45_000;

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
  stufe?: string,
): Promise<void> {
  await supabase
    .from('ov_jobs')
    .update({
      status: 'error',
      ...(stufe ? { stufe } : {}),
      fehler,
      finished_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

export async function runAnalyseJob(
  supabase: SupabaseClient,
  { projectId, vergabeId, jobId }: AnalyseJobContext,
  quelle: OvPreisquelle,
): Promise<void> {
  const start = Date.now();
  // Heartbeat auch während langer Extraktions-Aufrufe (Offerten-Quelle) –
  // lazy PostgREST-Builder daher NICHT per void, sondern mit .then().
  const heartbeat = setInterval(() => {
    supabase
      .from('ov_jobs')
      .update({ heartbeat_at: new Date().toISOString() })
      .eq('id', jobId)
      .then(
        () => undefined,
        () => undefined,
      );
  }, HEARTBEAT_INTERVAL_MS);

  try {
    await setStufe(supabase, jobId, 'parsing');

    // Jüngster Positionenvergleich (liefert immer Bieter + Meta; bei der
    // Offerten-Quelle die Preise aus den Offerten)
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

    // --- Bieter mergen (Schlüssel: Name); aus dem Vergleichskopf ---
    const { data: existingBieter } = await supabase
      .from('ov_bieter')
      .select('*')
      .eq('vergabe_id', vergabeId)
      .returns<OvBieterRow[]>();
    const bieterByName = new Map((existingBieter ?? []).map((b) => [b.name, b]));
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

    // Frühwarnung: preisloser Vergleich (Offerten ausserhalb BauPlus
    // ausgefüllt) → keine Nullanalyse mit KI-Kosten. Die Bieter sind hier
    // bereits angelegt (aus dem Vergleichskopf), damit die Offerten ihnen
    // zugeordnet und die Preise aus den Offerten extrahiert werden können.
    if (quelle === 'positionenvergleich' && !parsed.hatPreise) {
      await failJob(
        supabase,
        jobId,
        'Der Positionenvergleich enthält keine Preise – vermutlich wurden die Offerten ausserhalb von BauPlus ausgefüllt. Preise können stattdessen aus den Offerten extrahiert werden.',
        'keine_preise',
      );
      return;
    }

    // --- Preismatrix je nach Quelle ---
    let calcRows: OvCalcPosition[];
    let handschriftlich = new Set<string>(); // «npk bieterIndex»
    let handschriftlichCount = 0;

    if (quelle === 'offerten') {
      // Offerten chunk-weise extrahieren (wiederaufnehmbar, Zeitbudget)
      await setStufe(supabase, jobId, 'extraktion');
      const { data: offerten } = await supabase
        .from('ov_dokumente')
        .select('*')
        .eq('vergabe_id', vergabeId)
        .eq('art', 'offerte')
        .order('created_at')
        .returns<OvDokument[]>();
      const offerListe = offerten ?? [];
      if (offerListe.length === 0) {
        await failJob(
          supabase,
          jobId,
          'Keine Offerten hochgeladen – für die Preisquelle «Offerten» mindestens eine Offerte hochladen und einem Bieter zuordnen.',
        );
        return;
      }
      if (!offerListe.some((d) => d.bieter_id)) {
        await failJob(
          supabase,
          jobId,
          'Keine Offerte einem Bieter zugeordnet – bitte die Offerten oben den Bietern zuordnen.',
        );
        return;
      }
      const bieterNameById = new Map(
        parsed.bieter.map((b, i) => [bieterIds[i], b.name]),
      );
      const { fertig } = await extrahiereDokumente(supabase, offerListe, {
        projectId,
        vergabeId,
        bkp: parsed.meta.bkp,
        titel: parsed.meta.titel,
        bieterNameById,
        startMs: start,
        onProgress: () => setStufe(supabase, jobId, 'extraktion'),
      });
      if (!fertig) {
        await supabase
          .from('ov_jobs')
          .update({ status: 'done', stufe: 'fortsetzung', fehler: null })
          .eq('id', jobId);
        return;
      }

      await setStufe(supabase, jobId, 'statistik');
      const { data: dokPos } = await supabase
        .from('ov_dok_positionen')
        .select('*')
        .eq('vergabe_id', vergabeId)
        .in('dokument_id', offerListe.map((d) => d.id))
        .returns<OvDokPositionRow[]>();
      const matrix = baueOffertenMatrix(
        dokPos ?? [],
        offerListe.map((d) => ({ id: d.id, bieter_id: d.bieter_id })),
        parsed.bieter.map((b, i) => ({ id: bieterIds[i], name: b.name })),
      );
      calcRows = matrix.positionen;
      handschriftlich = matrix.handschriftlich;
      handschriftlichCount = matrix.handschriftlichCount;
      if (calcRows.length === 0) {
        await failJob(
          supabase,
          jobId,
          'Aus den Offerten konnten keine Positionen extrahiert werden – bitte Offerten und Bieter-Zuordnung prüfen.',
        );
        return;
      }
    } else {
      calcRows = parsed.positionen.map((p) => ({
        npk: p.npk,
        kapitel: p.kapitel,
        gruppe: p.gruppe,
        bezeichnung: p.bezeichnung,
        menge: p.menge,
        einheit: p.einheit,
        werteRp: p.werteRp,
      }));
    }

    // --- Statistik ---
    const analyse = computeAnalyse(calcRows, parsed.bieter.length, kontrollsummen);
    const wichtigAuto = autoWichtig(analyse);

    // --- Positionen mergen (Schlüssel: NPK); «wichtig» bleibt erhalten ---
    const { data: existingPositionen } = await supabase
      .from('ov_positionen')
      .select('*')
      .eq('vergabe_id', vergabeId)
      .returns<OvPositionRow[]>();
    const posByNpk = new Map((existingPositionen ?? []).map((p) => [p.npk, p]));
    const positionIds = new Map<string, string>();
    for (const [sort, p] of calcRows.entries()) {
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
    const npkSet = new Set(calcRows.map((p) => p.npk));
    const stalePositionen = (existingPositionen ?? []).filter(
      (p) => !npkSet.has(p.npk),
    );
    if (stalePositionen.length > 0) {
      await supabase
        .from('ov_positionen')
        .delete()
        .in('id', stalePositionen.map((p) => p.id));
    }

    // --- Angebote (PK position/bieter, Flags aus Statistik + Handschrift) ---
    const angebotRows = calcRows.flatMap((p) => {
      const stat = positionStat(p);
      return p.werteRp.map((wert, i) => {
        const flags = handschriftlich.has(`${p.npk} ${i}`)
          ? [...stat.flags[i], 'handschriftlich']
          : stat.flags[i];
        return {
          project_id: projectId,
          position_id: positionIds.get(p.npk)!,
          bieter_id: bieterIds[i],
          betrag_rp: wert,
          is_inkl: wert === null,
          flags,
        };
      });
    });
    for (let i = 0; i < angebotRows.length; i += 500) {
      const { error } = await supabase
        .from('ov_angebote')
        .upsert(angebotRows.slice(i, i + 500), {
          onConflict: 'position_id,bieter_id',
        });
      if (error) throw error;
    }

    // --- Einschätzung der Bauleitung (Kontext für die KI) ---
    const { data: vergabeFelder } = await supabase
      .from('ov_vergaben')
      .select('bemerkungen,vorschlag_bieter_id,vorschlag_begruendung')
      .eq('id', vergabeId)
      .maybeSingle<{
        bemerkungen: string | null;
        vorschlag_bieter_id: string | null;
        vorschlag_begruendung: string | null;
      }>();
    let bauleitung: Parameters<typeof generateInsights>[0]['bauleitung'];
    if (vergabeFelder?.bemerkungen || vergabeFelder?.vorschlag_bieter_id) {
      const vIdx = vergabeFelder.vorschlag_bieter_id
        ? bieterIds.indexOf(vergabeFelder.vorschlag_bieter_id)
        : -1;
      const guenstigsterIdx = analyse.ranking[0] ?? 0;
      let vorschlagBieterName: string | null = null;
      let vorschlagDifferenzRp: number | null = null;
      let vorschlagDifferenzPct: number | null = null;
      let vorschlagIstGuenstigster = false;
      if (vIdx >= 0) {
        vorschlagBieterName = parsed.bieter[vIdx]?.name ?? null;
        const vTotal = analyse.bieterTotaleRp[vIdx] ?? 0;
        const gTotal = analyse.bieterTotaleRp[guenstigsterIdx] ?? 0;
        vorschlagIstGuenstigster = vIdx === guenstigsterIdx;
        vorschlagDifferenzRp = vTotal - gTotal;
        vorschlagDifferenzPct = gTotal > 0 ? (vorschlagDifferenzRp / gTotal) * 100 : 0;
      }
      bauleitung = {
        bemerkungen: vergabeFelder.bemerkungen,
        vorschlagBieterName,
        vorschlagBegruendung: vergabeFelder.vorschlag_begruendung,
        vorschlagDifferenzRp,
        vorschlagDifferenzPct,
        vorschlagIstGuenstigster,
      };
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
      positionen: calcRows,
      bauleitung,
    });

    // --- Auswertungs-Snapshot ---
    const inhalt: OvAuswertungInhalt = {
      meta: parsed.meta,
      bieter: parsed.bieter,
      preisquelle: quelle,
      handschriftlichCount,
      // Erklärbare Differenzen nur bei der Vergleich-Quelle: bei der
      // Offerten-Quelle sind Regieansatz u.ä. bereits in den Preisen.
      erklaerbarePositionen:
        quelle === 'positionenvergleich' ? parsed.erklaerbarePositionen : [],
      analyse,
      selbstpruefung: {
        positionCount: calcRows.length,
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
  } finally {
    clearInterval(heartbeat);
  }
}

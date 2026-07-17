/**
 * P2-M4 – Import Baukostenkontrolle Wattwil aus dem HTML-Snapshot
 * (scripts/data/baukostenkontrolle-…): Basiskatalog KV_DATA (JS-Literal)
 * plus Zustand aus <script id="embeddedState"> (JSON).
 *
 *  * Gruppen-Merge über die Ziffer: gleiche Ziffer = gleiche Gruppe
 *    (Standardgruppen aus der Modul-Aktivierung werden wiederverwendet,
 *    der Alt-Tool-Name gewinnt); fehlende Gruppen werden angelegt.
 *  * Katalog-Positionen + Custom-Positionen in bkk_positions; Customs
 *    erhalten ihr Budget über kv_mut_rp (kein Baseline-Wert).
 *  * Erste Baseline «KV orig.» per 23.01.2026 (is_active) mit den
 *    Katalog-KV-Werten in bkk_position_baseline_values.
 *  * kvMut-Überschreibungen → kv_mut_rp; hiddenBkps → hidden.
 *  * Verträge/Zahlungen → bkk_entries mit source_id (Alt-Tool-ID) und
 *    deterministischer UUID – mehrfaches Ausführen aktualisiert statt
 *    dupliziert. Beträge exakt in Rappen (Entscheid 4, keine Rundung).
 *
 * Abgleichstabelle (Exit 1 bei Abweichung): Positionszahl je Gruppe,
 * Vertrags-/Zahlungszahl und die Totale aller Spalten auf den Rappen
 * unter derselben Totalisierungsregel wie das Alt-Tool (round5 aktiv;
 * die Alt-Tool-Werte sind bereits 5-Rappen-Vielfache).
 *
 * Aufruf: npm run import:bkk-wattwil          (Dev)
 *         TARGET=prod npm run import:bkk-wattwil  (Cutover, siehe
 *         docs/CUTOVER-MODULE.md)
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { totals, type BkkPositionWithEntries } from '../lib/bkk-calc';
import { parseStrictSwissDate } from '../lib/lv-logic';
import { BKK_DEFAULT_GROUPS } from '../lib/modules';
import { loadScriptEnv } from './env';

loadScriptEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Fehlende Umgebungsvariablen (URL/Service-Role-Key).');
  process.exit(1);
}

const SOURCE_FILE =
  'scripts/data/baukostenkontrolle-mcd-wattwil_2026-07-16-18-41.html';
const PROJECT_SLUG = 'mcd-wattwil';
const BASELINE_BEZEICHNUNG = 'KV orig.';
const BASELINE_DATUM = '2026-01-23';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Deterministische UUID aus der Quell-Referenz (Idempotenz ohne Lookup). */
function deterministicUuid(reference: string): string {
  const hash = createHash('sha1')
    .update(`bkk-wattwil-import:${reference}`)
    .digest('hex');
  const variantNibble = ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `${variantNibble}${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join('-');
}

/** CHF (Float aus dem Alt-Tool) → exakte Ganzzahl-Rappen. */
const toRp = (chf: number): number => Math.round(chf * 100);

/** JS-Single-Quote-String entschärfen (\' und \\). */
const unescapeJs = (s: string): string => s.replace(/\\(['\\])/g, '$1');

// ---------------------------------------------------------------------------
// Quelle parsen
// ---------------------------------------------------------------------------

interface SourceGroup {
  digit: string;
  name: string;
}
interface SourcePosition {
  bkp: string;
  name: string;
  kv: number;
}
interface SourceEntry {
  id: string;
  betrag: number;
  datum?: string;
  unt?: string;
}
interface SourceRowState {
  kvMut?: number | null;
  vertraege?: SourceEntry[];
  zahlungen?: SourceEntry[];
}
interface SourceState {
  rows: Record<string, SourceRowState>;
  customPositions: { bkp: string; name: string; kv?: number }[];
  hiddenBkps: string[];
}

function extractSource(): {
  groups: SourceGroup[];
  positions: SourcePosition[];
  state: SourceState;
} {
  const html = readFileSync(SOURCE_FILE, 'utf8');

  const kvDataMatch = html.match(/const KV_DATA = \[([\s\S]*?)\];/);
  if (!kvDataMatch) throw new Error('KV_DATA nicht gefunden.');
  const groups: SourceGroup[] = [];
  const positions: SourcePosition[] = [];
  const entryRe =
    /\{\s*(type:\s*'group',\s*)?bkp:\s*'((?:[^'\\]|\\.)*)',\s*name:\s*'((?:[^'\\]|\\.)*)'(?:,\s*kv:\s*([\d.]+))?\s*\}/g;
  for (const m of kvDataMatch[1].matchAll(entryRe)) {
    if (m[1]) groups.push({ digit: m[2], name: unescapeJs(m[3]) });
    else {
      positions.push({
        bkp: unescapeJs(m[2]),
        name: unescapeJs(m[3]),
        kv: Number(m[4] ?? 0),
      });
    }
  }
  if (groups.length === 0 || positions.length === 0) {
    throw new Error('KV_DATA unvollständig geparst.');
  }

  const stateMatch = html.match(
    /<script[^>]*id="embeddedState"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!stateMatch) throw new Error('embeddedState nicht gefunden.');
  const parsed = JSON.parse(stateMatch[1]) as Partial<SourceState>;
  const state: SourceState = {
    rows: parsed.rows ?? {},
    customPositions: parsed.customPositions ?? [],
    hiddenBkps: parsed.hiddenBkps ?? [],
  };
  return { groups, positions, state };
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`BKK-Import startet … Quelle: ${SOURCE_FILE}`);
  const { groups: sourceGroups, positions: catalog, state } = extractSource();
  const hidden = new Set(state.hiddenBkps);
  console.log(
    `Quelle: ${sourceGroups.length} Gruppen, ${catalog.length} Katalog-Positionen, ` +
      `${state.customPositions.length} Custom-Positionen, ${state.hiddenBkps.length} ausgeblendet.`,
  );

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', PROJECT_SLUG)
    .single();
  if (projectError || !project) {
    throw new Error(`Projekt «${PROJECT_SLUG}» nicht gefunden.`);
  }
  const projectId = project.id as string;

  // -------------------------------------------------------------------------
  // Gruppen-Merge über die Ziffer (Alt-Tool-Name gewinnt, Sortierung Quelle)
  // -------------------------------------------------------------------------
  const { data: existingGroups, error: groupsError } = await supabase
    .from('bkk_groups')
    .select('id, digit, name, sort')
    .eq('project_id', projectId);
  if (groupsError) throw groupsError;
  const groupIdByDigit = new Map<string, string>(
    (existingGroups ?? []).map((g) => [g.digit as string, g.id as string]),
  );

  let mergedGroups = 0;
  let createdGroups = 0;
  for (const [index, group] of sourceGroups.entries()) {
    const existingId = groupIdByDigit.get(group.digit);
    if (existingId) {
      const { error } = await supabase
        .from('bkk_groups')
        .update({ name: group.name, sort: index })
        .eq('id', existingId);
      if (error) throw error;
      mergedGroups++;
    } else {
      const { data: created, error } = await supabase
        .from('bkk_groups')
        .insert({
          project_id: projectId,
          digit: group.digit,
          name: group.name,
          sort: index,
        })
        .select('id')
        .single();
      if (error) throw error;
      groupIdByDigit.set(group.digit, created!.id as string);
      createdGroups++;
    }
  }
  // Gruppen für Custom-Ziffern ausserhalb des Katalogs sicherstellen
  for (const cp of state.customPositions) {
    const digit = cp.bkp.charAt(0);
    if (groupIdByDigit.has(digit)) continue;
    const fallbackName =
      BKK_DEFAULT_GROUPS.find((g) => g.digit === digit)?.name ?? `BKP ${digit}`;
    const { data: created, error } = await supabase
      .from('bkk_groups')
      .insert({
        project_id: projectId,
        digit,
        name: fallbackName,
        sort: sourceGroups.length,
      })
      .select('id')
      .single();
    if (error) throw error;
    groupIdByDigit.set(digit, created!.id as string);
    createdGroups++;
  }
  console.log(
    `Gruppen: ${mergedGroups} über Ziffer zusammengeführt, ${createdGroups} neu angelegt.`,
  );

  // -------------------------------------------------------------------------
  // Positionen (Katalog + Customs); bestehende IDs wiederverwenden
  // -------------------------------------------------------------------------
  const { data: existingPositions, error: positionsError } = await supabase
    .from('bkk_positions')
    .select('id, bkp, notiz')
    .eq('project_id', projectId);
  if (positionsError) throw positionsError;
  const existingByBkp = new Map(
    (existingPositions ?? []).map((p) => [
      p.bkp as string,
      { id: p.id as string, notiz: p.notiz as string | null },
    ]),
  );

  interface PositionRow {
    id: string;
    project_id: string;
    group_id: string;
    bkp: string;
    name: string;
    kv_mut_rp: number | null;
    is_custom: boolean;
    hidden: boolean;
    notiz: string | null;
    sort: number;
  }
  const positionRows: PositionRow[] = [];
  const positionIdByBkp = new Map<string, string>();

  const buildRow = (
    bkp: string,
    name: string,
    isCustom: boolean,
    kvMutRp: number | null,
    sort: number,
  ): PositionRow => {
    const existing = existingByBkp.get(bkp);
    const id = existing?.id ?? deterministicUuid(`pos:${bkp}`);
    positionIdByBkp.set(bkp, id);
    const groupId = groupIdByDigit.get(bkp.charAt(0));
    if (!groupId) throw new Error(`Keine Gruppe für BKP «${bkp}».`);
    return {
      id,
      project_id: projectId,
      group_id: groupId,
      bkp,
      name,
      kv_mut_rp: kvMutRp,
      is_custom: isCustom,
      hidden: hidden.has(bkp),
      notiz: existing?.notiz ?? null, // Notizen aus dem Modul bleiben erhalten
      sort,
    };
  };

  catalog.forEach((pos, index) => {
    const kvMut = state.rows[pos.bkp]?.kvMut;
    positionRows.push(
      buildRow(pos.bkp, pos.name, false, kvMut != null ? toRp(kvMut) : null, index),
    );
  });
  state.customPositions.forEach((cp, index) => {
    // Customs: Budget über die Mutationsebene (kvMut-Überschreibung gewinnt,
    // sonst das kv der Custom-Position) – kein Baseline-Wert
    const kvMut = state.rows[cp.bkp]?.kvMut ?? cp.kv ?? 0;
    positionRows.push(
      buildRow(cp.bkp, cp.name, true, toRp(kvMut), catalog.length + index),
    );
  });

  const { error: upsertPositionsError } = await supabase
    .from('bkk_positions')
    .upsert(positionRows);
  if (upsertPositionsError) throw upsertPositionsError;
  console.log(`Positionen importiert/aktualisiert: ${positionRows.length}.`);

  // -------------------------------------------------------------------------
  // Baseline «KV orig.» per 23.01.2026 mit den Katalog-KV-Werten
  // -------------------------------------------------------------------------
  const { data: baselines, error: baselinesError } = await supabase
    .from('bkk_baselines')
    .select('id, bezeichnung, is_active')
    .eq('project_id', projectId);
  if (baselinesError) throw baselinesError;
  let baseline = (baselines ?? []).find(
    (b) => b.bezeichnung === BASELINE_BEZEICHNUNG,
  );
  if (!baseline) {
    const hasActive = (baselines ?? []).some((b) => b.is_active);
    const { data: created, error } = await supabase
      .from('bkk_baselines')
      .insert({
        project_id: projectId,
        bezeichnung: BASELINE_BEZEICHNUNG,
        datum: BASELINE_DATUM,
        is_active: !hasActive, // erste Baseline wird aktiv
      })
      .select('id, bezeichnung, is_active')
      .single();
    if (error) throw error;
    baseline = created!;
    console.log(
      `Baseline «${BASELINE_BEZEICHNUNG}» angelegt (${BASELINE_DATUM}${baseline.is_active ? ', aktiv' : ''}).`,
    );
  } else {
    console.log(`Baseline «${BASELINE_BEZEICHNUNG}» existiert – Werte werden aktualisiert.`);
  }
  const { error: valuesError } = await supabase
    .from('bkk_position_baseline_values')
    .upsert(
      catalog.map((pos) => ({
        baseline_id: baseline!.id as string,
        position_id: positionIdByBkp.get(pos.bkp)!,
        kv_rp: toRp(pos.kv),
      })),
    );
  if (valuesError) throw valuesError;

  // -------------------------------------------------------------------------
  // Verträge und Zahlungen (source_id → deterministische UUID)
  // -------------------------------------------------------------------------
  const { data: existingEntries, error: entriesError } = await supabase
    .from('bkk_entries')
    .select('id, notiz')
    .eq('project_id', projectId);
  if (entriesError) throw entriesError;
  const existingEntryNotiz = new Map(
    (existingEntries ?? []).map((e) => [e.id as string, e.notiz as string | null]),
  );

  const entryRows: {
    id: string;
    project_id: string;
    position_id: string;
    entry_type: 'vertrag' | 'zahlung';
    betrag_rp: number;
    datum: string | null;
    unternehmer: string | null;
    notiz: string | null;
    source_id: string;
  }[] = [];
  for (const [bkp, row] of Object.entries(state.rows)) {
    const positionId = positionIdByBkp.get(bkp);
    if (!positionId) {
      throw new Error(`Zustand für unbekannte BKP «${bkp}» (weder Katalog noch Custom).`);
    }
    const push = (entry: SourceEntry, type: 'vertrag' | 'zahlung') => {
      const id = deterministicUuid(`entry:${entry.id}`);
      entryRows.push({
        id,
        project_id: projectId,
        position_id: positionId,
        entry_type: type,
        betrag_rp: toRp(entry.betrag),
        // Alt-Daten sind TT.MM.JJJJ-Strings; ungültige Werte → null
        datum: entry.datum ? parseStrictSwissDate(entry.datum) : null,
        unternehmer: entry.unt?.trim() || null,
        notiz: existingEntryNotiz.get(id) ?? null,
        source_id: entry.id,
      });
    };
    (row.vertraege ?? []).forEach((e) => push(e, 'vertrag'));
    (row.zahlungen ?? []).forEach((e) => push(e, 'zahlung'));
  }
  if (entryRows.length > 0) {
    const { error } = await supabase.from('bkk_entries').upsert(entryRows);
    if (error) throw error;
  }
  console.log(`Verträge/Zahlungen importiert/aktualisiert: ${entryRows.length}.`);

  // -------------------------------------------------------------------------
  // Abgleich Quelle ↔ Datenbank (Exit 1 bei Abweichung)
  // -------------------------------------------------------------------------
  console.log('\nAbgleich Alt-Tool ↔ Datenbank (Totalisierungsregel: 5-Rappen aktiv):');
  let mismatch = false;
  const check = (label: string, expected: number | string, actual: number | string) => {
    const ok = expected === actual;
    if (!ok) mismatch = true;
    console.log(
      `${label.padEnd(38)} | ${String(expected).padStart(16)} | ${String(actual).padStart(16)} | ${ok ? '✓' : '✗ ABWEICHUNG'}`,
    );
  };
  console.log(
    `${'Prüfung'.padEnd(38)} | ${'Alt-Tool'.padStart(16)} | ${'Datenbank'.padStart(16)} | OK`,
  );
  console.log(`${'-'.repeat(38)}-+-${'-'.repeat(16)}-+-${'-'.repeat(16)}-+---`);

  // Positionszahl je Gruppe (Katalog + Customs, inkl. ausgeblendeter)
  const sourceCountByDigit = new Map<string, number>();
  for (const pos of catalog) {
    const d = pos.bkp.charAt(0);
    sourceCountByDigit.set(d, (sourceCountByDigit.get(d) ?? 0) + 1);
  }
  for (const cp of state.customPositions) {
    const d = cp.bkp.charAt(0);
    sourceCountByDigit.set(d, (sourceCountByDigit.get(d) ?? 0) + 1);
  }
  const { data: dbPositions, error: dbPositionsError } = await supabase
    .from('bkk_positions')
    .select('id, bkp, group_id, kv_mut_rp, is_custom, hidden')
    .eq('project_id', projectId);
  if (dbPositionsError) throw dbPositionsError;
  const digitByGroupId = new Map<string, string>();
  for (const [digit, id] of groupIdByDigit) digitByGroupId.set(id, digit);
  const dbCountByDigit = new Map<string, number>();
  for (const p of dbPositions ?? []) {
    const d = digitByGroupId.get(p.group_id as string) ?? '?';
    dbCountByDigit.set(d, (dbCountByDigit.get(d) ?? 0) + 1);
  }
  for (const digit of [...sourceCountByDigit.keys()].sort()) {
    check(
      `Positionen Gruppe ${digit}`,
      sourceCountByDigit.get(digit) ?? 0,
      dbCountByDigit.get(digit) ?? 0,
    );
  }
  check(
    'Positionen total',
    catalog.length + state.customPositions.length,
    (dbPositions ?? []).length,
  );

  // Vertrags-/Zahlungszahl
  const sourceVertraege = Object.values(state.rows).reduce(
    (sum, r) => sum + (r.vertraege?.length ?? 0),
    0,
  );
  const sourceZahlungen = Object.values(state.rows).reduce(
    (sum, r) => sum + (r.zahlungen?.length ?? 0),
    0,
  );
  const { data: dbEntries, error: dbEntriesError } = await supabase
    .from('bkk_entries')
    .select('position_id, entry_type, betrag_rp')
    .eq('project_id', projectId);
  if (dbEntriesError) throw dbEntriesError;
  check(
    'Verträge (Anzahl)',
    sourceVertraege,
    (dbEntries ?? []).filter((e) => e.entry_type === 'vertrag').length,
  );
  check(
    'Zahlungen (Anzahl)',
    sourceZahlungen,
    (dbEntries ?? []).filter((e) => e.entry_type === 'zahlung').length,
  );

  // Totale auf den Rappen: Alt-Tool-Logik direkt auf der Quelle …
  // (kvOrig zählt alle Katalog-Positionen inkl. ausgeblendeter; kvMut/
  // Verträge/Zahlungen nur sichtbare Katalog-Positionen plus alle Customs)
  let expOrig = 0;
  let expMut = 0;
  let expVertrag = 0;
  let expZahlung = 0;
  const sumEntries = (list: SourceEntry[] | undefined) =>
    (list ?? []).reduce((sum, e) => sum + toRp(e.betrag), 0);
  for (const pos of catalog) {
    expOrig += toRp(pos.kv);
    if (hidden.has(pos.bkp)) continue;
    const row = state.rows[pos.bkp];
    expMut += row?.kvMut != null ? toRp(row.kvMut) : toRp(pos.kv);
    expVertrag += sumEntries(row?.vertraege);
    expZahlung += sumEntries(row?.zahlungen);
  }
  for (const cp of state.customPositions) {
    const row = state.rows[cp.bkp];
    expMut += row?.kvMut != null ? toRp(row.kvMut) : toRp(cp.kv ?? 0);
    expVertrag += sumEntries(row?.vertraege);
    expZahlung += sumEntries(row?.zahlungen);
  }

  // … gegen die Datenbank (lib/bkk-calc.totals mit round5 wie im Modul)
  const { data: dbValues, error: dbValuesError } = await supabase
    .from('bkk_position_baseline_values')
    .select('position_id, kv_rp')
    .eq('baseline_id', baseline!.id as string);
  if (dbValuesError) throw dbValuesError;
  const valueByPosition = new Map(
    (dbValues ?? []).map((v) => [v.position_id as string, v.kv_rp as number]),
  );
  const entriesByPosition = new Map<string, { entryType: 'vertrag' | 'zahlung'; betragRp: number }[]>();
  for (const e of dbEntries ?? []) {
    const list = entriesByPosition.get(e.position_id as string) ?? [];
    list.push({
      entryType: e.entry_type as 'vertrag' | 'zahlung',
      betragRp: Number(e.betrag_rp),
    });
    entriesByPosition.set(e.position_id as string, list);
  }
  const calcRows: BkkPositionWithEntries[] = (dbPositions ?? []).map((p) => ({
    position: {
      bkp: p.bkp as string,
      kvBaselineRp: valueByPosition.get(p.id as string) ?? null,
      kvMutRp: p.kv_mut_rp === null ? null : Number(p.kv_mut_rp),
      hidden: Boolean(p.hidden),
    },
    entries: entriesByPosition.get(p.id as string) ?? [],
  }));
  const dbTotals = totals(calcRows, { round5: true });

  check('Total KV orig. (Rappen)', expOrig, dbTotals.kvBaselineRp);
  check('Total KV mutiert (Rappen)', expMut, dbTotals.kvMutRp);
  check('Total Verträge (Rappen)', expVertrag, dbTotals.vertragRp);
  check('Total Zahlungen (Rappen)', expZahlung, dbTotals.zahlungRp);

  if (mismatch) {
    console.error('\nBKK-Import fehlgeschlagen: Abgleich weist Abweichungen aus.');
    process.exit(1);
  }
  console.log(
    `\nBKK-Import abgeschlossen – Abgleich vollständig grün.\n` +
      `Kontrollwerte fürs Modul: KV orig. ${(expOrig / 100).toLocaleString('de-CH')} · ` +
      `KV mutiert ${(expMut / 100).toLocaleString('de-CH')} · ` +
      `Verträge ${(expVertrag / 100).toLocaleString('de-CH')} · ` +
      `Zahlungen ${(expZahlung / 100).toLocaleString('de-CH')}`,
  );
}

main().catch((err) => {
  console.error('BKK-Import fehlgeschlagen:', err);
  process.exit(1);
});

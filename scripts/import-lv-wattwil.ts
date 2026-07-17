/**
 * P2-M4 – Import Verkehr-Leistungsverzeichnis Wattwil aus dem HTML-Snapshot
 * (scripts/data/verkehr-leistungsverzeichnis-…): Katalog KV_POSITIONS
 * (JS-Literal) plus Zustand aus <script id="embeddedState"> (JSON).
 *
 *  * Vergabeeinheiten (~67) → lv_units; hiddenBkps → hidden; die
 *    Werkvertrags-Verknüpfung (werkvertrag_document_id) bleibt erhalten.
 *  * Schritt-Zellen über parseStrictSwissDate (Entscheid 3): strikte
 *    TT.MM.JJJJ-Werte → Datumsfeld, alles andere («✓ erledigt»,
 *    «⊘ nach Aufwand», KW-Angaben, Freitext) unverändert ins Freitextfeld
 *    – kein Wert geht verloren, kein Abbruch.
 *  * lv_offers bleibt leer (Entscheid 1 – neues Feature nach dem Cutover).
 *
 * Idempotent: Einheiten-IDs deterministisch bzw. bestehende IDs
 * wiederverwendet; Zellen laufen über den Primärschlüssel
 * (unit_id, step_key).
 *
 * Abgleichstabelle (Exit 1 bei Abweichung): Einheitenzahl, Zellenzahl je
 * Schritt-Typ (Datum/Marker/Freitext) und KPI-Zählungen identisch zum
 * Alt-Tool.
 *
 * Aufruf: npm run import:lv-wattwil          (Dev)
 *         TARGET=prod npm run import:lv-wattwil  (Cutover, siehe
 *         docs/CUTOVER-MODULE.md)
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  LV_DONE_MARKER,
  LV_NA_MARKER,
  LV_STEP_KEYS,
  type LvStepKey,
  type LvUnitStepMap,
  parseStrictSwissDate,
  unitKpis,
} from '../lib/lv-logic';
import { loadScriptEnv } from './env';

loadScriptEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Fehlende Umgebungsvariablen (URL/Service-Role-Key).');
  process.exit(1);
}

const SOURCE_FILE =
  'scripts/data/verkehr-leistungsverzeichnis-mcd-wattwil_2026-07-16-18-40.html';
const PROJECT_SLUG = 'mcd-wattwil';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Deterministische UUID aus der Quell-Referenz (Idempotenz ohne Lookup). */
function deterministicUuid(reference: string): string {
  const hash = createHash('sha1')
    .update(`lv-wattwil-import:${reference}`)
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

/** JS-Single-Quote-String entschärfen (\' und \\). */
const unescapeJs = (s: string): string => s.replace(/\\(['\\])/g, '$1');

// ---------------------------------------------------------------------------
// Quelle parsen
// ---------------------------------------------------------------------------

interface SourceUnit {
  bkp: string;
  name: string;
}
interface SourceState {
  rows: Record<string, Record<string, string>>;
  customPositions: { bkp: string; name: string }[];
  hiddenBkps: string[];
}

function extractSource(): { catalog: SourceUnit[]; state: SourceState } {
  const html = readFileSync(SOURCE_FILE, 'utf8');

  const catalogMatch = html.match(/const KV_POSITIONS = \[([\s\S]*?)\];/);
  if (!catalogMatch) throw new Error('KV_POSITIONS nicht gefunden.');
  const catalog: SourceUnit[] = [];
  const entryRe =
    /\{\s*bkp:\s*'((?:[^'\\]|\\.)*)',\s*name:\s*'((?:[^'\\]|\\.)*)'\s*\}/g;
  for (const m of catalogMatch[1].matchAll(entryRe)) {
    catalog.push({ bkp: unescapeJs(m[1]), name: unescapeJs(m[2]) });
  }
  if (catalog.length === 0) throw new Error('KV_POSITIONS unvollständig geparst.');

  const stateMatch = html.match(
    /<script[^>]*id="embeddedState"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!stateMatch) throw new Error('embeddedState nicht gefunden.');
  const parsed = JSON.parse(stateMatch[1]) as Partial<SourceState>;
  return {
    catalog,
    state: {
      rows: parsed.rows ?? {},
      customPositions: parsed.customPositions ?? [],
      hiddenBkps: parsed.hiddenBkps ?? [],
    },
  };
}

/** Zell-Klassifizierung für den Abgleich (Datum / Marker / Freitext). */
type CellKind = 'datum' | 'marker' | 'freitext';
function classifySourceValue(value: string): CellKind {
  if (parseStrictSwissDate(value)) return 'datum';
  const trimmed = value.trim();
  if (trimmed === LV_DONE_MARKER || trimmed === LV_NA_MARKER) return 'marker';
  return 'freitext';
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`LV-Import startet … Quelle: ${SOURCE_FILE}`);
  const { catalog, state } = extractSource();
  const hidden = new Set(state.hiddenBkps);
  console.log(
    `Quelle: ${catalog.length} Katalog-Einheiten, ${state.customPositions.length} ` +
      `Custom-Einheiten, ${state.hiddenBkps.length} ausgeblendet, ` +
      `${Object.keys(state.rows).length} Einheiten mit Workflow-Stand.`,
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
  // Einheiten (bestehende IDs und Werkvertrags-Verknüpfungen bleiben)
  // -------------------------------------------------------------------------
  const { data: existingUnits, error: unitsError } = await supabase
    .from('lv_units')
    .select('id, bkp, werkvertrag_document_id')
    .eq('project_id', projectId);
  if (unitsError) throw unitsError;
  const existingByBkp = new Map(
    (existingUnits ?? []).map((u) => [
      u.bkp as string,
      {
        id: u.id as string,
        werkvertrag: u.werkvertrag_document_id as string | null,
      },
    ]),
  );

  const unitIdByBkp = new Map<string, string>();
  const allUnits = [
    ...catalog.map((u) => ({ ...u, isCustom: false })),
    ...state.customPositions.map((u) => ({ ...u, isCustom: true })),
  ];
  const unitRows = allUnits.map((unit, index) => {
    const existing = existingByBkp.get(unit.bkp);
    const id = existing?.id ?? deterministicUuid(`unit:${unit.bkp}`);
    unitIdByBkp.set(unit.bkp, id);
    return {
      id,
      project_id: projectId,
      bkp: unit.bkp,
      name: unit.name,
      is_custom: unit.isCustom,
      hidden: hidden.has(unit.bkp),
      werkvertrag_document_id: existing?.werkvertrag ?? null,
      sort: index,
    };
  });
  const { error: upsertUnitsError } = await supabase
    .from('lv_units')
    .upsert(unitRows);
  if (upsertUnitsError) throw upsertUnitsError;
  console.log(`Einheiten importiert/aktualisiert: ${unitRows.length}.`);

  // -------------------------------------------------------------------------
  // Schritt-Zellen (Entscheid 3: strikte Daten → datum, Rest → freitext)
  // -------------------------------------------------------------------------
  const stepRows: {
    unit_id: string;
    step_key: LvStepKey;
    datum: string | null;
    freitext: string | null;
  }[] = [];
  const sourceKindCount: Record<CellKind, number> = {
    datum: 0,
    marker: 0,
    freitext: 0,
  };
  for (const [bkp, row] of Object.entries(state.rows)) {
    const unitId = unitIdByBkp.get(bkp);
    if (!unitId) {
      // Verwaiste Zustandszeile (weder Katalog noch Custom): das Alt-Tool
      // zeigt solche Zeilen selbst nie an. Leer → überspringen; mit Werten
      // → Abbruch, damit kein Wert stillschweigend verloren geht.
      const hasValues = LV_STEP_KEYS.some((key) => row[key]);
      if (hasValues) {
        throw new Error(
          `Workflow-Stand mit Werten für unbekannte BKP «${bkp}» – Entscheid nötig.`,
        );
      }
      console.log(`Hinweis: leere verwaiste Zustandszeile «${bkp}» übersprungen.`);
      continue;
    }
    for (const stepKey of LV_STEP_KEYS) {
      const value = row[stepKey];
      if (!value) continue;
      const iso = parseStrictSwissDate(value);
      sourceKindCount[classifySourceValue(value)]++;
      stepRows.push({
        unit_id: unitId,
        step_key: stepKey,
        datum: iso,
        // kein Wert geht verloren: alles Nicht-Datum unverändert übernehmen
        freitext: iso ? null : value,
      });
    }
  }
  if (stepRows.length > 0) {
    const { error } = await supabase.from('lv_unit_steps').upsert(stepRows);
    if (error) throw error;
  }
  console.log(`Schritt-Zellen importiert/aktualisiert: ${stepRows.length}.`);
  console.log('lv_offers bleibt unangetastet (leer, Entscheid 1).');

  // -------------------------------------------------------------------------
  // Abgleich Quelle ↔ Datenbank (Exit 1 bei Abweichung)
  // -------------------------------------------------------------------------
  console.log('\nAbgleich Alt-Tool ↔ Datenbank:');
  let mismatch = false;
  const check = (label: string, expected: number, actual: number) => {
    const ok = expected === actual;
    if (!ok) mismatch = true;
    console.log(
      `${label.padEnd(34)} | ${String(expected).padStart(9)} | ${String(actual).padStart(9)} | ${ok ? '✓' : '✗ ABWEICHUNG'}`,
    );
  };
  console.log(
    `${'Prüfung'.padEnd(34)} | ${'Alt-Tool'.padStart(9)} | ${'Datenbank'.padStart(9)} | OK`,
  );
  console.log(`${'-'.repeat(34)}-+-${'-'.repeat(9)}-+-${'-'.repeat(9)}-+---`);

  const { data: dbUnits, error: dbUnitsError } = await supabase
    .from('lv_units')
    .select('id, bkp, hidden')
    .eq('project_id', projectId);
  if (dbUnitsError) throw dbUnitsError;
  check('Einheiten total', allUnits.length, (dbUnits ?? []).length);
  check(
    'Einheiten ausgeblendet',
    state.hiddenBkps.length,
    (dbUnits ?? []).filter((u) => u.hidden).length,
  );

  const { data: dbSteps, error: dbStepsError } = await supabase
    .from('lv_unit_steps')
    .select('unit_id, step_key, datum, freitext')
    .in(
      'unit_id',
      (dbUnits ?? []).map((u) => u.id as string),
    );
  if (dbStepsError) throw dbStepsError;
  const dbKindCount: Record<CellKind, number> = { datum: 0, marker: 0, freitext: 0 };
  for (const s of dbSteps ?? []) {
    if (s.datum) dbKindCount.datum++;
    else if (
      (s.freitext as string | null)?.trim() === LV_DONE_MARKER ||
      (s.freitext as string | null)?.trim() === LV_NA_MARKER
    ) {
      dbKindCount.marker++;
    } else dbKindCount.freitext++;
  }
  check('Zellen total', stepRows.length, (dbSteps ?? []).length);
  check('Zellen Datum', sourceKindCount.datum, dbKindCount.datum);
  check('Zellen Marker (✓/⊘)', sourceKindCount.marker, dbKindCount.marker);
  check('Zellen Freitext', sourceKindCount.freitext, dbKindCount.freitext);

  // KPI-Zählungen wie das Alt-Tool (sichtbare Einheiten; Marker = erledigt)
  const expectedVisible = allUnits.filter((u) => !hidden.has(u.bkp));
  const expected = {
    total: expectedVisible.length,
    lvErstellt: expectedVisible.filter((u) => state.rows[u.bkp]?.lv_erstellt).length,
    offErhalten: expectedVisible.filter((u) => state.rows[u.bkp]?.off_erhalten).length,
    wvZurueck: expectedVisible.filter((u) => state.rows[u.bkp]?.wv_zurueck).length,
    offen: expectedVisible.filter(
      (u) => !LV_STEP_KEYS.some((key) => state.rows[u.bkp]?.[key]),
    ).length,
  };
  const stepsByUnit = new Map<string, LvUnitStepMap>();
  for (const s of dbSteps ?? []) {
    const map = stepsByUnit.get(s.unit_id as string) ?? {};
    map[s.step_key as LvStepKey] = {
      datum: s.datum as string | null,
      freitext: s.freitext as string | null,
    };
    stepsByUnit.set(s.unit_id as string, map);
  }
  const dbKpis = unitKpis(
    (dbUnits ?? [])
      .filter((u) => !u.hidden)
      .map((u) => stepsByUnit.get(u.id as string) ?? {}),
  );
  check('KPI Einheiten (sichtbar)', expected.total, dbKpis.total);
  check('KPI LV erstellt', expected.lvErstellt, dbKpis.lvErstellt);
  check('KPI Offerten erhalten', expected.offErhalten, dbKpis.offErhalten);
  check('KPI WV zurück', expected.wvZurueck, dbKpis.wvZurueck);
  check('KPI Offen', expected.offen, dbKpis.offen);

  if (mismatch) {
    console.error('\nLV-Import fehlgeschlagen: Abgleich weist Abweichungen aus.');
    process.exit(1);
  }
  console.log(
    `\nLV-Import abgeschlossen – Abgleich vollständig grün.\n` +
      `Kontrollwerte fürs Modul: ${expected.total} Einheiten · LV erstellt ${expected.lvErstellt} · ` +
      `Offerten ${expected.offErhalten} · WV zurück ${expected.wvZurueck} · Offen ${expected.offen}`,
  );
}

main().catch((err) => {
  console.error('LV-Import fehlgeschlagen:', err);
  process.exit(1);
});

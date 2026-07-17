/**
 * Demo-Showcase (Ausbauliste Punkt 7): befüllt das Demo-Projekt
 * «Bürohaus Demo Frauenfeld» (slug demo-buerohaus) als Vorführkulisse –
 * erkennbar fiktiv (Muster/Beispiel/Demo-Firmen), fachlich realistisch:
 *
 *  (a) ~24 Hub-Dokumente über alle fünf Kategorien (inkl. Unterpositionen)
 *      mit Platzhalter-PDFs im Storage (project-files, signierte Downloads)
 *  (b) beide Module aktiviert, Freigaben Bauherr Sehen / Bauleitung Bearbeiten
 *  (c) BKK: eine aktive Baseline, 15 Positionen über 5 Gruppen, Mutationen,
 *      Verträge/Zahlungen mit allen fünf Status-Fällen (Selbstprüfung)
 *  (d) LV: 15 Vergabeeinheiten mit gemischten Workflow-Ständen inkl.
 *      ✓-/⊘-Markern und einem Freitext (Selbstprüfung aller Stände)
 *  (e) Landingpage (Beschrieb, Info-Zellen, Hero-Captions, Login-Untertext)
 *  (f) Demo-Besucherkonto info@wema-design.ch (Sehen via Rolle Bauherr)
 *
 * Idempotent über feste (deterministische) IDs; jeder Lauf stellt den
 * Showcase-Zustand wieder her: Fremde Dokumente/BKK-Zeilen/LV-Einheiten im
 * Demo-Projekt werden entfernt. Siehe docs/DEMO-PROJEKT.md.
 *
 * Aufruf: npm run seed:demo-showcase            (Dev, .env.local)
 *         TARGET=prod npm run seed:demo-showcase (Produktion, nach Go)
 */
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  positionStatus,
  totals,
  type BkkPositionWithEntries,
  type BkkStatus,
} from '../lib/bkk-calc';
import { formatRappen } from '../lib/format';
import {
  LV_DONE_MARKER,
  LV_NA_MARKER,
  unitStatus,
  type LvStepKey,
  type LvUnitStepMap,
} from '../lib/lv-logic';
import { BKK_DEFAULT_GROUPS } from '../lib/modules';
import { loadScriptEnv } from './env';

const target = loadScriptEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Fehlende Umgebungsvariablen: NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY setzen.',
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PROJECT_SLUG = 'demo-buerohaus';
const DEMO_USER_EMAIL = 'info@wema-design.ch';
const DEMO_USER_PASSWORD = 'DemoBuerohaus2026!'; // dokumentiert in docs/DEMO-PROJEKT.md

/** Deterministische UUID aus einem Showcase-Schlüssel (Idempotenz). */
function uuidOf(reference: string): string {
  const hash = createHash('sha1')
    .update(`demo-showcase:${reference}`)
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

/** CHF → Rappen (Ganzzahl) für lesbare Beträge im Datenteil. */
function chf(value: number): number {
  return Math.round(value * 100);
}

// ---------------------------------------------------------------------------
// Platzhalter-PDF (minimal, valide, mit Titelzeile) – korrekt berechnete
// xref-Offsets, damit alle Viewer die Datei sauber öffnen.
// ---------------------------------------------------------------------------

function placeholderPdf(title: string): Buffer {
  const ascii = title
    .normalize('NFD')
    // Combining Diacritical Marks entfernen (ü→u für die Type1-Textzeile)
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/([()\\])/g, '\\$1');
  const stream = `BT /F1 16 Tf 72 770 Td (${ascii}) Tj ET\nBT /F1 10 Tf 72 748 Td (Platzhalter-Dokument - Demo-Projekt Buerohaus Frauenfeld) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((content, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${content}\nendobj\n`;
  });
  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

// ---------------------------------------------------------------------------
// (a) Hub-Dokumente – Schema der Demo-Kategorien: icon (Badge), title, sub
// (Pläne zusätzlich format). Fiktive Firmen, Schweizer BKP-Konventionen.
// ---------------------------------------------------------------------------

interface ShowcaseDoc {
  key: string; // deterministischer Schlüssel (→ id, Storage-Pfad)
  categoryKey: string;
  parentKey?: string;
  data: Record<string, string>;
}

const showcaseDocs: ShowcaseDoc[] = [
  // Übersichtsdokumente (grosse Karten)
  { key: 'ueb-projektuebersicht', categoryKey: 'uebersichtsdokumente', data: { icon: 'PDF', title: 'Projektübersicht', sub: 'Stand Juli 2026' } },
  { key: 'ueb-terminprogramm', categoryKey: 'uebersichtsdokumente', data: { icon: 'PDF', title: 'Terminprogramm', sub: 'Bauablauf 2026–2027' } },
  { key: 'ueb-organigramm', categoryKey: 'uebersichtsdokumente', data: { icon: 'PDF', title: 'Organigramm', sub: 'Projektorganisation' } },
  // Pläne (Listenkarten, Demo-Schema mit Format-Feld)
  { key: 'plan-p101', categoryKey: 'plaene', data: { icon: 'P-101', title: 'Grundriss Erdgeschoss', sub: 'Ausführungsplan 1:50', format: 'A0' } },
  { key: 'plan-p102', categoryKey: 'plaene', data: { icon: 'P-102', title: 'Grundriss 1. Obergeschoss', sub: 'Ausführungsplan 1:50', format: 'A0' } },
  { key: 'plan-p103', categoryKey: 'plaene', data: { icon: 'P-103', title: 'Grundriss 2. Obergeschoss', sub: 'Ausführungsplan 1:50', format: 'A0' } },
  { key: 'plan-p201', categoryKey: 'plaene', data: { icon: 'P-201', title: 'Fassadenschnitt Süd', sub: 'Ausführungsplan 1:20', format: 'A1' } },
  { key: 'plan-p301', categoryKey: 'plaene', data: { icon: 'P-301', title: 'Detail Fensteranschluss', sub: 'Detailplan 1:5', format: 'A3' } },
  { key: 'plan-e401', categoryKey: 'plaene', data: { icon: 'E-401', title: 'Elektro Prinzipschema', sub: 'Starkstrom/UKV', format: 'A1' } },
  // Ausschreibungen (grosse Karten, mit Unterpositionen)
  { key: 'aus-211', categoryKey: 'ausschreibungen', data: { icon: '211', title: 'Baumeisterarbeiten', sub: 'Submission bis 21.08.2026' } },
  { key: 'aus-211-devis', categoryKey: 'ausschreibungen', parentKey: 'aus-211', data: { icon: '211', title: 'Devis Baumeisterarbeiten', sub: 'NPK 111/211' } },
  { key: 'aus-211-gutachten', categoryKey: 'ausschreibungen', parentKey: 'aus-211', data: { icon: '211', title: 'Baugrundgutachten', sub: 'Beilage zur Submission' } },
  { key: 'aus-230', categoryKey: 'ausschreibungen', data: { icon: '230', title: 'Elektroanlagen', sub: 'Submission bis 04.09.2026' } },
  { key: 'aus-244', categoryKey: 'ausschreibungen', data: { icon: '244', title: 'Lüftungsanlagen', sub: 'in Vorbereitung' } },
  // Offerten (Listenkarten)
  { key: 'off-211-muster', categoryKey: 'offerten', data: { icon: '211', title: 'Muster Bau AG', sub: 'Offerte CHF 1’820’000.00 · 14.03.2026' } },
  { key: 'off-211-beispiel', categoryKey: 'offerten', data: { icon: '211', title: 'Beispiel Bau GmbH', sub: 'Offerte CHF 1’940’500.00 · 17.03.2026' } },
  { key: 'off-221-metall', categoryKey: 'offerten', data: { icon: '221', title: 'Demo Metallbau GmbH', sub: 'Offerte CHF 648’000.00 · 02.04.2026' } },
  { key: 'off-230-elektro', categoryKey: 'offerten', data: { icon: '230', title: 'Beispiel Elektro AG', sub: 'Offerte CHF 731’000.00 · 28.04.2026' } },
  { key: 'off-244-haustechnik', categoryKey: 'offerten', data: { icon: '244', title: 'Muster Haustechnik AG', sub: 'Offerte CHF 449’000.00 · 05.05.2026' } },
  // Werkverträge (Listenkarten)
  { key: 'wv-211', categoryKey: 'werkvertraege', data: { icon: '211', title: 'Muster Bau AG', sub: 'Werkvertrag vom 14.04.2026' } },
  { key: 'wv-221', categoryKey: 'werkvertraege', data: { icon: '221', title: 'Demo Metallbau GmbH', sub: 'Werkvertrag vom 12.05.2026' } },
  { key: 'wv-230', categoryKey: 'werkvertraege', data: { icon: '230', title: 'Beispiel Elektro AG', sub: 'Werkvertrag vom 26.05.2026' } },
  { key: 'wv-244', categoryKey: 'werkvertraege', data: { icon: '244', title: 'Muster Haustechnik AG', sub: 'Werkvertrag vom 09.06.2026' } },
  { key: 'wv-112', categoryKey: 'werkvertraege', data: { icon: '112', title: 'Muster Rückbau AG', sub: 'Werkvertrag vom 02.02.2026' } },
];

// ---------------------------------------------------------------------------
// (c) BKK – 15 Positionen, alle fünf Status-Fälle, plausible Summen
// ---------------------------------------------------------------------------

interface ShowcaseEntry {
  key: string;
  type: 'vertrag' | 'zahlung';
  betragRp: number;
  datum: string;
  unternehmer: string;
  notiz?: string;
}

interface ShowcasePosition {
  bkp: string;
  name: string;
  kvRp: number; // Baseline-Wert
  kvMutRp?: number; // Mutation (optional)
  notiz?: string;
  entries: ShowcaseEntry[];
}

const BASELINE = {
  key: 'baseline-kv-orig',
  bezeichnung: 'KV orig.',
  datum: '2026-03-02',
};

const showcasePositions: ShowcasePosition[] = [
  // Status bezahlt
  { bkp: '112', name: 'Abbrüche/Rückbau', kvRp: chf(180000), entries: [
    { key: '112-v1', type: 'vertrag', betragRp: chf(165000), datum: '2026-02-02', unternehmer: 'Muster Rückbau AG' },
    { key: '112-z1', type: 'zahlung', betragRp: chf(82500), datum: '2026-03-31', unternehmer: 'Muster Rückbau AG', notiz: '1. Akonto' },
    { key: '112-z2', type: 'zahlung', betragRp: chf(82500), datum: '2026-05-29', unternehmer: 'Muster Rückbau AG', notiz: 'Schlusszahlung' },
  ] },
  // Status teilbezahlt, Mutation nach Vergabe (Einsparung)
  { bkp: '211', name: 'Baumeisterarbeiten', kvRp: chf(1850000), kvMutRp: chf(1790000), notiz: 'Vergabe 14.04.2026', entries: [
    { key: '211-v1', type: 'vertrag', betragRp: chf(1782000), datum: '2026-04-14', unternehmer: 'Muster Bau AG', notiz: 'Werkvertrag inkl. Baugrube' },
    { key: '211-z1', type: 'zahlung', betragRp: chf(534600), datum: '2026-06-30', unternehmer: 'Muster Bau AG', notiz: '1. Akonto (30 %)' },
    { key: '211-z2', type: 'zahlung', betragRp: chf(356400), datum: '2026-07-31', unternehmer: 'Muster Bau AG', notiz: '2. Akonto' },
  ] },
  // Status offen
  { bkp: '214', name: 'Montagebau in Holz', kvRp: chf(450000), entries: [] },
  // Status ueber_kv (Vergabe über KV)
  { bkp: '221', name: 'Fenster aus Metall', kvRp: chf(620000), notiz: 'Vergabe über KV – Mehrpreis Sonnenschutzglas', entries: [
    { key: '221-v1', type: 'vertrag', betragRp: chf(648000), datum: '2026-05-12', unternehmer: 'Demo Metallbau GmbH' },
  ] },
  // Status vertrag
  { bkp: '224', name: 'Bedachungsarbeiten', kvRp: chf(380000), entries: [
    { key: '224-v1', type: 'vertrag', betragRp: chf(366500), datum: '2026-05-20', unternehmer: 'Muster Bedachungen AG' },
  ] },
  // Status teilbezahlt, Mutation nach oben
  { bkp: '230', name: 'Elektroanlagen', kvRp: chf(720000), kvMutRp: chf(745000), notiz: 'Mehrumfang Ladeinfrastruktur', entries: [
    { key: '230-v1', type: 'vertrag', betragRp: chf(731000), datum: '2026-05-26', unternehmer: 'Beispiel Elektro AG' },
    { key: '230-z1', type: 'zahlung', betragRp: chf(219300), datum: '2026-07-15', unternehmer: 'Beispiel Elektro AG', notiz: '1. Akonto (30 %)' },
  ] },
  // Status bezahlt
  { bkp: '240', name: 'Heizungsanlagen', kvRp: chf(540000), entries: [
    { key: '240-v1', type: 'vertrag', betragRp: chf(528000), datum: '2026-04-28', unternehmer: 'Muster Haustechnik AG' },
    { key: '240-z1', type: 'zahlung', betragRp: chf(528000), datum: '2026-07-10', unternehmer: 'Muster Haustechnik AG', notiz: 'Schlusszahlung' },
  ] },
  // Status vertrag
  { bkp: '244', name: 'Lüftungsanlagen', kvRp: chf(460000), entries: [
    { key: '244-v1', type: 'vertrag', betragRp: chf(449000), datum: '2026-06-09', unternehmer: 'Muster Haustechnik AG' },
  ] },
  { bkp: '271', name: 'Gipserarbeiten', kvRp: chf(310000), entries: [] },
  { bkp: '272', name: 'Metallbauarbeiten', kvRp: chf(150000), kvMutRp: chf(138000), entries: [] },
  { bkp: '281', name: 'Bodenbeläge', kvRp: chf(290000), entries: [] },
  { bkp: '285', name: 'Innere Malerarbeiten', kvRp: chf(175000), entries: [] },
  { bkp: '421', name: 'Umgebungsarbeiten', kvRp: chf(240000), entries: [] },
  // Status bezahlt (Gebühren)
  { bkp: '511', name: 'Bewilligungen/Gebühren', kvRp: chf(95000), entries: [
    { key: '511-v1', type: 'vertrag', betragRp: chf(95000), datum: '2026-03-10', unternehmer: 'Stadt Frauenfeld (Gebühren)' },
    { key: '511-z1', type: 'zahlung', betragRp: chf(95000), datum: '2026-04-02', unternehmer: 'Stadt Frauenfeld (Gebühren)' },
  ] },
  { bkp: '900', name: 'Möblierung/Ausstattung', kvRp: chf(350000), entries: [] },
];

// ---------------------------------------------------------------------------
// (d) LV – 15 Vergabeeinheiten, gemischte Workflow-Stände
// ---------------------------------------------------------------------------

interface ShowcaseUnit {
  bkp: string;
  name: string;
  werkvertragDocKey?: string;
  steps: Partial<Record<LvStepKey, { datum?: string; freitext?: string }>>;
}

const showcaseUnits: ShowcaseUnit[] = [
  // abgeschlossen (WV zurück mit Datum), verknüpft mit Werkvertrag im Hub
  { bkp: '211', name: 'Baumeisterarbeiten', werkvertragDocKey: 'wv-211', steps: {
    lv_erstellt: { datum: '2026-02-16' }, lv_versendet: { datum: '2026-02-20' },
    off_erhalten: { datum: '2026-03-14' }, av_erstellt: { datum: '2026-03-24' },
    av_bh: { datum: '2026-03-31' }, wv_erstellt: { datum: '2026-04-08' },
    wv_unt: { datum: '2026-04-14' }, wv_bh: { datum: '2026-04-17' },
    wv_zurueck: { datum: '2026-04-24' },
  } },
  // in Arbeit (WV beim Bauherrn), verknüpft
  { bkp: '221', name: 'Fenster aus Metall', werkvertragDocKey: 'wv-221', steps: {
    lv_erstellt: { datum: '2026-03-09' }, lv_versendet: { datum: '2026-03-13' },
    off_erhalten: { datum: '2026-04-02' }, av_erstellt: { datum: '2026-04-20' },
    av_bh: { datum: '2026-04-28' }, wv_erstellt: { datum: '2026-05-06' },
    wv_unt: { datum: '2026-05-12' }, wv_bh: { datum: '2026-05-19' },
  } },
  { bkp: '224', name: 'Bedachungsarbeiten', steps: {
    lv_erstellt: { datum: '2026-03-23' }, lv_versendet: { datum: '2026-03-27' },
    off_erhalten: { datum: '2026-04-24' }, av_erstellt: { datum: '2026-05-11' },
    av_bh: { datum: '2026-05-18' },
  } },
  // Freitext-Beispiel: Offerten avisiert auf KW 34
  { bkp: '230', name: 'Elektroanlagen', steps: {
    lv_erstellt: { datum: '2026-04-07' }, lv_versendet: { datum: '2026-04-10' },
    off_erhalten: { freitext: 'avisiert KW 34' },
  } },
  // abgeschlossen mit ✓-Markern (ohne Datum)
  { bkp: '240', name: 'Heizungsanlagen', steps: {
    lv_erstellt: { datum: '2026-03-16' }, lv_versendet: { datum: '2026-03-20' },
    off_erhalten: { datum: '2026-04-14' }, av_erstellt: { datum: '2026-04-20' },
    av_bh: { datum: '2026-04-22' }, wv_erstellt: { freitext: LV_DONE_MARKER },
    wv_unt: { freitext: LV_DONE_MARKER }, wv_bh: { freitext: LV_DONE_MARKER },
    wv_zurueck: { freitext: LV_DONE_MARKER },
  } },
  { bkp: '244', name: 'Lüftungsanlagen', steps: {
    lv_erstellt: { datum: '2026-04-13' }, lv_versendet: { datum: '2026-04-17' },
    off_erhalten: { datum: '2026-05-05' }, av_erstellt: { datum: '2026-05-22' },
  } },
  { bkp: '250', name: 'Sanitäranlagen', steps: {
    lv_erstellt: { datum: '2026-05-04' }, lv_versendet: { datum: '2026-05-08' },
  } },
  { bkp: '261', name: 'Aufzugsanlage', steps: {} },
  { bkp: '271', name: 'Gipserarbeiten', steps: {
    lv_erstellt: { datum: '2026-06-15' },
  } },
  { bkp: '272', name: 'Metallbauarbeiten', steps: {} },
  { bkp: '273', name: 'Schreinerarbeiten', steps: {
    lv_erstellt: { datum: '2026-06-29' },
  } },
  { bkp: '281', name: 'Bodenbeläge', steps: {} },
  { bkp: '285', name: 'Innere Malerarbeiten', steps: {} },
  // nach Aufwand: alle vier WV-Schritte mit ⊘-Marker
  { bkp: '287', name: 'Baureinigung', steps: {
    lv_erstellt: { freitext: LV_NA_MARKER }, lv_versendet: { freitext: LV_NA_MARKER },
    off_erhalten: { freitext: LV_NA_MARKER }, av_erstellt: { freitext: LV_NA_MARKER },
    av_bh: { freitext: LV_NA_MARKER }, wv_erstellt: { freitext: LV_NA_MARKER },
    wv_unt: { freitext: LV_NA_MARKER }, wv_bh: { freitext: LV_NA_MARKER },
    wv_zurueck: { freitext: LV_NA_MARKER },
  } },
  { bkp: '421', name: 'Umgebungsarbeiten', steps: {
    lv_erstellt: { datum: '2026-06-22' }, lv_versendet: { datum: '2026-06-26' },
    off_erhalten: { datum: '2026-07-14' },
  } },
];

// ---------------------------------------------------------------------------
// (e) Landingpage
// ---------------------------------------------------------------------------

const showcaseLanding = {
  subtitle: 'Umbau und Aufstockung · DEMO_001',
  description:
    'Umbau und Aufstockung des Bürohauses an der Musterstrasse 12 in Frauenfeld. ' +
    'Diese Plattform bündelt alle Projektdokumente – Pläne, Ausschreibungen, ' +
    'Offerten und Werkverträge – und führt Baukostenkontrolle und ' +
    'Leistungsverzeichnisse für die Projektbeteiligten.',
  infoCells: [
    { label: 'Bauherrschaft', value: 'Muster Immobilien AG\nFrauenfeld' },
    { label: 'Baumanagement', value: 'Demo Architektur GmbH\nFrauenfeld' },
    { label: 'Standort', value: 'Musterstrasse 12\n8500 Frauenfeld' },
    { label: 'Termine', value: 'Baustart 01.09.2026\nBezug 30.04.2027' },
  ],
  heroCaptionLeft: 'Visualisierung Nordfassade',
  heroCaptionRight: 'Stand Juli 2026',
  loginSubtext: 'Zugang für Projektbeteiligte',
};

// ---------------------------------------------------------------------------

async function main() {
  console.log(`Demo-Showcase startet (Ziel: ${target === 'prod' ? 'PRODUKTION' : 'Dev'}) …`);

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, name')
    .eq('slug', PROJECT_SLUG)
    .maybeSingle();
  if (projectError) throw projectError;
  if (!project) {
    console.error(`ABBRUCH: Projekt mit Slug «${PROJECT_SLUG}» nicht gefunden.`);
    process.exit(1);
  }
  const projectId = project.id as string;
  console.log(`Projekt: ${project.name} (${projectId})`);

  // --- Kategorien auflösen (müssen existieren – Seed-Standard) ---
  const { data: categories, error: categoriesError } = await supabase
    .from('categories')
    .select('id, key')
    .eq('project_id', projectId);
  if (categoriesError) throw categoriesError;
  const categoryByKey = new Map((categories ?? []).map((c) => [c.key, c.id]));
  const requiredKeys = ['uebersichtsdokumente', 'plaene', 'ausschreibungen', 'offerten', 'werkvertraege'];
  const missing = requiredKeys.filter((k) => !categoryByKey.has(k));
  if (missing.length > 0) {
    console.error(`ABBRUCH: Kategorien fehlen im Demo-Projekt: ${missing.join(', ')}`);
    process.exit(1);
  }

  // --- (e) Landingpage ---
  {
    const { error } = await supabase
      .from('projects')
      .update({ landing: showcaseLanding })
      .eq('id', projectId);
    if (error) throw error;
    console.log('Landingpage: ok');
  }

  // --- (a) Dokumente: Platzhalter-PDF hochladen, Upsert, Fremde entfernen ---
  {
    const showcaseIds: string[] = [];
    const sortByCategory = new Map<string, number>();
    for (const doc of showcaseDocs) {
      const id = uuidOf(`doc:${doc.key}`);
      showcaseIds.push(id);
      // Pfadkonvention {project_id}/{category_key}/{dateiname} – die
      // Storage-Policies prüfen den Kategorie-Schlüssel im zweiten Segment
      const storagePath = `${projectId}/${doc.categoryKey}/demo-${doc.key}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('project-files')
        .upload(storagePath, placeholderPdf(doc.data.title), {
          contentType: 'application/pdf',
          upsert: true,
        });
      if (uploadError) throw new Error(`Upload ${doc.key}: ${uploadError.message}`);

      const sortKey = `${doc.categoryKey}:${doc.parentKey ?? ''}`;
      const sort = sortByCategory.get(sortKey) ?? 0;
      sortByCategory.set(sortKey, sort + 1);
      const { error } = await supabase.from('documents').upsert({
        id,
        project_id: projectId,
        category_id: categoryByKey.get(doc.categoryKey)!,
        parent_id: doc.parentKey ? uuidOf(`doc:${doc.parentKey}`) : null,
        data: doc.data,
        file_path: storagePath,
        external_url: null,
        sort,
      });
      if (error) throw new Error(`Dokument ${doc.key}: ${error.message}`);
    }

    // Showcase-Wiederherstellung: alle übrigen Dokumente des Projekts entfernen
    const { data: stale, error: staleError } = await supabase
      .from('documents')
      .select('id')
      .eq('project_id', projectId);
    if (staleError) throw staleError;
    const staleIds = (stale ?? []).map((d) => d.id).filter((id) => !showcaseIds.includes(id));
    if (staleIds.length > 0) {
      const { error } = await supabase.from('documents').delete().in('id', staleIds);
      if (error) throw error;
    }
    console.log(`Dokumente: ok (${showcaseDocs.length} Showcase, ${staleIds.length} entfernt)`);
  }

  // --- (b) Module aktivieren + Rollen-Freigaben ---
  {
    for (const moduleKey of ['baukostenkontrolle', 'leistungsverzeichnis']) {
      const { error } = await supabase
        .from('project_modules')
        .upsert(
          { project_id: projectId, module_key: moduleKey, enabled: true },
          { onConflict: 'project_id,module_key' },
        );
      if (error) throw error;
    }

    const { data: roles, error: rolesError } = await supabase
      .from('roles')
      .select('id, name')
      .eq('project_id', projectId);
    if (rolesError) throw rolesError;
    const roleByName = new Map((roles ?? []).map((r) => [r.name, r.id]));
    for (const required of ['Bauherr', 'Bauleitung']) {
      if (!roleByName.has(required)) {
        console.error(`ABBRUCH: Rolle «${required}» fehlt im Demo-Projekt.`);
        process.exit(1);
      }
    }
    const grants = [
      { role: 'Bauherr', view: true, edit: false },
      { role: 'Bauleitung', view: true, edit: true },
    ];
    for (const grant of grants) {
      for (const moduleKey of ['baukostenkontrolle', 'leistungsverzeichnis']) {
        const { error } = await supabase.from('role_module_access').upsert(
          {
            role_id: roleByName.get(grant.role)!,
            module_key: moduleKey,
            can_view: grant.view,
            can_edit: grant.edit,
          },
          { onConflict: 'role_id,module_key' },
        );
        if (error) throw error;
      }
    }
    console.log('Module + Freigaben: ok (BKK/LV aktiv · Bauherr Sehen, Bauleitung Bearbeiten)');
  }

  // --- (c) BKK: Gruppen (Merge über Ziffer), Baseline, Positionen, Einträge ---
  {
    const { data: existingGroups, error: groupsError } = await supabase
      .from('bkk_groups')
      .select('id, digit')
      .eq('project_id', projectId);
    if (groupsError) throw groupsError;
    const groupByDigit = new Map((existingGroups ?? []).map((g) => [g.digit, g.id]));
    for (const [index, group] of BKK_DEFAULT_GROUPS.entries()) {
      if (groupByDigit.has(group.digit)) continue;
      const { data: created, error } = await supabase
        .from('bkk_groups')
        .insert({ project_id: projectId, digit: group.digit, name: group.name, sort: index })
        .select('id')
        .single();
      if (error) throw error;
      groupByDigit.set(group.digit, created.id);
    }

    const baselineId = uuidOf(BASELINE.key);
    // Partial-Unique (eine aktive Baseline): zuerst fremde deaktivieren
    const { error: deactivateError } = await supabase
      .from('bkk_baselines')
      .update({ is_active: false })
      .eq('project_id', projectId)
      .neq('id', baselineId);
    if (deactivateError) throw deactivateError;
    const { error: baselineError } = await supabase.from('bkk_baselines').upsert({
      id: baselineId,
      project_id: projectId,
      bezeichnung: BASELINE.bezeichnung,
      datum: BASELINE.datum,
      is_active: true,
    });
    if (baselineError) throw baselineError;

    // Fremde Positionen ZUERST entfernen – der Unique-Index (project_id, bkp)
    // würde sonst mit Alt-Bestand gleicher BKP kollidieren.
    const positionIds = showcasePositions.map((p) => uuidOf(`pos:${p.bkp}`));
    const { data: stalePositions } = await supabase
      .from('bkk_positions')
      .select('id')
      .eq('project_id', projectId);
    const stalePositionIds = (stalePositions ?? [])
      .map((p) => p.id)
      .filter((id) => !positionIds.includes(id));
    if (stalePositionIds.length > 0) {
      const { error } = await supabase.from('bkk_positions').delete().in('id', stalePositionIds);
      if (error) throw error;
    }

    const entryIds: string[] = [];
    for (const [index, position] of showcasePositions.entries()) {
      const positionId = uuidOf(`pos:${position.bkp}`);
      const digit = position.bkp.charAt(0);
      const groupId = groupByDigit.get(digit);
      if (!groupId) throw new Error(`Keine Gruppe für Ziffer ${digit} (BKP ${position.bkp})`);
      const { error } = await supabase.from('bkk_positions').upsert({
        id: positionId,
        project_id: projectId,
        group_id: groupId,
        bkp: position.bkp,
        name: position.name,
        kv_mut_rp: position.kvMutRp ?? null,
        is_custom: true,
        hidden: false,
        notiz: position.notiz ?? null,
        sort: index,
      });
      if (error) throw new Error(`Position ${position.bkp}: ${error.message}`);

      const { error: valueError } = await supabase
        .from('bkk_position_baseline_values')
        .upsert(
          { baseline_id: baselineId, position_id: positionId, kv_rp: position.kvRp },
          { onConflict: 'baseline_id,position_id' },
        );
      if (valueError) throw new Error(`Baseline-Wert ${position.bkp}: ${valueError.message}`);

      for (const entry of position.entries) {
        const entryId = uuidOf(`entry:${entry.key}`);
        entryIds.push(entryId);
        const { error: entryError } = await supabase.from('bkk_entries').upsert({
          id: entryId,
          project_id: projectId,
          position_id: positionId,
          entry_type: entry.type,
          betrag_rp: entry.betragRp,
          datum: entry.datum,
          unternehmer: entry.unternehmer,
          notiz: entry.notiz ?? null,
          source_id: `demo-showcase:${entry.key}`,
        });
        if (entryError) throw new Error(`Eintrag ${entry.key}: ${entryError.message}`);
      }
    }

    // Wiederherstellung: fremde Einträge/Baselines entfernen
    const { data: staleEntries } = await supabase
      .from('bkk_entries')
      .select('id')
      .eq('project_id', projectId);
    const staleEntryIds = (staleEntries ?? [])
      .map((e) => e.id)
      .filter((id) => !entryIds.includes(id));
    if (staleEntryIds.length > 0) {
      const { error } = await supabase.from('bkk_entries').delete().in('id', staleEntryIds);
      if (error) throw error;
    }
    const { error: staleBaselineError } = await supabase
      .from('bkk_baselines')
      .delete()
      .eq('project_id', projectId)
      .neq('id', baselineId);
    if (staleBaselineError) throw staleBaselineError;

    // Selbstprüfung: alle fünf Status-Fälle müssen vorkommen
    const calcRows: BkkPositionWithEntries[] = showcasePositions.map((p) => ({
      position: { bkp: p.bkp, kvBaselineRp: p.kvRp, kvMutRp: p.kvMutRp ?? null, hidden: false },
      entries: p.entries.map((e) => ({ entryType: e.type, betragRp: e.betragRp })),
    }));
    const opts = { round5: true };
    const statuses = new Set(
      calcRows.map((row) => positionStatus(row.position, row.entries, opts)),
    );
    const expectedStatuses: BkkStatus[] = ['offen', 'vertrag', 'teilbezahlt', 'bezahlt', 'ueber_kv'];
    const missingStatuses = expectedStatuses.filter((s) => !statuses.has(s));
    if (missingStatuses.length > 0) {
      console.error(`ABBRUCH: BKK-Status fehlen im Showcase: ${missingStatuses.join(', ')}`);
      process.exit(1);
    }
    const t = totals(calcRows, opts);
    console.log(
      `BKK: ok (${showcasePositions.length} Positionen, ${entryIds.length} Einträge; ` +
        `KV ${formatRappen(t.kvBaselineRp)} · mut. ${formatRappen(t.kvMutRp)} · ` +
        `Verträge ${formatRappen(t.vertragRp)} · Zahlungen ${formatRappen(t.zahlungRp)}; ` +
        `${stalePositionIds.length + staleEntryIds.length} fremde Zeilen entfernt)`,
    );
  }

  // --- (d) LV: Einheiten + Schritte ---
  {
    // Fremde Einheiten ZUERST entfernen (Unique-Index analog BKK)
    const unitIds = showcaseUnits.map((u) => uuidOf(`unit:${u.bkp}`));
    const { data: staleUnits } = await supabase
      .from('lv_units')
      .select('id')
      .eq('project_id', projectId);
    const staleUnitIds = (staleUnits ?? [])
      .map((u) => u.id)
      .filter((id) => !unitIds.includes(id));
    if (staleUnitIds.length > 0) {
      const { error } = await supabase.from('lv_units').delete().in('id', staleUnitIds);
      if (error) throw error;
    }

    for (const [index, unit] of showcaseUnits.entries()) {
      const unitId = uuidOf(`unit:${unit.bkp}`);
      const { error } = await supabase.from('lv_units').upsert({
        id: unitId,
        project_id: projectId,
        bkp: unit.bkp,
        name: unit.name,
        is_custom: true,
        hidden: false,
        werkvertrag_document_id: unit.werkvertragDocKey
          ? uuidOf(`doc:${unit.werkvertragDocKey}`)
          : null,
        sort: index,
      });
      if (error) throw new Error(`Einheit ${unit.bkp}: ${error.message}`);

      // Schritte deterministisch: bestehende löschen, definierte einfügen
      const { error: deleteStepsError } = await supabase
        .from('lv_unit_steps')
        .delete()
        .eq('unit_id', unitId);
      if (deleteStepsError) throw deleteStepsError;
      const stepRows = Object.entries(unit.steps).map(([stepKey, value]) => ({
        unit_id: unitId,
        step_key: stepKey,
        datum: value.datum ?? null,
        freitext: value.freitext ?? null,
      }));
      if (stepRows.length > 0) {
        const { error: stepsError } = await supabase.from('lv_unit_steps').insert(stepRows);
        if (stepsError) throw new Error(`Schritte ${unit.bkp}: ${stepsError.message}`);
      }
    }

    // Selbstprüfung: alle vier Stände müssen vorkommen
    const states = new Set(
      showcaseUnits.map((unit) => {
        const map: LvUnitStepMap = {};
        for (const [key, value] of Object.entries(unit.steps)) {
          map[key as LvStepKey] = { datum: value.datum ?? null, freitext: value.freitext ?? null };
        }
        return unitStatus(map).kind;
      }),
    );
    const expectedStates: ReturnType<typeof unitStatus>['kind'][] = [
      'offen',
      'in_arbeit',
      'abgeschlossen',
      'nach_aufwand',
    ];
    const missingStates = expectedStates.filter((s) => !states.has(s));
    if (missingStates.length > 0) {
      console.error(`ABBRUCH: LV-Stände fehlen im Showcase: ${missingStates.join(', ')}`);
      process.exit(1);
    }
    console.log(
      `LV: ok (${showcaseUnits.length} Einheiten; Stände: ${[...states].join(', ')}; ` +
        `${staleUnitIds.length} fremde Einheiten entfernt)`,
    );
  }

  // --- (f) Demo-Besucherkonto (Sehen via Rolle Bauherr) ---
  {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: DEMO_USER_EMAIL,
      password: DEMO_USER_PASSWORD,
      email_confirm: true,
    });
    let userId = created?.user?.id;
    if (error) {
      const { data: list, error: listError } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (listError) throw listError;
      const existing = list.users.find(
        (u) => u.email?.toLowerCase() === DEMO_USER_EMAIL,
      );
      if (!existing) throw error;
      userId = existing.id;
      const { error: pwError } = await supabase.auth.admin.updateUserById(userId, {
        password: DEMO_USER_PASSWORD,
      });
      if (pwError) throw pwError;
    }

    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id')
      .eq('project_id', projectId)
      .eq('name', 'Bauherr')
      .single();
    if (roleError) throw roleError;
    const { error: memberError } = await supabase.from('project_members').upsert(
      {
        user_id: userId!,
        project_id: projectId,
        role_id: role.id,
        is_project_admin: false,
      },
      { onConflict: 'user_id,project_id' },
    );
    if (memberError) throw memberError;
    console.log(`Demo-Konto: ok (${DEMO_USER_EMAIL}, Rolle Bauherr/Sehen)`);
  }

  console.log('\nDemo-Showcase abgeschlossen – Zustand wiederhergestellt.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

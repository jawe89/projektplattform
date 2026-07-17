/**
 * M4 – Migration Wattwil: importiert das JSON aus der bestehenden
 * Projektübersicht-HTML (script-Tag id="project-data") als documents
 * mit external_url ins Projekt «mcd-wattwil».
 *
 *  * Abschnitte → gleichnamige Seed-Kategorien
 *  * icon/title/sub → data (plus sourceId als Idempotenz-Referenz)
 *  * url → external_url (keine Dateien in den Storage; relative URLs werden
 *    gegen die bestehende Projekt-Domain absolutiert, Links bleiben gültig)
 *  * Quell-Reihenfolge → sort
 *  * planbeilagen der Ausschreibungen → Kind-Dokumente (parent_id)
 *
 * Idempotent: Dokument-IDs werden deterministisch aus den Quell-IDs
 * («u001», «w005», …) abgeleitet – mehrfaches Ausführen aktualisiert statt
 * dupliziert. Test-Dokumente ohne sourceId (aus M2) werden vorher entfernt.
 *
 * Aufruf: npm run import:wattwil
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Fehlende Umgebungsvariablen: NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY in .env.local setzen.',
  );
  process.exit(1);
}

const SOURCE_FILE =
  'scripts/data/mcdonalds-wattwil-projektuebersicht_2026-07-16-18-40.html';
const PROJECT_SLUG = 'mcd-wattwil';
/** Bestehende Domain für relative Quell-URLs (Links bleiben gültig). */
const LEGACY_ORIGIN = 'https://www.bauinnovation-mcdonalds-wattwil.ch';

const SECTION_KEYS = [
  'uebersichtsdokumente',
  'plaene',
  'ausschreibungen',
  'offerten',
  'werkvertraege',
] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

interface SourceChild {
  id: string;
  title: string;
  url?: string;
}

interface SourceItem {
  id: string;
  icon?: string;
  title: string;
  sub?: string;
  url?: string;
  planbeilagen?: SourceChild[];
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Deterministische UUID aus der Quell-ID (Idempotenz ohne Lookup). */
function deterministicUuid(reference: string): string {
  const hash = createHash('sha1')
    .update(`mcd-wattwil-import:${reference}`)
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

function absoluteUrl(url: string | undefined): string | null {
  if (!url) return null;
  return url.startsWith('/') ? `${LEGACY_ORIGIN}${url}` : url;
}

function extractSourceData(): Record<SectionKey, SourceItem[]> {
  const html = readFileSync(SOURCE_FILE, 'utf8');
  const match = html.match(
    /<script[^>]*id="project-data"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!match) {
    throw new Error('script-Tag id="project-data" nicht gefunden.');
  }
  const data = JSON.parse(match[1]) as Record<SectionKey, SourceItem[]>;
  for (const key of SECTION_KEYS) {
    if (!Array.isArray(data[key])) {
      throw new Error(`Abschnitt «${key}» fehlt im Quell-JSON.`);
    }
  }
  return data;
}

interface DocumentRow {
  id: string;
  project_id: string;
  category_id: string;
  parent_id: string | null;
  data: Record<string, string>;
  file_path: null;
  external_url: string | null;
  sort: number;
}

async function main() {
  console.log(`Import startet … Quelle: ${SOURCE_FILE}`);
  const source = extractSourceData();

  // Projekt und Kategorien auflösen
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', PROJECT_SLUG)
    .single();
  if (projectError || !project) {
    throw new Error(`Projekt «${PROJECT_SLUG}» nicht gefunden – zuerst npm run seed.`);
  }
  const projectId = project.id as string;

  const { data: categories, error: categoriesError } = await supabase
    .from('categories')
    .select('id, key')
    .eq('project_id', projectId);
  if (categoriesError) throw categoriesError;
  const categoryIdByKey = new Map(
    (categories ?? []).map((c) => [c.key as SectionKey, c.id as string]),
  );
  for (const key of SECTION_KEYS) {
    if (!categoryIdByKey.has(key)) {
      throw new Error(`Kategorie «${key}» fehlt im Projekt – zuerst npm run seed.`);
    }
  }

  // M2-Testdokumente (ohne sourceId) bereinigen
  const { data: removed, error: cleanupError } = await supabase
    .from('documents')
    .delete()
    .eq('project_id', projectId)
    .is('data->>sourceId', null)
    .select('id');
  if (cleanupError) throw cleanupError;
  console.log(`Bereinigt: ${removed?.length ?? 0} Test-Dokumente ohne sourceId.`);

  // Zeilen aufbauen (Quell-Reihenfolge = sort)
  const rows: DocumentRow[] = [];
  for (const sectionKey of SECTION_KEYS) {
    const categoryId = categoryIdByKey.get(sectionKey)!;
    source[sectionKey].forEach((item, index) => {
      const parentUuid = deterministicUuid(`${sectionKey}:${item.id}`);
      rows.push({
        id: parentUuid,
        project_id: projectId,
        category_id: categoryId,
        parent_id: null,
        data: {
          icon: item.icon ?? '',
          title: item.title,
          sub: item.sub ?? '',
          sourceId: item.id,
        },
        file_path: null,
        external_url: absoluteUrl(item.url),
        sort: index,
      });
      (item.planbeilagen ?? []).forEach((child, childIndex) => {
        rows.push({
          id: deterministicUuid(`${sectionKey}:${item.id}:${child.id}`),
          project_id: projectId,
          category_id: categoryId,
          parent_id: parentUuid,
          data: { icon: '', title: child.title, sub: '', sourceId: child.id },
          file_path: null,
          external_url: absoluteUrl(child.url),
          sort: childIndex,
        });
      });
    });
  }

  const { error: upsertError } = await supabase.from('documents').upsert(rows);
  if (upsertError) throw upsertError;
  console.log(`Importiert/aktualisiert: ${rows.length} documents.`);

  // -------------------------------------------------------------------------
  // Validierung: Quell-JSON gegen Datenbank, pro Abschnitt inkl. Unterpositionen
  // -------------------------------------------------------------------------
  console.log('\nAbgleich Quell-JSON ↔ documents:');
  console.log(
    'Abschnitt              | Quelle (Haupt/Unter) | DB (Haupt/Unter) | OK',
  );
  console.log(
    '-----------------------+----------------------+------------------+---',
  );

  let mismatch = false;
  for (const sectionKey of SECTION_KEYS) {
    const categoryId = categoryIdByKey.get(sectionKey)!;
    const sourceMain = source[sectionKey].length;
    const sourceChildren = source[sectionKey].reduce(
      (sum, item) => sum + (item.planbeilagen?.length ?? 0),
      0,
    );

    const { count: dbMain } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId)
      .is('parent_id', null);
    const { count: dbChildren } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId)
      .not('parent_id', 'is', null);

    const ok = dbMain === sourceMain && dbChildren === sourceChildren;
    if (!ok) mismatch = true;
    console.log(
      `${sectionKey.padEnd(22)} | ${String(sourceMain).padStart(5)} / ${String(sourceChildren).padStart(5)}        | ${String(dbMain).padStart(5)} / ${String(dbChildren).padStart(4)}     | ${ok ? '✓' : '✗ ABWEICHUNG'}`,
    );
  }

  if (mismatch) {
    console.error('\nImport fehlgeschlagen: Abgleich weist Abweichungen aus.');
    process.exit(1);
  }
  console.log('\nImport abgeschlossen – alle Abschnitte stimmen überein.');
}

main().catch((err) => {
  console.error('Import fehlgeschlagen:', err);
  process.exit(1);
});

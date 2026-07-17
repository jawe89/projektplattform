/**
 * M5 – Datei-Migration Wattwil: lädt alle documents mit external_url auf der
 * Projekt-Domain vom alten Server (Basic-Auth aus env LEGACY_BASIC_AUTH),
 * legt sie unter {project_id}/{category_key}/… im privaten Bucket
 * «project-files» ab, setzt file_path und leert external_url.
 *
 * Ausnahmen: die zwei Live-HTML-Dokumente (Baukostenkontrolle,
 * Leistungsverzeichnis) werden NICHT migriert – ihre URLs werden auf
 * https://tools.bauinnovation-mcdonalds-wattwil.ch/… umgeschrieben.
 *
 * Idempotent: bereits migrierte Dokumente (file_path gesetzt / external_url
 * nicht mehr auf der Alt-Domain) werden übersprungen.
 *
 * Aufruf:  npm run migrate:wattwil            (echte Migration)
 *          DRY_RUN=1 npm run migrate:wattwil  (nur anzeigen, nichts schreiben)
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const legacyBasicAuth = process.env.LEGACY_BASIC_AUTH; // Format: benutzer:passwort
const dryRun = process.env.DRY_RUN === '1';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen in .env.local.');
  process.exit(1);
}
if (!legacyBasicAuth && !dryRun) {
  console.error(
    'LEGACY_BASIC_AUTH fehlt in .env.local (Format «benutzer:passwort» – die ' +
      'Basic-Auth-Zugangsdaten des bestehenden Webservers).',
  );
  process.exit(1);
}

const PROJECT_SLUG = 'mcd-wattwil';
const LEGACY_HOSTS = new Set([
  'bauinnovation-mcdonalds-wattwil.ch',
  'www.bauinnovation-mcdonalds-wattwil.ch',
]);
const TOOLS_ORIGIN = 'https://tools.bauinnovation-mcdonalds-wattwil.ch';
/** Live-HTML-Tools: bleiben extern, ziehen auf die tools.-Subdomain um. */
const LIVE_HTML_FILES = new Set([
  'verkehr-leistungsverzeichnis-mcd-wattwil.html',
  'baukostenkontrolle-mcd-wattwil.html',
]);

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface DocRow {
  id: string;
  category_id: string;
  external_url: string | null;
  file_path: string | null;
  data: Record<string, string>;
}

interface CategoryStats {
  migrated: number;
  rewritten: number;
  skipped: number;
  errors: number;
  bytes: number;
}

function sanitizeFileName(name: string): string {
  return decodeURIComponent(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(-100);
}

/** Grobe Plausibilisierung: HTML-Antwort für Nicht-HTML-Dateien = Loginseite/Fehler. */
function contentTypePlausible(contentType: string, fileName: string): boolean {
  const isHtmlFile = /\.html?$/i.test(fileName);
  const isHtmlResponse = contentType.toLowerCase().includes('text/html');
  return isHtmlFile || !isHtmlResponse;
}

async function main() {
  console.log(`Datei-Migration startet …${dryRun ? ' (DRY RUN – keine Änderungen)' : ''}`);

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', PROJECT_SLUG)
    .single();
  if (projectError || !project) throw new Error(`Projekt «${PROJECT_SLUG}» nicht gefunden.`);
  const projectId = project.id as string;

  const { data: categories } = await supabase
    .from('categories')
    .select('id, key')
    .eq('project_id', projectId);
  const categoryKeyById = new Map(
    (categories ?? []).map((c) => [c.id as string, c.key as string]),
  );

  const { data: docs, error: docsError } = await supabase
    .from('documents')
    .select('id, category_id, external_url, file_path, data')
    .eq('project_id', projectId)
    .not('external_url', 'is', null)
    .order('sort')
    .returns<DocRow[]>();
  if (docsError) throw docsError;

  const stats = new Map<string, CategoryStats>();
  const errors: string[] = [];
  const statFor = (key: string): CategoryStats => {
    if (!stats.has(key)) {
      stats.set(key, { migrated: 0, rewritten: 0, skipped: 0, errors: 0, bytes: 0 });
    }
    return stats.get(key)!;
  };

  const authHeader = legacyBasicAuth
    ? `Basic ${Buffer.from(legacyBasicAuth).toString('base64')}`
    : '';

  for (const doc of docs ?? []) {
    const categoryKey = categoryKeyById.get(doc.category_id) ?? 'unbekannt';
    const stat = statFor(categoryKey);
    const title = doc.data.title ?? doc.id;

    let url: URL;
    try {
      url = new URL(doc.external_url!);
    } catch {
      stat.errors += 1;
      errors.push(`${title}: ungültige URL «${doc.external_url}»`);
      continue;
    }

    // Fremde Domains (z.B. bereits umgeschriebene tools.-URLs): überspringen
    if (!LEGACY_HOSTS.has(url.hostname)) {
      stat.skipped += 1;
      continue;
    }

    const baseName = url.pathname.split('/').pop() ?? '';

    // Live-HTML-Tools: URL auf tools.-Subdomain umschreiben, nicht migrieren
    if (LIVE_HTML_FILES.has(baseName)) {
      const target = `${TOOLS_ORIGIN}/${baseName}`;
      if (doc.external_url !== target) {
        console.log(`  Live-HTML: «${title}» → ${target}`);
        if (!dryRun) {
          const { error } = await supabase
            .from('documents')
            .update({ external_url: target })
            .eq('id', doc.id);
          if (error) {
            stat.errors += 1;
            errors.push(`${title}: URL-Umschreibung fehlgeschlagen (${error.message})`);
            continue;
          }
        }
        stat.rewritten += 1;
      } else {
        stat.skipped += 1;
      }
      continue;
    }

    // Bereits migriert (sollte durch external_url-Filter nicht vorkommen)
    if (doc.file_path) {
      stat.skipped += 1;
      continue;
    }

    const storagePath = `${projectId}/${categoryKey}/${doc.id.slice(0, 8)}-${sanitizeFileName(baseName)}`;
    if (dryRun) {
      console.log(`  Würde migrieren: «${title}» → ${storagePath}`);
      stat.migrated += 1;
      continue;
    }

    try {
      const response = await fetch(doc.external_url!, {
        headers: { Authorization: authHeader },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const contentType =
        response.headers.get('content-type') ?? 'application/octet-stream';
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength === 0) {
        throw new Error('0 Bytes heruntergeladen');
      }
      if (!contentTypePlausible(contentType, baseName)) {
        throw new Error(
          `unplausibler Content-Type «${contentType}» (vermutlich Fehler-/Loginseite)`,
        );
      }

      const { error: uploadError } = await supabase.storage
        .from('project-files')
        .upload(storagePath, buffer, { contentType, upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      const { error: updateError } = await supabase
        .from('documents')
        .update({ file_path: storagePath, external_url: null })
        .eq('id', doc.id);
      if (updateError) throw new Error(updateError.message);

      stat.migrated += 1;
      stat.bytes += buffer.byteLength;
      console.log(
        `  ✓ ${categoryKey}: «${title}» (${(buffer.byteLength / 1024).toFixed(0)} KB, ${contentType})`,
      );
    } catch (err) {
      stat.errors += 1;
      errors.push(`${title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ---------------------------------------------------------------------------
  console.log('\nAbgleich Datei-Migration:');
  console.log('Kategorie              | migriert | Live-HTML | übersprungen | Fehler | MB');
  console.log('-----------------------+----------+-----------+--------------+--------+------');
  let totalErrors = 0;
  for (const [key, stat] of [...stats.entries()].sort()) {
    totalErrors += stat.errors;
    console.log(
      `${key.padEnd(22)} | ${String(stat.migrated).padStart(8)} | ${String(stat.rewritten).padStart(9)} | ${String(stat.skipped).padStart(12)} | ${String(stat.errors).padStart(6)} | ${(stat.bytes / 1024 / 1024).toFixed(1).padStart(5)}`,
    );
  }

  // Restbestand prüfen: keine Alt-Domain-URLs mehr übrig?
  if (!dryRun) {
    const { data: remaining } = await supabase
      .from('documents')
      .select('id, external_url, data')
      .eq('project_id', projectId)
      .not('external_url', 'is', null)
      .returns<DocRow[]>();
    const leftover = (remaining ?? []).filter((d) => {
      try {
        return LEGACY_HOSTS.has(new URL(d.external_url!).hostname);
      } catch {
        return true;
      }
    });
    console.log(
      `\nVerbleibende Alt-Domain-URLs: ${leftover.length} (Soll: 0 – Live-HTML zeigt auf tools.*)`,
    );
    if (leftover.length > 0) totalErrors += leftover.length;
  }

  if (errors.length > 0) {
    console.error('\nFehlerliste:');
    for (const line of errors) console.error(`  ✗ ${line}`);
  }
  if (totalErrors > 0) {
    console.error('\nMigration mit Fehlern beendet.');
    process.exit(1);
  }
  console.log('\nDatei-Migration abgeschlossen.');
}

main().catch((err) => {
  console.error('Migration fehlgeschlagen:', err);
  process.exit(1);
});

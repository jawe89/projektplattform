/**
 * Umgebungs-Loader für alle Skripte (P2-M0).
 *
 * Standard: Dev-Umgebung aus `.env.local`.
 * Produktion NUR mit expliziter Kennzeichnung: TARGET=prod → `.env.prod.local`.
 *
 *   PowerShell:  $env:TARGET='prod'; npm run <skript>
 *   Bash:        TARGET=prod npm run <skript>
 *
 * Sicherungen:
 *  * Dev-Lauf gegen die Produktiv-DB wird erkannt und abgebrochen
 *    (Projekt-Ref-Prüfung) – schützt vor einer .env.local, die noch auf
 *    Produktion zeigt.
 *  * Prod-Lauf gegen eine fremde DB wird ebenfalls abgebrochen.
 */
import { config } from 'dotenv';

/** Projekt-Ref der Produktiv-Datenbank (supabase.co-Subdomain). */
const PROD_PROJECT_REF = 'vjtkrsosmhtrcjnarnph';

export type ScriptTarget = 'dev' | 'prod';

export function loadScriptEnv(): ScriptTarget {
  const target: ScriptTarget = process.env.TARGET === 'prod' ? 'prod' : 'dev';
  const file = target === 'prod' ? '.env.prod.local' : '.env.local';

  const result = config({ path: file, override: true });
  if (result.error) {
    console.error(
      `ABBRUCH: ${file} nicht gefunden.\n` +
        (target === 'prod'
          ? 'Die Produktiv-Keys gehören nach .env.prod.local (siehe docs/DEV-UMGEBUNG.md).'
          : 'Die Dev-Keys gehören nach .env.local (siehe docs/DEV-UMGEBUNG.md).'),
    );
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (target === 'dev' && url.includes(PROD_PROJECT_REF)) {
    console.error(
      'ABBRUCH: .env.local zeigt auf die PRODUKTIV-Datenbank!\n' +
        'Lokal gehört die Dev-Umgebung in .env.local, die Produktiv-Keys nach\n' +
        '.env.prod.local (Anleitung: docs/DEV-UMGEBUNG.md). Skripte gegen\n' +
        'Produktion laufen nur mit expliziter Kennzeichnung TARGET=prod.',
    );
    process.exit(1);
  }
  if (target === 'prod' && !url.includes(PROD_PROJECT_REF)) {
    console.error(
      'ABBRUCH: .env.prod.local zeigt nicht auf die erwartete Produktiv-Datenbank.',
    );
    process.exit(1);
  }

  console.log(
    target === 'prod'
      ? `⚠ Ziel-Umgebung: PRODUKTION (${file})`
      : `Ziel-Umgebung: Dev (${file})`,
  );
  return target;
}

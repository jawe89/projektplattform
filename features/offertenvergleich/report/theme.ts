/**
 * Report-Theme des Moduls Offertenvergleich (O-M1).
 *
 * Projekt-CI (Farben, Firmenzeile) kommt zur Renderzeit aus
 * project_branding/landing (ReportBrand); fix und tenant-unabhängig sind
 * nur die Vergleichs-Bedeutungsfarben (Grün = günstigster, Orange =
 * teuerster) und Warn-Orange – analog zu den fixen Statusfarben der
 * Module (docs/OFFERTENVERGLEICH-O-M0.md, Abschnitt b).
 *
 * Schriften: statische TTF-Instanzen von Antonio/Montserrat (Google
 * Fonts, dieselben Schriften wie das UI) unter ./fonts, eingebettet über
 * Font.register – WeasyPrint-Ersatz gemäss O-M0-Entscheid.
 */
import path from 'node:path';
import { Font } from '@react-pdf/renderer';

/** Fixe Bedeutungsfarben des Preisvergleichs (nicht tenant-abhängig) */
export const COMPARE_COLORS = {
  guenstigster: '#70ad47',
  guenstigsterTint: '#f1f7ea',
  teuerster: '#e67e22',
  teuersterTint: '#fdf2e7',
  warn: '#e67e22',
  kritisch: '#c0392b',
} as const;

/** Projekt-CI für den Report (aus project_branding/projects geladen) */
export interface ReportBrand {
  managementName: string;
  managementSuffix: string | null;
  /** Fusszeile, z.B. «Walzmühlestrasse 49 · 8500 Frauenfeld» */
  managementAddress: string | null;
  colors: {
    primary: string;
    primaryDark: string;
    accent: string;
    line: string;
    bg: string;
    ink: string;
  };
}

const fontDir = path.join(
  process.cwd(),
  'features/offertenvergleich/report/fonts',
);

let registered = false;

/** Schriften einmalig registrieren (idempotent, vor jedem Render aufrufbar) */
export function registerReportFonts(): void {
  if (registered) return;
  registered = true;

  Font.register({
    family: 'Antonio',
    fonts: [
      { src: path.join(fontDir, 'Antonio-400.ttf'), fontWeight: 400 },
      { src: path.join(fontDir, 'Antonio-500.ttf'), fontWeight: 500 },
      { src: path.join(fontDir, 'Antonio-600.ttf'), fontWeight: 600 },
    ],
  });
  Font.register({
    family: 'Montserrat',
    fonts: [
      { src: path.join(fontDir, 'Montserrat-400.ttf'), fontWeight: 400 },
      { src: path.join(fontDir, 'Montserrat-500.ttf'), fontWeight: 500 },
      { src: path.join(fontDir, 'Montserrat-600.ttf'), fontWeight: 600 },
      { src: path.join(fontDir, 'Montserrat-700.ttf'), fontWeight: 700 },
    ],
  });

  // Keine automatische Silbentrennung – deutsche Fachbegriffe würden
  // sonst an unpassenden Stellen umbrochen
  Font.registerHyphenationCallback((word) => [word]);
}

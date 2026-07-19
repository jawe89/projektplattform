/**
 * O-M1 Layout-Probe (Auflage aus der O-M0-Freigabe): rendert Titelblock,
 * Bieter-Karten, farbcodierte Differenzen-Tabelle und Erkenntnis-Boxen des
 * 211er-Referenzberichts mit @react-pdf/renderer nach
 * docs/ov-report-probe.pdf – zur Sichtabnahme, bevor die restliche
 * Pipeline gebaut wird. Beispieldaten und Texte stammen aus
 * scripts/data/offertenvergleich/MCD_239_Positionenvergleich_BKP_211_…pdf;
 * CI-Werte sind die Wattwil-Brandingwerte (später aus project_branding).
 *
 * Aufruf: npx tsx scripts/ov-report-probe.tsx
 */
import React from 'react';
import { renderToFile } from '@react-pdf/renderer';
import {
  ReportDocument,
  type ReportProps,
} from '../features/offertenvergleich/report/report-document';
import {
  COMPARE_COLORS,
  registerReportFonts,
  type ReportBrand,
} from '../features/offertenvergleich/report/theme';

const brand: ReportBrand = {
  managementName: 'Bau Innovation GmbH',
  managementSuffix: 'Baumanagement',
  managementAddress: 'Walzmühlestrasse 49 · 8500 Frauenfeld',
  colors: {
    primary: '#7c7c7c',
    primaryDark: '#5a5a5a',
    accent: '#70ad47',
    line: '#e5e5e5',
    bg: '#f6f6f4',
    ink: '#2b2b2b',
  },
};

const props: ReportProps = {
  brand,
  meta: {
    bkp: '211',
    gattung: 'Baumeisterarbeiten + Baugrube',
    projectNo: 'MCD_239',
    bauvorhaben: ["Neubau McDonald's", 'Rietwisstrasse', '9630 Wattwil'],
    lvNummer: '21100',
    stand: '22.05.2026',
  },
  bieter: [
    { name: 'Vetter AG', ort: '9506 Lommis', telefon: '+41 52 369 45 45' },
    { name: 'E. Weber AG', ort: '9630 Wattwil', telefon: '+41 71 987 59 10' },
    { name: 'Oberhänsli Bau AG', ort: '9607 Mosnang', telefon: '+41 71 982 88 66' },
  ],
  quelleLabel: 'Preise aus: Positionenvergleich (BauPlus)',
  diffBlocks: [
    {
      titel: 'Regiearbeiten · Stundenansätze (10 h Vergleichsmenge)',
      rows: [
        {
          npk: '111.112.001',
          bezeichnung: 'Aufsichtsperson',
          mengeLabel: '10 h',
          werteRp: [136000, 108000, 115050],
        },
        {
          npk: '111.112.002',
          bezeichnung: 'Fachspezialist',
          mengeLabel: '10 h',
          werteRp: [108000, 97000, 101950],
        },
        {
          npk: '111.112.004',
          bezeichnung: 'Hilfsperson',
          mengeLabel: '10 h',
          werteRp: [93000, 83000, 77000],
        },
      ],
    },
    {
      titel: 'Baustelleneinrichtung · Krananlage',
      rows: [
        {
          npk: '113.111.001',
          bezeichnung: 'Gesamte Baustelleneinrichtung',
          mengeLabel: '1 gl',
          werteRp: [19140000, 1000000, 3500000],
        },
        {
          npk: '113.111.002',
          bezeichnung: 'Zusätzliche Installationen',
          mengeLabel: '1 LE',
          werteRp: [null, 1900000, 100],
        },
        {
          npk: '113.512.111',
          bezeichnung: 'Stationärer Kran (1 Stk)',
          mengeLabel: '1 gl · Anzahl 1',
          werteRp: [100, 1700000, 1200000],
        },
      ],
    },
    {
      titel: 'Entsorgung · Transporte (Hot Spot der Vergleichbarkeit)',
      rows: [
        {
          npk: '211.711.222',
          bezeichnung: 'Entsorgung Typ E, Transport',
          mengeLabel: "2'200 m³",
          werteRp: [50160000, 14047000, 41745000],
        },
        {
          npk: '211.751.116',
          bezeichnung: 'Gebühren Typ E',
          mengeLabel: "2'200 m³",
          werteRp: [220000, 86614000, 41745000],
        },
        {
          npk: '211.512.102',
          bezeichnung: 'Schüttmaterial Sand-Kies-Gemisch',
          mengeLabel: "2'050 m³",
          werteRp: [2460000, -2050000, 6221750],
        },
        {
          npk: '211.751.111',
          bezeichnung: 'Oberboden Lagerung',
          mengeLabel: '650 m³',
          werteRp: [65000, -1310400, 18824000],
        },
      ],
    },
  ],
  erkenntnisse: [
    {
      titel: 'Vorsicht beim direkten Vergleich der Entsorgungspositionen',
      tag: 'Kritisch',
      tagColor: COMPARE_COLORS.kritisch,
      text:
        'Die drei Anbieter verteilen die Entsorgungskosten sehr unterschiedlich auf «Transport» (Pos. 711.xxx) und «Gebühren» (Pos. 751.xxx). Ein Vergleich einer einzelnen Position führt deshalb zu falschen Schlüssen. Die Summe beider Positionen zeigt das tatsächliche Bild:',
      bullets: [
        "Entsorgung Typ E (Pos. 711.222 + 751.116): Vetter ca. 503'800 · Weber ca. 1'006'610 · Oberhänsli ca. 834'900",
        'In der Summe ist Vetter beim heikelsten Kostenblock dieser Ausschreibung mit Abstand am günstigsten – das Gegenteil dessen, was eine isolierte Betrachtung einzelner Positionen suggerieren würde.',
      ],
    },
    {
      titel: 'Baustelleneinrichtung – auffälliger Ausreisser bei Vetter',
      tag: 'Hot Spot',
      tagColor: COMPARE_COLORS.warn,
      text:
        "Die Position 113.111.001 (Gesamte Baustelleneinrichtung) zeigt mit 191'400 CHF bei Vetter gegenüber 10'000 (Weber) und 35'000 (Oberhänsli) den grössten Einzel-Ausreisser des LV. Vetter hat dafür die Position «Stationärer Kran» (113.512.111) mit nur 1.00 CHF kalkuliert – der Kran ist offensichtlich in der allgemeinen Baustelleneinrichtung enthalten; auch hier ist die Summenbetrachtung der korrekte Vergleich (Vetter ca. 191'401, Weber ca. 46'000, Oberhänsli ca. 47'001).",
      bullets: [],
    },
    {
      titel: 'Negative Preise und Pseudo-Positionen bei E. Weber',
      tag: 'Plausibilität prüfen',
      tagColor: COMPARE_COLORS.warn,
      text:
        "E. Weber hat in mindestens zwei Positionen negative Beträge eingesetzt: Schüttmaterial Pos. 211.512.102 mit −20'500 CHF und Oberboden-Lagerung Pos. 211.751.111 mit −13'104 CHF. Negative Einheitspreise sind ein klassisches Signal für Umverteilungen zwischen Positionen und müssen vor Vergabe geklärt werden, da bei Mengenänderungen unkontrollierte Effekte entstehen.",
      bullets: [],
    },
  ],
};

async function main() {
  registerReportFonts();
  const outPath = 'docs/ov-report-probe.pdf';
  await renderToFile(<ReportDocument {...props} />, outPath);
  console.log(`Layout-Probe gerendert: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

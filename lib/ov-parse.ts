/**
 * Deterministischer Parser für BauPlus-Positionenvergleich-PDFs (O-M1).
 *
 * Grundlage: Struktur-Bericht docs/OFFERTENVERGLEICH-O-M0.md (a) –
 * digitaler Textlayer, festes Preiszeilenmuster, NPK-Hierarchie als
 * Kontextzustand (Kapitel über die Einrückung, Gruppen, .NNN-Positionen).
 * Bewusst KEIN LLM: Die Matrix muss reproduzierbar und rappengenau sein;
 * tests/ov-parse.test.ts prüft gegen die echten Beispiel-PDFs (BKP 211:
 * 191 Preiszeilen, Summen deckungsgleich mit den Offerten-Endbeträgen).
 *
 * Format-Eigenheiten (siehe O-M0): Apostroph U+2019, «inkl.» (Marker I),
 * Mengen mit 2–3 Nachkommastellen, negative Preise, variable Bieter-
 * Spaltenreihenfolge (immer aus dem Kopf gelesen), keine Totalzeilen.
 */
// Reihenfolge zwingend: Zuerst DOMMatrix/Path2D-Polyfills setzen –
// pdf.mjs referenziert DOMMatrix auf Modulebene und crasht sonst in
// Serverless-Functions ohne @napi-rs/canvas (Vercel).
import './pdf-polyfills';
// Worker statisch registrieren (setzt globalThis.pdfjsWorker) – der
// dynamische Fake-Worker-Import scheitert sonst im Next-Bundling
import 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface OvParsedBieter {
  name: string;
  ort: string;
  telefon: string;
}

export interface OvParsedPosition {
  /** Volle NPK-Nummer «Kapitel.Gruppe.Pos», z.B. '211.711.222' */
  npk: string;
  kapitel: string;
  gruppe: string;
  bezeichnung: string;
  /** null = per-Position («per St»): keine ausgeschriebene Menge */
  menge: number | null;
  einheit: string;
  /** Beträge in Rappen je Bieter (Reihenfolge = bieter[]); null = «inkl.» */
  werteRp: (number | null)[];
}

export interface OvParseResult {
  meta: {
    projektzeile: string; // 'Neubau McDonalds, Wattwil'
    projectNo: string;    // 'MCD_239'
    bkp: string;          // '211'
    titel: string;        // 'Baumeisterarbeiten + Baugrube'
    lvNummer: string;     // '21100'
    datum: string | null; // ISO (YYYY-MM-DD) oder null
  };
  bieter: OvParsedBieter[];
  positionen: OvParsedPosition[];
  /** Zeilen mit LV-Präfix, die NICHT dem Preismuster entsprechen (hart) */
  unparsedLines: string[];
  /** Nicht-fatale Auffälligkeiten (z.B. doppelte NPK-Nummern) */
  warnings: string[];
  /** Positionssumme je Bieter in Rappen (für den Summen-Abgleich) */
  summenRp: number[];
  seiten: number;
}

interface Line {
  y: number;
  text: string;
  tokens: { str: string; x: number }[];
}

const PRICE_TOKEN = /^(?:-?[\d’']+\.\d{2}|inkl\.)$/;

function toRappen(token: string): number {
  const cleaned = token.replace(/[’']/g, '');
  return Math.round(parseFloat(cleaned) * 100);
}

function parseMenge(token: string): number {
  return parseFloat(token.replace(/[’']/g, ''));
}

/**
 * Werte-Teil einer Preiszeile auswerten (exportiert für Unit-Tests).
 *
 * Normalfall: Mengen-Token numerisch, rest = «<Betrag|inkl.> <A|I>» je
 * Bieter. per-Positionen («271.1 - W per St A A A», BKP-271-Format):
 * Mengen-Token 'per', keine ausgeschriebene Menge, rest besteht nur aus
 * Markern ohne Beträge → menge null, alle Werte null (zählen 0, werden
 * wie «inkl.» geflaggt). Eine per-Zeile MIT Beträgen bleibt bewusst
 * unparsebar (harte Selbstprüfung), bis die Semantik an einem echten
 * Beispiel geklärt ist – EP ohne Menge dürfte nie in die Totale zählen.
 */
export function parsePreiszeilenWerte(
  mengeToken: string,
  rest: string,
  bieterCount: number,
): { menge: number | null; werteRp: (number | null)[] } | null {
  if (mengeToken === 'per') {
    const marker = rest.trim().split(/\s+/).filter(Boolean);
    if (
      marker.length === bieterCount &&
      marker.every((m) => m === 'A' || m === 'I')
    ) {
      return { menge: null, werteRp: marker.map(() => null) };
    }
    return null;
  }
  const parts = rest.match(/(-?[\d’']+\.\d{2}|inkl\.)\s+[AI]/g) ?? [];
  if (parts.length !== bieterCount) return null;
  return {
    menge: parseMenge(mengeToken),
    werteRp: parts.map((part) => {
      const token = part.replace(/\s+[AI]$/, '');
      return token === 'inkl.' ? null : toRappen(token);
    }),
  };
}

/** Textitems einer Seite zu Zeilen gruppieren (y-Toleranz), links → rechts */
function toLines(
  items: { str: string; transform: number[] }[],
): Line[] {
  const rows = new Map<number, { str: string; x: number }[]>();
  for (const item of items) {
    const str = item.str.trim();
    if (!str) continue;
    const y = item.transform[5];
    // Zeilenschlüssel: y auf 2pt gerastert (BauPlus hat feste Zeilenhöhen)
    let key: number | null = null;
    for (const existing of rows.keys()) {
      if (Math.abs(existing - y) <= 2) {
        key = existing;
        break;
      }
    }
    if (key === null) key = y;
    const row = rows.get(key) ?? [];
    // Ein Textitem kann mehrere Wörter enthalten – für die Regexe zählt
    // der zusammengesetzte Zeilentext, Tokens nur für die Einrückung
    row.push({ str, x: item.transform[4] });
    rows.set(key, row);
  }
  return [...rows.entries()]
    .map(([y, tokens]) => {
      tokens.sort((a, b) => a.x - b.x);
      return { y, tokens, text: tokens.map((t) => t.str).join(' ') };
    })
    .sort((a, b) => b.y - a.y); // PDF-Koordinaten: oben = grosses y
}

/** «22.05.2026» → '2026-05-22' */
function toIsoDate(value: string | undefined): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export async function parsePositionenvergleich(
  data: Uint8Array,
): Promise<OvParseResult> {
  const loadingTask = getDocument({ data, useSystemFonts: true });
  const doc = await loadingTask.promise;

  const pages: Line[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const rawItems = content.items as Array<{
      str?: string;
      transform?: number[];
    }>;
    pages.push(
      toLines(
        rawItems
          .filter((item) => typeof item.str === 'string' && Array.isArray(item.transform))
          .map((item) => ({ str: item.str!, transform: item.transform! })),
      ),
    );
  }
  await loadingTask.destroy();

  // --- Meta + Bieter aus dem Kopf der ersten Seite ---
  const first = pages[0] ?? [];
  const meta: OvParseResult['meta'] = {
    projektzeile: '',
    projectNo: '',
    bkp: '',
    titel: '',
    lvNummer: '',
    datum: null,
  };
  const bieter: OvParsedBieter[] = [];

  for (const [index, line] of first.entries()) {
    if (line.text.startsWith('Bauvorhaben')) {
      // 'Bauvorhaben Neubau McDonalds, Wattwil BauPlus 22.05.2026'
      const m = line.text.match(/^Bauvorhaben\s+(.+?)\s+BauPlus\s+(\S+)/);
      if (m) {
        meta.projektzeile = m[1];
        meta.datum = toIsoDate(m[2]);
      }
    } else if (/^\S+\s+\S+ - .+ LV\s+\S+/.test(line.text) && !meta.bkp) {
      // 'MCD_239 211 - Baumeisterarbeiten + Baugrube LV 21100' (einzeilig)
      const m = line.text.match(/^(\S+)\s+(\S+) - (.+?)\s+LV\s+(\S+)/);
      if (m) {
        meta.projectNo = m[1];
        meta.bkp = m[2];
        meta.titel = m[3];
        meta.lvNummer = m[4];
      }
    } else if (!meta.bkp && /^[\d.]+ - \S/.test(line.text)) {
      // Split-Format (BKP 281.6): '281.6 - Bodenbeläge: Plattenarbeiten'
      // als eigene Zeile, 'MCD_239 LV 28160' separat.
      const m = line.text.match(/^([\d.]+) - (.+)$/);
      if (m) {
        meta.bkp = m[1];
        meta.titel = m[2];
      }
    } else if (!meta.lvNummer && /^\S+\s+LV\s+\S+$/.test(line.text)) {
      // Split-Format: 'MCD_239 LV 28160'
      const m = line.text.match(/^(\S+)\s+LV\s+(\S+)$/);
      if (m) {
        meta.projectNo = m[1];
        meta.lvNummer = m[2];
      }
    } else if (line.text.startsWith('NPK Position')) {
      // Kopf: '… ME PA <B1> P <B2> P <B3> P' – Namen zwischen den P-Markern
      const afterPa = line.text.split(/\sPA\s/)[1];
      if (afterPa) {
        const names = afterPa
          .split(/\sP(?:\s|$)/)
          .map((n) => n.trim())
          .filter(Boolean);
        for (const name of names) {
          bieter.push({ name, ort: '', telefon: '' });
        }
      }
      // Folgezeilen: Orte (mit A-Markern) und Telefonnummern
      const ortLine = first[index + 1];
      if (ortLine) {
        const orte = ortLine.text
          .replace(/^h\s+/, '')
          .split(/\sA(?:\s|$)/)
          .map((o) => o.trim())
          .filter(Boolean);
        orte.forEach((ort, i) => {
          if (bieter[i]) bieter[i].ort = ort;
        });
      }
      const telLine = first[index + 2];
      if (telLine) {
        const phones = telLine.text.match(/\+41[\d\s]+?(?=\+41|$)/g) ?? [];
        phones.forEach((tel, i) => {
          if (bieter[i]) bieter[i].telefon = tel.trim();
        });
      }
      break;
    }
  }

  // --- Positionszeilen über alle Seiten ---
  // LV-Kurzform-Präfix variiert je Export: BKP-Nummer ('211 -', '271.1 -')
  // ODER blank ('- -', BKP 281.6 – Offerten ausserhalb BauPlus ausgefüllt).
  // Deshalb präfix-AGNOSTISCH matchen: erstes Token beliebig (\S+), danach
  // ' - <Marker A|W> <Menge|per> <ME> A <Werte>'. Positions-Marker A
  // (Angebot) oder W (per-/Wahlposition); Menge numerisch oder «per».
  const priceLine =
    /^\S+ -\s+[AW]\s+([\d’']+\.\d{2,3}|per)\s+(\S+)\s+A\s*(.*)$/;

  const positionen: OvParsedPosition[] = [];
  const unparsedLines: string[] = [];
  const warnings: string[] = [];
  const seenNpk = new Map<string, number>();

  // Einrückung: kleinste x-Position 3-stelliger Nummern = Kapitel-Ebene
  let chapterX = Number.POSITIVE_INFINITY;
  for (const lines of pages) {
    for (const line of lines) {
      if (/^\d{3}(\s|$)/.test(line.text) && !PRICE_TOKEN.test(line.tokens[0].str)) {
        chapterX = Math.min(chapterX, line.tokens[0].x);
      }
    }
  }

  let kapitel = '';
  let gruppe = '';
  let sub = '';
  let gruppeText = '';
  let subText = '';
  // Sammel-Modus für Fortsetzungszeilen (Gruppen-/Positionstexte brechen um)
  let mode: 'none' | 'gruppe' | 'sub' = 'none';

  const clean = (value: string) =>
    value
      .replace(/\.{2,}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\.$/, '');

  for (const lines of pages) {
    for (const line of lines) {
      const text = line.text;

      // Kopf-/Fusszeilen überspringen
      if (
        text.startsWith('Bauvorhaben') ||
        text.startsWith('NPK Position') ||
        text.includes('BAU INNOVATION') ||
        text.startsWith('Walzmühlestrasse') ||
        text.startsWith('CH - ') ||
        /^MCD_|^Positionenvergleich\s+Seite/.test(text) ||
        /^\S+\s+\S+ - .+ LV\s+\S+/.test(text) ||
        /^h?\s?9\d{3}\s/.test(text) ||
        text.startsWith('+41')
      ) {
        continue;
      }

      const m = text.match(priceLine);
      if (m) {
        // Sieht wie eine Preiszeile aus – muss sauber parsen (harte Prüfung)
        const werte = parsePreiszeilenWerte(m[1], m[3], bieter.length);
        if (!werte) {
          unparsedLines.push(text);
          continue;
        }
        const { menge, werteRp } = werte;
        let npk = `${kapitel}.${gruppe}.${sub}`;
        const count = seenNpk.get(npk) ?? 0;
        seenNpk.set(npk, count + 1);
        if (count > 0) {
          warnings.push(`Doppelte NPK-Nummer ${npk} – als ${npk}·${count + 1} übernommen`);
          npk = `${npk}·${count + 1}`;
        }
        // Lesbare Bezeichnung: Gruppentext als Kontext + Positionstext
        const bezeichnung = [clean(gruppeText), clean(subText)]
          .filter(Boolean)
          .join(' · ')
          .slice(0, 140);
        positionen.push({
          npk,
          kapitel,
          gruppe,
          bezeichnung: bezeichnung || npk,
          menge,
          einheit: m[2],
          werteRp,
        });
        mode = 'none';
        continue;
      }

      // NPK-Struktur
      const numMatch = text.match(/^(\d{3})(?:\s+(.*))?$/);
      const subMatch = text.match(/^\.(\d{3})(?:\s+(.*))?$/);
      if (subMatch) {
        sub = subMatch[1];
        subText = subMatch[2] ?? '';
        mode = 'sub';
        continue;
      }
      if (numMatch && line.tokens[0].str.match(/^\d{3}$/)) {
        if (line.tokens[0].x <= chapterX + 2) {
          kapitel = numMatch[1];
        } else {
          gruppe = numMatch[1];
        }
        gruppeText = numMatch[2] ?? '';
        mode = 'gruppe';
        continue;
      }

      // Fortsetzungszeilen (Gruppen- und Positionstexte brechen im PDF um)
      if (mode === 'gruppe' && gruppeText.length < 70) {
        gruppeText = `${gruppeText} ${text}`.trim();
      } else if (mode === 'sub' && subText.length < 90) {
        subText = `${subText} ${text}`.trim();
      }
    }
  }

  const summenRp = bieter.map((_, i) =>
    positionen.reduce((sum, p) => sum + (p.werteRp[i] ?? 0), 0),
  );

  return {
    meta,
    bieter,
    positionen,
    unparsedLines,
    warnings,
    summenRp,
    seiten: pages.length,
  };
}

/**
 * KI-Extraktion von NPK-Positionslisten aus Ausschreibungen und Offerten
 * (O-M2, Konzept Prüfmodul 1). Läuft über die Anthropic-API, die PDFs nativ
 * liest – auch reine Scans (Vision). Grosse Dokumente werden über pdf-lib in
 * Seitenfenster zerlegt; jeder Chunk ist ein eigener API-Aufruf, dessen
 * Resultat persistiert wird (Wiederaufnahme nach Timeout, O-M0 (c) Punkt 4).
 *
 * Rollenteilung wie in O-M1: Die API liefert die Positionsliste des
 * Dokuments; der Abgleich gegen die Referenz ist deterministisch
 * (lib/ov-match.ts). Preise aus der Extraktion dienen NUR der
 * Selbstprüfung (Stichproben-Abgleich gegen die Positionenvergleich-Matrix),
 * nie der Auswertung.
 *
 * ANTHROPIC_API_KEY ausschliesslich als Server-Umgebungsvariable; Aufrufer
 * ist ausschliesslich Server-Code (features/offertenvergleich/
 * vollstaendigkeit.ts). Kein «server-only»-Marker, damit die Probe-Skripte
 * und Tests die Chunk-Logik über tsx laden können (analog lib/ov-parse.ts).
 */
import Anthropic from '@anthropic-ai/sdk';
import { PDFDocument } from 'pdf-lib';

/** Seiten pro Extraktions-Chunk (Vision-Kosten vs. Anzahl Aufrufe) */
export const CHUNK_PAGES = 15;

export interface OvExtractPosition {
  /** Normalisierte NPK-Nummer, z.B. '113.111.100' */
  npk: string;
  bezeichnung: string;
  menge: number | null;
  einheit: string | null;
  /** Positionsbetrag (Menge × EP) in Rappen, falls im Dokument lesbar */
  betragRp: number | null;
  /** Genanntes Produkt/Fabrikat, falls die Position eines nennt */
  produkt: string | null;
  /** 'oder gleichwertig', 'Alternativposition', 'inkl.', … */
  bemerkung: string | null;
}

export interface OvExtractChunkResult {
  positionen: OvExtractPosition[];
  /** Hinweise des Modells (unleserliche Seiten u.ä.) */
  hinweise: string[];
}

export interface OvExtractContext {
  /** 'ausschreibung' oder 'offerte' */
  art: string;
  bkp: string;
  titel: string;
  /** Bietername bei Offerten (hilft dem Modell bei Kopf-/Fusszeilen) */
  bieterName?: string | null;
}

/** Zerlegt ein PDF in Seitenfenster; gibt [von, bis] 1-basiert zurück. */
export async function splitPdfChunks(
  data: Uint8Array,
  pagesPerChunk: number = CHUNK_PAGES,
): Promise<{ von: number; bis: number; bytes: Uint8Array }[]> {
  const source = await PDFDocument.load(data, { ignoreEncryption: true });
  const pageCount = source.getPageCount();
  const chunks: { von: number; bis: number; bytes: Uint8Array }[] = [];
  for (let start = 0; start < pageCount; start += pagesPerChunk) {
    const end = Math.min(start + pagesPerChunk, pageCount);
    const target = await PDFDocument.create();
    const pages = await target.copyPages(
      source,
      Array.from({ length: end - start }, (_, i) => start + i),
    );
    for (const page of pages) target.addPage(page);
    chunks.push({ von: start + 1, bis: end, bytes: await target.save() });
  }
  return chunks;
}

/** Seitenzahl eines PDFs (für parse_fortschritt, ohne Vollparsing) */
export async function pdfPageCount(data: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(data, { ignoreEncryption: true });
  return doc.getPageCount();
}

const EXTRACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['positionen', 'hinweise'],
  properties: {
    positionen: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'npk',
          'bezeichnung',
          'menge',
          'einheit',
          'betrag',
          'produkt',
          'bemerkung',
        ],
        properties: {
          npk: { type: 'string' },
          bezeichnung: { type: 'string' },
          menge: { type: ['number', 'null'] },
          einheit: { type: ['string', 'null'] },
          betrag: { type: ['number', 'null'] },
          produkt: { type: ['string', 'null'] },
          bemerkung: { type: ['string', 'null'] },
        },
      },
    },
    hinweise: { type: 'array', items: { type: 'string' } },
  },
} as const;

function buildSystemPrompt(context: OvExtractContext): string {
  const dokumentArt =
    context.art === 'ausschreibung'
      ? 'eine Original-Ausschreibung (Leistungsverzeichnis ohne oder mit Richtpreisen)'
      : `eine ausgefüllte Offerte${context.bieterName ? ` des Unternehmers «${context.bieterName}»` : ''}`;
  return `Du extrahierst NPK-Positionsdaten aus einem Schweizer Bau-Leistungsverzeichnis. Das Dokument ist ${dokumentArt} zur Vergabe BKP ${context.bkp} «${context.titel}». Es kann ein Scan sein – lies dann aus dem Schriftbild.

Erfasse JEDE Position mit eigener Mengen-/Preiszeile (Muster «: m3 18.000 9.25 166.50» oder «211 A 24.000 St A …» oder Spalten Menge/Einheit/Preis) als einen Eintrag – überspringe keine einzige solche Zeile. Für die Positionsnummer gelten diese Regeln streng:
- npk besteht IMMER aus drei Dreiergruppen Kapitel.Gruppe.Position, z.B. «162.521.121». Das Kapitel steht in der Seiten-Kopfzeile (z.B. «NPK-Bau 162D/2013 …» → 162) oder im Kapiteltitel.
- Die Gliederungsebenen am linken Rand von aussen nach innen: Abschnitt (3-stellig, weit links, z.B. «500 Aushub» – NIE Teil der npk), Gruppe (3-stellig, z.B. «521»), Position (3-stellig eingerückt, z.B. «100», «110», «121»), Merkmal-/Spezifikationscodes (5-stellig, z.B. «12101»). Die Gruppe ist die Nummer DIREKT über den eingerückten Positionsnummern – nicht der weiter aussen stehende Abschnittstitel.
- WICHTIGSTE REGEL: Prüfe bei jeder Mengen-/Preiszeile zuerst, ob unmittelbar davor ein fünfstelliger Merkmalcode steht. Wenn ja, sind dessen ERSTE DREI Ziffern die Positionsnummer – auch wenn darüber eine andere Grundnummer gedruckt ist. Beispiele: «20103 Distanz m bis 20,0» → Position 201 (NICHT die darüberstehende 200); «11102 Trägerabstand m 2,00» → Position 111 (NICHT 110); «10101 Zu Pos. 300.100.» → Position 101 (NICHT 100). Nur wenn KEIN fünfstelliger Code vorhanden ist, gilt die letzte gedruckte Positionsnummer vor der Mengenzeile.
- Grund-/Gliederungsnummern ohne eigene Mengenzeile (z.B. «520 Aushub», «521» als Textblock, «.120» nur mit Beschreibung) NICHT erfassen; ihr Text darf als Beschreibung der zugehörigen ausgepreisten Position dienen. KEINE Kapitel-/Absatztitel, keine Total-/Übertrag-/Vortrag-/Zusammenzugszeilen.
- bezeichnung: Kurztext der Position (erste Zeile bzw. sinnvoller Kurztitel, max. ca. 120 Zeichen).
- menge und einheit: die ausgeschriebene Menge (Zahl, Dezimalpunkt) und Einheit (m, m2, m3, kg, t, St, LE, h, gl, …). Hochzahlen als m2/m3 schreiben. null, wenn nicht vorhanden (z.B. «per»-Positionen ohne Menge).
- betrag: der Positionsbetrag in CHF (Menge × Einheitspreis, Spalte «Preis»/«Betrag»), Dezimalpunkt, ohne Tausendertrennzeichen. null, wenn nicht ausgepreist oder unleserlich. NIE raten oder rechnen – nur ablesen.
- produkt: konkret genanntes Produkt/Fabrikat mit Typ (z.B. «Sika Swell-P Profil Typ 2010H»), sowohl vorgegebene wie vom Unternehmer eingesetzte. null, wenn keines genannt.
- bemerkung: Auffälligkeiten der Position, kurz: «oder gleichwertig», «Alternativposition», «Eventualposition», «inkl.», «durchgestrichen», «handschriftlich geändert». null sonst.

In hinweise meldest du seitenweise Probleme («Seite 4 unleserlich», «Seiten 10–12 ohne Positionen (Vorbemerkungen)») – leer, wenn keine.

Sei exakt: lieber ein Feld null als ein geratener Wert.`;
}

/**
 * Extrahiert die Positionen eines Seitenfensters. Streaming gegen
 * HTTP-Timeouts; strukturierte Ausgabe per JSON-Schema.
 */
export async function extractChunk(
  chunkBytes: Uint8Array,
  context: OvExtractContext,
): Promise<OvExtractChunkResult> {
  const client = new Anthropic();
  const stream = client.messages.stream({
    model: 'claude-opus-4-8',
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    system: buildSystemPrompt(context),
    output_config: {
      format: {
        type: 'json_schema',
        schema: EXTRACT_SCHEMA as unknown as Record<string, unknown>,
      },
    },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: Buffer.from(chunkBytes).toString('base64'),
            },
          },
          {
            type: 'text',
            text: 'Extrahiere alle NPK-Positionen dieses Dokumentausschnitts.',
          },
        ],
      },
    ],
  });
  const response = await stream.finalMessage();
  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text',
  );
  if (!textBlock) throw new Error('Extraktion ohne Textantwort');

  const parsed = JSON.parse(textBlock.text) as {
    positionen: {
      npk: string;
      bezeichnung: string;
      menge: number | null;
      einheit: string | null;
      betrag: number | null;
      produkt: string | null;
      bemerkung: string | null;
    }[];
    hinweise: string[];
  };

  return {
    positionen: parsed.positionen
      .map((p) => ({
        npk: normalizeNpk(p.npk),
        bezeichnung: p.bezeichnung.slice(0, 140),
        menge: p.menge,
        einheit: p.einheit,
        betragRp:
          p.betrag === null || !Number.isFinite(p.betrag)
            ? null
            : Math.round(p.betrag * 100),
        produkt: p.produkt,
        bemerkung: p.bemerkung,
      }))
      .filter((p) => p.npk.length > 0),
    hinweise: parsed.hinweise,
  };
}

/**
 * Normalisiert eine NPK-Nummer auf Ziffern mit Punkten in Dreiergruppen
 * («113.111.100»); entfernt LV-Präfixe wie «211 - » und Leerzeichen.
 */
export function normalizeNpk(raw: string): string {
  const digits = raw.replace(/\D+/g, '');
  if (digits.length === 0) return '';
  const groups: string[] = [];
  for (let i = 0; i < digits.length; i += 3) {
    groups.push(digits.slice(i, i + 3));
  }
  return groups.join('.');
}

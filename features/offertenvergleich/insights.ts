/**
 * KI-Erkenntnisse + Fazit (O-M1) über die Anthropic-API.
 *
 * Rollenteilung gemäss O-M0: Die Zahlenmatrix und Statistik sind
 * deterministisch (lib/ov-parse.ts / lib/ov-calc.ts); die API formuliert
 * ausschliesslich ÜBER den gelieferten Zahlen (Muster wie Umverteilung
 * Entsorgung, Spezialisierung, kritische Positionen) – strukturierte
 * Ausgabe per JSON-Schema, danach Zahlendisziplin-Prüfung: apostrophierte
 * CHF-Zahlen in den Texten müssen in der Matrix belegbar sein.
 *
 * ANTHROPIC_API_KEY ausschliesslich als Server-Umgebungsvariable; ohne
 * Key wird die Stufe übersprungen (Auswertung ohne KI-Texte, Flag im UI).
 */
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { formatNumber } from '@/lib/format';
import type { OvAnalyse } from '@/lib/ov-calc';
import type {
  OvErkenntnis,
  OvErkenntnisTag,
  OvFazit,
} from '@/lib/types';

export interface InsightsInput {
  meta: {
    projektzeile: string;
    projectNo: string;
    bkp: string;
    titel: string;
  };
  bieter: { name: string; ort: string }[];
  analyse: OvAnalyse;
  positionen: {
    npk: string;
    bezeichnung: string;
    menge: number;
    einheit: string;
    werteRp: (number | null)[];
  }[];
}

export interface InsightsResult {
  erkenntnisse: OvErkenntnis[];
  fazit: OvFazit | null;
  /** Apostrophierte CHF-Zahlen ohne Beleg in der Matrix */
  zahlenOhneBeleg: string[];
  uebersprungen: boolean;
}

const TAGS: OvErkenntnisTag[] = [
  'kritisch',
  'hot_spot',
  'plausibilitaet',
  'staerke',
  'hinweis',
];

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['erkenntnisse', 'fazit'],
  properties: {
    erkenntnisse: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titel', 'tag', 'text', 'bullets'],
        properties: {
          titel: { type: 'string' },
          tag: { type: 'string', enum: TAGS },
          text: { type: 'string' },
          bullets: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    fazit: {
      type: 'object',
      additionalProperties: false,
      required: ['ranking', 'bereinigung', 'empfehlung'],
      properties: {
        ranking: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'charakter', 'tendenz'],
            properties: {
              name: { type: 'string' },
              charakter: { type: 'string' },
              tendenz: { type: 'string' },
            },
          },
        },
        bereinigung: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'text'],
            properties: {
              name: { type: 'string' },
              text: { type: 'string' },
            },
          },
        },
        empfehlung: { type: 'string' },
      },
    },
  },
} as const;

function chf(rp: number): string {
  return formatNumber(Math.round(rp / 100));
}

/** Kompakter Daten-Auszug für den Prompt (Franken, apostrophiert) */
function buildPayload(input: InsightsInput): string {
  const { analyse, bieter, positionen } = input;
  const byNpk = new Map(positionen.map((p) => [p.npk, p]));
  const statByNpk = new Map(analyse.positionen.map((s) => [s.npk, s]));

  const top = analyse.hotspots.slice(0, 25).map((npk) => {
    const p = byNpk.get(npk)!;
    const s = statByNpk.get(npk)!;
    return {
      npk,
      bezeichnung: p.bezeichnung,
      menge: `${formatNumber(p.menge, p.menge % 1 === 0 ? 0 : 3)} ${p.einheit}`,
      kostenblock: s.kostenblock,
      preiseChf: p.werteRp.map((w) => (w === null ? 'inkl.' : chf(w))),
      deltaZumMedianPct: s.deltaPct.map((d) =>
        d === null ? null : Math.round(d),
      ),
      flags: s.flags,
    };
  });

  return JSON.stringify(
    {
      projekt: input.meta,
      bieter: bieter.map((b, i) => ({
        name: b.name,
        ort: b.ort,
        totalChf: chf(analyse.bieterTotaleRp[i]),
        rang: analyse.ranking.indexOf(i) + 1,
        summenAbgleich:
          analyse.abgleich[i]?.kontrollsummeRp != null
            ? {
                kontrollsummeChf: chf(analyse.abgleich[i].kontrollsummeRp!),
                differenzChf: chf(analyse.abgleich[i].diffRp ?? 0),
              }
            : null,
      })),
      kostenbloecke: analyse.kostenbloecke.map((b) => ({
        name: b.name,
        positionen: b.positionCount,
        summenChf: b.summenRp.map(chf),
      })),
      auffaelligstePositionen: top,
      flags: analyse.flagged,
    },
    null,
    1,
  );
}

const SYSTEM_PROMPT = `Du bist erfahrener Bauleiter in der Deutschschweiz und wertest einen Positionenvergleich (Submissionsvergleich) aus. Du erhältst eine deterministisch berechnete Zahlenmatrix als JSON.

Regeln:
- Formuliere 4–7 Erkenntnisse über Muster in den Daten: Umverteilungen zwischen zusammengehörenden Positionen (z.B. Transport 711.xxx + Gebühren 751.xxx nur in der Summe vergleichen), auffällige Einzel-Ausreisser, Spezialisierungen einzelner Bieter in Kostenblöcken, negative Einheitspreise und Pseudo-Preise (1.00 / «inkl.») als Plausibilitätsrisiko.
- Danach ein Fazit: Ranking aller Bieter (Reihenfolge = Rang aus den Daten) mit prägnanter Charakterisierung der Offerte und einem Tendenz-Schlagwort in Versalien (z.B. GÜNSTIGSTER GESAMTEINDRUCK, AUSGEWOGEN, PLAUSIBILITÄT KLÄREN); Bereinigungsgespräche mit konkreten Klärungspunkten pro Bieter; eine Vergabeempfehlung mit Risikoeinschätzung.
- Verwende AUSSCHLIESSLICH Zahlen aus den gelieferten Daten. Wenn du Positionen summierst, nenne die Additionsglieder (NPK-Nummern). Erfinde keine Werte.
- Sprache: Deutsch (Schweiz), kein «ß», Guillemets «…», Tausendertrennzeichen mit Apostroph (12'480), Beträge in CHF ganzzahlig.
- Kurz und fachlich; jede Erkenntnis 2–5 Sätze, Bullets nur wo Summenbetrachtungen konkret vorgerechnet werden.`;

/** Belegbare Franken-Werte der Matrix (für die Zahlendisziplin-Prüfung) */
function allowedNumbers(input: InsightsInput): Set<number> {
  const set = new Set<number>();
  const add = (rp: number | null | undefined) => {
    if (rp === null || rp === undefined) return;
    set.add(Math.round(Math.abs(rp) / 100));
  };
  for (const p of input.positionen) {
    p.werteRp.forEach(add);
  }
  for (const s of input.analyse.positionen) {
    add(s.medianRp);
    add(s.spreadRp);
  }
  input.analyse.bieterTotaleRp.forEach(add);
  for (const b of input.analyse.kostenbloecke) b.summenRp.forEach(add);
  for (const a of input.analyse.abgleich) {
    add(a.kontrollsummeRp);
    add(a.diffRp);
  }
  return set;
}

function pruefeZahlen(
  texte: string[],
  allowed: Set<number>,
): string[] {
  const ohneBeleg = new Set<string>();
  for (const text of texte) {
    // Nur apostrophierte CHF-Zahlen prüfen (NPK-Nummern/Prozente bleiben aussen vor)
    for (const m of text.matchAll(/\d{1,3}(?:[’']\d{3})+/g)) {
      const value = parseInt(m[0].replace(/[’']/g, ''), 10);
      const belegt =
        allowed.has(value) || allowed.has(value + 1) || allowed.has(value - 1);
      if (!belegt) ohneBeleg.add(m[0]);
    }
  }
  return [...ohneBeleg];
}

export async function generateInsights(
  input: InsightsInput,
): Promise<InsightsResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      erkenntnisse: [],
      fazit: null,
      zahlenOhneBeleg: [],
      uebersprungen: true,
    };
  }

  const client = new Anthropic();
  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT,
    output_config: {
      format: {
        type: 'json_schema',
        schema: OUTPUT_SCHEMA as unknown as Record<string, unknown>,
      },
    },
    messages: [
      {
        role: 'user',
        content: `Zahlenmatrix des Positionenvergleichs:\n\n${buildPayload(input)}`,
      },
    ],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text',
  );
  if (!textBlock) {
    throw new Error('KI-Auswertung ohne Textantwort');
  }

  const parsed = JSON.parse(textBlock.text) as {
    erkenntnisse: OvErkenntnis[];
    fazit: OvFazit;
  };

  const texte = [
    ...parsed.erkenntnisse.flatMap((e) => [e.text, ...e.bullets]),
    ...parsed.fazit.ranking.map((r) => r.charakter),
    ...parsed.fazit.bereinigung.map((b) => b.text),
    parsed.fazit.empfehlung,
  ];

  return {
    erkenntnisse: parsed.erkenntnisse,
    fazit: parsed.fazit,
    zahlenOhneBeleg: pruefeZahlen(texte, allowedNumbers(input)),
    uebersprungen: false,
  };
}

/**
 * Statistik-Engine des Moduls Offertenvergleich (O-M1) – reine Funktionen,
 * abgesichert durch tests/ov-calc.test.ts (analog bkk-calc/lv-logic).
 *
 * Konzept-Anforderungen (Prüfmodul 2): Delta zum Median in Prozent,
 * Ranking pro Position (günstigster/teuerster), Gewichtung nach
 * Kostenrelevanz (Spannweite in Rappen), Gruppierung nach Kostenblock
 * (NPK-Systematik), Plausibilitäts-Flags (negative EP, Preis 1.00,
 * «inkl.», Extremausreisser > 3× über/unter Median).
 *
 * Beträge durchgehend in Ganzzahl-Rappen; «inkl.» (null) zählt 0 in
 * Summen und wird aus Median/Deltas ausgeschlossen.
 */

export interface OvCalcPosition {
  npk: string;
  kapitel: string;
  gruppe: string;
  bezeichnung: string;
  /** null = per-Position (keine ausgeschriebene Menge) */
  menge: number | null;
  einheit: string;
  werteRp: (number | null)[];
}

export type OvFlag = 'negativ' | 'einheitspreis_1' | 'inkl' | 'ausreisser_hoch' | 'ausreisser_tief';

export interface OvPositionStat {
  npk: string;
  kostenblock: string;
  /** Median über die vorhandenen (nicht-«inkl.») Beträge; null wenn < 2 */
  medianRp: number | null;
  /** Δ zum Median in Prozent je Bieter (null bei «inkl.» oder ohne Median) */
  deltaPct: (number | null)[];
  /** Index des günstigsten/teuersten Bieters (null ohne Vergleichsbasis) */
  minIndex: number | null;
  maxIndex: number | null;
  /** Kostenrelevanz: Spannweite max−min in Rappen (0 ohne Vergleichsbasis) */
  spreadRp: number;
  /** Flags je Bieter */
  flags: OvFlag[][];
}

export interface OvKostenblock {
  name: string;
  summenRp: number[];
  positionCount: number;
}

export interface OvAbgleich {
  /** Positionssumme des Bieters in Rappen */
  summeRp: number;
  /** Manuell/automatisch erfasster Offerten-Endbetrag (brutto) oder null */
  kontrollsummeRp: number | null;
  /** summeRp − kontrollsummeRp; null ohne Kontrollsumme */
  diffRp: number | null;
}

export interface OvAnalyse {
  bieterTotaleRp: number[];
  /** Bieter-Indizes, aufsteigend nach Total (Rang 1 = günstigster) */
  ranking: number[];
  abgleich: OvAbgleich[];
  positionen: OvPositionStat[];
  kostenbloecke: OvKostenblock[];
  /** NPK-Nummern nach Kostenrelevanz absteigend (Hot-Spot-Reihenfolge) */
  hotspots: string[];
  flagged: {
    negativ: string[];
    einheitspreis1: string[];
    inkl: string[];
    ausreisser: string[];
  };
}

// ---------------------------------------------------------------------------
// Kostenblock-Zuordnung (NPK-Systematik, MVP-Mapping mit Verfeinerung für
// die mengenstarken Kapitel 211/241; Fallback «NPK <Kapitel>»)

const KAPITEL_BLOCK: Record<string, string> = {
  '111': 'Regiearbeiten',
  '112': 'Prüfungen / Versuche',
  '113': 'Baustelleneinrichtung',
  '114': 'Gerüste',
  '117': 'Abbrüche / Rückbau',
  '151': 'Werkleitungen',
  '171': 'Pfahlarbeiten',
  '172': 'Anker / Fugenbänder',
  '221': 'Fundationsschichten',
  '223': 'Randabschlüsse',
  '237': 'Kanalisation',
};

export function kostenblockOf(kapitel: string, gruppe: string): string {
  if (kapitel === '211') {
    if (gruppe.startsWith('7')) return 'Entsorgung / Transporte';
    if (gruppe.startsWith('5')) return 'Schüttung / Hinterfüllung';
    if (gruppe.startsWith('2')) return 'Aushub';
    return 'Baugrube / Erdbau';
  }
  if (kapitel === '241') {
    if (gruppe.startsWith('2')) return 'Schalungen';
    if (gruppe.startsWith('5')) return 'Bewehrung / Stahleinlagen';
    if (gruppe.startsWith('6')) return 'Beton-Lieferungen';
    return 'Ortbetonbau';
  }
  return KAPITEL_BLOCK[kapitel] ?? `NPK ${kapitel}`;
}

// ---------------------------------------------------------------------------

export function medianRp(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Δ zum Median in Prozent (eine Nachkommastelle sinnvoll erst im UI) */
export function deltaPct(wertRp: number, medRp: number): number | null {
  if (medRp === 0) return null;
  return ((wertRp - medRp) / Math.abs(medRp)) * 100;
}

export function positionStat(position: OvCalcPosition): OvPositionStat {
  const vorhanden = position.werteRp.filter((v): v is number => v !== null);
  const med = vorhanden.length >= 2 ? medianRp(vorhanden) : null;

  let minIndex: number | null = null;
  let maxIndex: number | null = null;
  if (vorhanden.length >= 2) {
    const min = Math.min(...vorhanden);
    const max = Math.max(...vorhanden);
    if (min !== max) {
      minIndex = position.werteRp.findIndex((v) => v === min);
      maxIndex = position.werteRp.findIndex((v) => v === max);
    }
  }

  const spreadRp =
    vorhanden.length >= 2
      ? Math.max(...vorhanden) - Math.min(...vorhanden)
      : 0;

  const flags: OvFlag[][] = position.werteRp.map((wert) => {
    const list: OvFlag[] = [];
    if (wert === null) {
      list.push('inkl');
      return list;
    }
    if (wert < 0) list.push('negativ');
    if (wert === 100) list.push('einheitspreis_1');
    if (med !== null && med > 0) {
      if (wert > med * 3) list.push('ausreisser_hoch');
      if (wert >= 0 && wert < med / 3) list.push('ausreisser_tief');
    }
    return list;
  });

  return {
    npk: position.npk,
    kostenblock: kostenblockOf(position.kapitel, position.gruppe),
    medianRp: med,
    deltaPct: position.werteRp.map((wert) =>
      wert === null || med === null ? null : deltaPct(wert, med),
    ),
    minIndex,
    maxIndex,
    spreadRp,
    flags,
  };
}

export function computeAnalyse(
  positionen: OvCalcPosition[],
  bieterCount: number,
  kontrollsummenRp: (number | null)[] = [],
): OvAnalyse {
  const stats = positionen.map(positionStat);

  const bieterTotaleRp = Array.from({ length: bieterCount }, (_, i) =>
    positionen.reduce((sum, p) => sum + (p.werteRp[i] ?? 0), 0),
  );

  const ranking = bieterTotaleRp
    .map((total, index) => ({ total, index }))
    .sort((a, b) => a.total - b.total)
    .map((entry) => entry.index);

  const abgleich: OvAbgleich[] = bieterTotaleRp.map((summeRp, i) => {
    const kontrollsummeRp = kontrollsummenRp[i] ?? null;
    return {
      summeRp,
      kontrollsummeRp,
      diffRp: kontrollsummeRp === null ? null : summeRp - kontrollsummeRp,
    };
  });

  const blockMap = new Map<string, OvKostenblock>();
  positionen.forEach((position, index) => {
    const name = stats[index].kostenblock;
    const block =
      blockMap.get(name) ??
      { name, summenRp: Array.from({ length: bieterCount }, () => 0), positionCount: 0 };
    position.werteRp.forEach((wert, i) => {
      block.summenRp[i] += wert ?? 0;
    });
    block.positionCount += 1;
    blockMap.set(name, block);
  });

  const hotspots = stats
    .filter((s) => s.spreadRp > 0)
    .sort((a, b) => b.spreadRp - a.spreadRp)
    .map((s) => s.npk);

  const flagged = {
    negativ: stats
      .filter((s) => s.flags.some((f) => f.includes('negativ')))
      .map((s) => s.npk),
    einheitspreis1: stats
      .filter((s) => s.flags.some((f) => f.includes('einheitspreis_1')))
      .map((s) => s.npk),
    inkl: stats
      .filter((s) => s.flags.some((f) => f.includes('inkl')))
      .map((s) => s.npk),
    ausreisser: stats
      .filter((s) =>
        s.flags.some(
          (f) => f.includes('ausreisser_hoch') || f.includes('ausreisser_tief'),
        ),
      )
      .map((s) => s.npk),
  };

  return {
    bieterTotaleRp,
    ranking,
    abgleich,
    positionen: stats,
    kostenbloecke: [...blockMap.values()],
    hotspots,
    flagged,
  };
}

/**
 * Automatische Vorauswahl der «wichtigen Positionen» für Auswertung und
 * Bericht: Top-N nach Kostenrelevanz plus alle geflaggten Positionen
 * (negativ / Preis 1.00 / «inkl.») – interaktiv übersteuerbar.
 */
export function autoWichtig(analyse: OvAnalyse, topN = 20): Set<string> {
  const set = new Set<string>(analyse.hotspots.slice(0, topN));
  for (const npk of analyse.flagged.negativ) set.add(npk);
  for (const npk of analyse.flagged.einheitspreis1) set.add(npk);
  for (const npk of analyse.flagged.inkl) set.add(npk);
  return set;
}

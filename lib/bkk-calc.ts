/**
 * Berechnungslogik des Moduls Baukostenkontrolle (P2-M2).
 *
 * 1:1-Portierung aus dem Alt-Tool
 * (scripts/data/baukostenkontrolle-mcd-wattwil_….html), umgestellt auf
 * Ganzzahl-Rappen. Reine Funktionen ohne Abhängigkeiten – abgesichert durch
 * tests/bkk-calc.test.ts (npm run test:unit).
 *
 * Dokumentierte Feinheiten des Alt-Tools, die hier bewusst erhalten bleiben:
 *  * KV orig. zählt im Gesamttotal IMMER alle Katalog-Positionen, auch
 *    ausgeblendete – das Originalbudget ist historisch fix.
 *  * Custom-Positionen zählen NICHT ins KV-orig.-Total, aber in alles andere
 *    (KV mutiert, Verträge, Zahlungen).
 *  * Status-Pille mit Toleranzfaktoren 1.001 («> KV») bzw. 0.999 («bezahlt»),
 *    Prüfreihenfolge exakt wie im Alt-Tool.
 *  * 5-Rappen-Rundung: im Alt-Tool wurde bei der EINGABE gerundet; hier wird
 *    exakt gespeichert und die Rundung als Anzeige-/Totalisierungsregel
 *    angewandt (Option round5) – Totale sind die Summe der gerundeten
 *    Einzelbeträge, identisch zum Alt-Tool-Ergebnis.
 */

export interface BkkCalcPosition {
  bkp: string;
  /** Originalbudget in Rappen (historisch fix). */
  kvOrigRp: number;
  /** Mutiertes KV in Rappen; null = wie Original. 0 ist eine gültige Mutation. */
  kvMutRp: number | null;
  /** Custom-Position: zählt nicht ins KV-orig.-Total. */
  isCustom: boolean;
  /** Ausgeblendet: zählt im Gesamttotal nur ins KV orig. */
  hidden: boolean;
}

export interface BkkCalcEntry {
  entryType: 'vertrag' | 'zahlung';
  betragRp: number;
}

export interface BkkPositionWithEntries {
  position: BkkCalcPosition;
  entries: BkkCalcEntry[];
}

export interface BkkCalcOptions {
  /** 5-Rappen-Rundung als Anzeige-/Totalisierungsregel (Moduleinstellung). */
  round5: boolean;
}

/** Toleranz «> KV»: Verträge gelten erst ab +0.1 % als Überschreitung. */
export const OVER_KV_TOLERANCE = 1.001;
/** Toleranz «bezahlt»: Zahlungen ab 99.9 % der Verträge gelten als bezahlt. */
export const PAID_TOLERANCE = 0.999;

/** CH-Rundung auf die nächsten 5 Rappen (Alt-Tool: round5Rp auf CHF·20). */
export function round5Rp(rp: number): number {
  return Math.round(rp / 5) * 5;
}

/** Betrag für Anzeige/Totalisierung – rundet nur bei aktiver Regel. */
export function displayRp(rp: number, opts: BkkCalcOptions): number {
  return opts.round5 ? round5Rp(rp) : rp;
}

/** KV mutiert effektiv: Überschreibung, sonst Original (Alt-Tool: effectiveKvMut). */
export function effectiveKvMutRp(
  position: BkkCalcPosition,
  opts: BkkCalcOptions,
): number {
  return displayRp(position.kvMutRp ?? position.kvOrigRp, opts);
}

export interface BkkEntrySums {
  vertragRp: number;
  zahlungRp: number;
}

/** Summen der Verträge/Zahlungen einer Position (gerundet je Einzelbetrag). */
export function entrySums(
  entries: BkkCalcEntry[],
  opts: BkkCalcOptions,
): BkkEntrySums {
  let vertragRp = 0;
  let zahlungRp = 0;
  for (const entry of entries) {
    if (entry.entryType === 'vertrag') vertragRp += displayRp(entry.betragRp, opts);
    else zahlungRp += displayRp(entry.betragRp, opts);
  }
  return { vertragRp, zahlungRp };
}

export type BkkStatus = 'offen' | 'ueber_kv' | 'bezahlt' | 'teilbezahlt' | 'vertrag';

/** Status-Pille – Prüfreihenfolge exakt wie im Alt-Tool (statusPill). */
export function positionStatus(
  position: BkkCalcPosition,
  entries: BkkCalcEntry[],
  opts: BkkCalcOptions,
): BkkStatus {
  const { vertragRp: sv, zahlungRp: sz } = entrySums(entries, opts);
  const kvm = effectiveKvMutRp(position, opts);
  if (sv === 0 && sz === 0) return 'offen';
  if (sv > kvm * OVER_KV_TOLERANCE && kvm > 0) return 'ueber_kv';
  if (sz >= sv * PAID_TOLERANCE && sv > 0) return 'bezahlt';
  if (sz > 0) return 'teilbezahlt';
  if (sv > 0) return 'vertrag';
  return 'offen';
}

export interface BkkSubtotals {
  kvOrigRp: number;
  kvMutRp: number;
  vertragRp: number;
  zahlungRp: number;
}

/**
 * Zwischentotal einer Gruppe über die übergebenen (sichtbaren) Zeilen –
 * Custom-Positionen zählen nicht ins KV orig. (Alt-Tool: groupSubtotals).
 */
export function groupSubtotals(
  rows: BkkPositionWithEntries[],
  opts: BkkCalcOptions,
): BkkSubtotals {
  const sub: BkkSubtotals = { kvOrigRp: 0, kvMutRp: 0, vertragRp: 0, zahlungRp: 0 };
  for (const { position, entries } of rows) {
    if (!position.isCustom) sub.kvOrigRp += displayRp(position.kvOrigRp, opts);
    sub.kvMutRp += effectiveKvMutRp(position, opts);
    const sums = entrySums(entries, opts);
    sub.vertragRp += sums.vertragRp;
    sub.zahlungRp += sums.zahlungRp;
  }
  return sub;
}

export interface BkkTotals extends BkkSubtotals {
  customKvRp: number;
  customMutRp: number;
  customVertragRp: number;
  customZahlungRp: number;
}

/**
 * Gesamttotal über ALLE Zeilen (inkl. ausgeblendeter und Custom-Positionen) –
 * Zähllogik exakt wie im Alt-Tool (totals):
 *  * KV orig.: alle Katalog-Positionen, auch ausgeblendete; Customs nie.
 *  * KV mutiert/Verträge/Zahlungen: nur sichtbare Katalog-Positionen,
 *    Custom-Positionen immer.
 */
export function totals(
  rows: BkkPositionWithEntries[],
  opts: BkkCalcOptions,
): BkkTotals {
  const t: BkkTotals = {
    kvOrigRp: 0,
    kvMutRp: 0,
    vertragRp: 0,
    zahlungRp: 0,
    customKvRp: 0,
    customMutRp: 0,
    customVertragRp: 0,
    customZahlungRp: 0,
  };
  for (const { position, entries } of rows) {
    const sums = entrySums(entries, opts);
    if (position.isCustom) {
      t.customKvRp += displayRp(position.kvOrigRp, opts);
      t.customMutRp += effectiveKvMutRp(position, opts);
      t.customVertragRp += sums.vertragRp;
      t.customZahlungRp += sums.zahlungRp;
      continue;
    }
    t.kvOrigRp += displayRp(position.kvOrigRp, opts);
    if (position.hidden) continue;
    t.kvMutRp += effectiveKvMutRp(position, opts);
    t.vertragRp += sums.vertragRp;
    t.zahlungRp += sums.zahlungRp;
  }
  t.kvMutRp += t.customMutRp;
  t.vertragRp += t.customVertragRp;
  t.zahlungRp += t.customZahlungRp;
  return t;
}

/** Offen = Verträge − Zahlungen (KPI). */
export function offenRp(t: Pick<BkkTotals, 'vertragRp' | 'zahlungRp'>): number {
  return t.vertragRp - t.zahlungRp;
}

/** Δ% zwischen Wert und Referenz; null, wenn keine Referenz (Anzeige «–»). */
export function deltaPct(value: number, ref: number): number | null {
  if (ref === 0) return null;
  return ((value - ref) / ref) * 100;
}

/** Anteil in % (Wert von Referenz); null bei fehlender Referenz oder Wert 0. */
export function sharePct(value: number, ref: number): number | null {
  if (ref === 0 || value === 0) return null;
  return (value / ref) * 100;
}

export type BkkCellTone = 'pos' | 'neg' | 'zero';

/** Einfärbung der Δ%-Zellen (Alt-Tool: deltaTd). */
export function deltaTone(pct: number | null): BkkCellTone {
  if (pct === null) return 'zero';
  if (pct > 0.05) return 'neg';
  if (pct < -0.05) return 'pos';
  return 'zero';
}

/** Einfärbung der Anteils-Zellen (Alt-Tool: pctTd). */
export function shareTone(pct: number | null): BkkCellTone {
  if (pct === null) return 'zero';
  if (pct > 100.05) return 'neg';
  if (pct >= 80) return 'pos';
  return 'zero';
}

export type BkkAmpel = 'neutral' | 'green' | 'amber' | 'red';

export interface BkkKvMutKpi {
  deltaPct: number;
  ampel: BkkAmpel;
  /** Einsparung: Δ negativ (grüne Ampel mit Zusatztext im Alt-Tool). */
  einsparung: boolean;
}

/** KPI «KV mutiert»: Δ% mit Ampel (<0 grün «Einsparung», 0–5 % gelb, >5 % rot). */
export function kvMutKpi(t: Pick<BkkTotals, 'kvOrigRp' | 'kvMutRp'>): BkkKvMutKpi {
  const pct = t.kvOrigRp > 0 ? ((t.kvMutRp - t.kvOrigRp) / t.kvOrigRp) * 100 : 0;
  if (Math.abs(pct) < 0.05) return { deltaPct: pct, ampel: 'neutral', einsparung: false };
  if (pct < 0) return { deltaPct: pct, ampel: 'green', einsparung: true };
  return { deltaPct: pct, ampel: pct > 5 ? 'red' : 'amber', einsparung: false };
}

/** KPI «Verträge»: rot bei Vergabe über KV mutiert (Toleranz 0.1 %), sonst grün ab erster Vergabe. */
export function vertragKpiAmpel(
  t: Pick<BkkTotals, 'kvMutRp' | 'vertragRp'>,
): BkkAmpel {
  const pct = t.kvMutRp > 0 ? (t.vertragRp / t.kvMutRp) * 100 : 0;
  if (t.vertragRp > t.kvMutRp * OVER_KV_TOLERANCE) return 'red';
  if (pct > 0) return 'green';
  return 'neutral';
}

/** KPI «Zahlungen»: rot bei Zahlungen über den Verträgen (Toleranz 0.1 %), sonst grün ab erster Zahlung. */
export function zahlungKpiAmpel(
  t: Pick<BkkTotals, 'vertragRp' | 'zahlungRp'>,
): BkkAmpel {
  const pct = t.vertragRp > 0 ? (t.zahlungRp / t.vertragRp) * 100 : 0;
  if (t.zahlungRp > t.vertragRp * OVER_KV_TOLERANCE) return 'red';
  if (pct > 0) return 'green';
  return 'neutral';
}

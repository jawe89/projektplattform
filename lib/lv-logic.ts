/**
 * Workflow-Logik des Moduls Verkehr-Leistungsverzeichnis (P2-M3).
 *
 * 1:1-Portierung aus dem Alt-Tool
 * (scripts/data/verkehr-leistungsverzeichnis-mcd-wattwil_….html), umgestellt
 * auf das Schema aus Migration 0009 (pro Schritt Datum + Freitext,
 * Entscheid 3). Reine Funktionen ohne Abhängigkeiten – abgesichert durch
 * tests/lv-logic.test.ts (npm run test:unit).
 *
 * Alt-Tool-Feinheiten, die erhalten bleiben:
 *  * Fortschritt einer Einheit = LETZTER ausgefüllter Schritt (rückwärts
 *    gesucht); Lücken davor sind egal.
 *  * «Nach Aufwand» (kein Werkvertrag) gilt, wenn ALLE vier WV-Schritte den
 *    ⊘-Marker tragen.
 *  * «Abgeschlossen» nur, wenn der letzte Schritt «WV unterschrieben zurück»
 *    ausgefüllt ist und NICHT den ⊘-Marker trägt.
 *  * Der Import (P2-M4) parst strikte TT.MM.JJJJ-Werte ins Datumsfeld;
 *    alles andere landet unverändert im Freitext – kein Wert geht verloren.
 */

export const LV_STEP_KEYS = [
  'lv_erstellt',
  'lv_versendet',
  'off_erhalten',
  'av_erstellt',
  'av_bh',
  'wv_erstellt',
  'wv_unt',
  'wv_bh',
  'wv_zurueck',
] as const;

export type LvStepKey = (typeof LV_STEP_KEYS)[number];

export function isLvStepKey(value: string): value is LvStepKey {
  return (LV_STEP_KEYS as readonly string[]).includes(value);
}

/** Werkvertrags-Phase (Alt-Tool: WV_STEPS) */
export const LV_WV_STEP_KEYS: readonly LvStepKey[] = [
  'wv_erstellt',
  'wv_unt',
  'wv_bh',
  'wv_zurueck',
];

/** Standard-Marker der Zellen (unverändert aus dem Alt-Tool übernommen) */
export const LV_DONE_MARKER = '✓ erledigt';
export const LV_NA_MARKER = '⊘ nach Aufwand';

export interface LvStepValue {
  /** ISO-Datum (YYYY-MM-DD) oder null */
  datum: string | null;
  freitext: string | null;
}

/** Workflow-Stand einer Einheit: nur ausgefüllte Schritte haben einen Wert */
export type LvUnitStepMap = Partial<Record<LvStepKey, LvStepValue>>;

/** Ausgefüllt = Datum oder Freitext vorhanden (DB-Check der Migration 0009) */
export function isFilled(value: LvStepValue | undefined): boolean {
  return Boolean(value && (value.datum || value.freitext));
}

/** Trägt die Zelle den ⊘-Marker «nach Aufwand»? */
export function isNaValue(value: LvStepValue | undefined): boolean {
  return Boolean(value && value.freitext?.trim() === LV_NA_MARKER);
}

/** Letzter ausgefüllter Schritt (rückwärts gesucht) oder null (Alt-Tool: lastDoneStep) */
export function lastFilledStep(steps: LvUnitStepMap): LvStepKey | null {
  for (let i = LV_STEP_KEYS.length - 1; i >= 0; i--) {
    if (isFilled(steps[LV_STEP_KEYS[i]])) return LV_STEP_KEYS[i];
  }
  return null;
}

/** «Nach Aufwand»: alle vier WV-Schritte tragen den ⊘-Marker (Alt-Tool: isNachAufwand) */
export function isNachAufwand(steps: LvUnitStepMap): boolean {
  return LV_WV_STEP_KEYS.every((key) => isNaValue(steps[key]));
}

export type LvUnitStatus =
  | { kind: 'offen' }
  | { kind: 'nach_aufwand' }
  | { kind: 'abgeschlossen' }
  | { kind: 'in_arbeit'; lastStep: LvStepKey };

/** Status-Pille einer Einheit – Reihenfolge exakt wie im Alt-Tool */
export function unitStatus(steps: LvUnitStepMap): LvUnitStatus {
  if (isNachAufwand(steps)) return { kind: 'nach_aufwand' };
  const last = lastFilledStep(steps);
  if (!last) return { kind: 'offen' };
  if (last === 'wv_zurueck' && !isNaValue(steps.wv_zurueck)) {
    return { kind: 'abgeschlossen' };
  }
  return { kind: 'in_arbeit', lastStep: last };
}

export interface LvKpis {
  total: number;
  lvErstellt: number;
  offErhalten: number;
  wvZurueck: number;
  offen: number;
}

/** KPI-Zähler über die (sichtbaren) Einheiten – wie das Alt-Tool: Marker zählen als «erledigt» */
export function unitKpis(unitSteps: LvUnitStepMap[]): LvKpis {
  const kpis: LvKpis = {
    total: unitSteps.length,
    lvErstellt: 0,
    offErhalten: 0,
    wvZurueck: 0,
    offen: 0,
  };
  for (const steps of unitSteps) {
    if (isFilled(steps.lv_erstellt)) kpis.lvErstellt++;
    if (isFilled(steps.off_erhalten)) kpis.offErhalten++;
    if (isFilled(steps.wv_zurueck)) kpis.wvZurueck++;
    if (!lastFilledStep(steps)) kpis.offen++;
  }
  return kpis;
}

/**
 * Strikte TT.MM.JJJJ-Prüfung (Entscheid 3, Import P2-M4): nur echte
 * Kalenderdaten werden als ISO-Datum geliefert; alles andere (Marker,
 * KW-Angaben, Freitext, ungültige Daten wie 32.13.2026) → null – der
 * Aufrufer übernimmt den Originalwert unverändert ins Freitextfeld.
 */
export function parseStrictSwissDate(value: string): string | null {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

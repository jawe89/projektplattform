/**
 * KI-Zahlendisziplin des Moduls Offertenvergleich: Jede apostrophierte
 * CHF-Zahl in den generierten Erkenntnis-/Fazit-Texten muss in der
 * deterministischen Matrix belegbar sein.
 *
 * Belegbar sind (Analyse der real geflaggten Zahlen, alle legitim):
 * 1. Einzelwerte (Positionswerte, Totale, Kostenblock-Summen,
 *    Kontrollsummen, Mediane, Spannweiten, Abgleich-Differenzen), ±1 Fr.
 * 2. Summen aus 2–3 Positionswerten DESSELBEN Bieters (vorgerechnete
 *    Summenbetrachtungen wie Transport + Gebühren), Toleranz ±2/±3 Fr
 *    (Rundung der Summanden).
 * 3. Differenzen desselben Aggregats ZWISCHEN zwei Bietern («Preisvorsprung
 *    auf Weber», «Delta im Kostenblock»), ±2 Fr.
 *
 * Reine Logik ohne IO – unit-getestet in tests/ov-zahlen.test.ts; genutzt
 * von features/offertenvergleich/insights.ts.
 */

export interface OvZahlenMatrix {
  /** Positionswerte in Rappen je Bieter (Spalte), null = «inkl.» */
  bieterPositionenRp: (number | null)[][];
  /**
   * Aggregat-Gruppen: je Gruppe (Totale, ein Kostenblock, Kontrollsummen)
   * die Werte über die Bieter – innerhalb einer Gruppe sind paarweise
   * Differenzen belegbar.
   */
  aggregatGruppenRp: (number | null)[][];
  /** Weitere belegbare Einzelwerte (Mediane, Spannweiten, Differenzen) */
  einzelwerteRp: (number | null | undefined)[];
}

function toFr(rp: number): number {
  return Math.round(Math.abs(rp) / 100);
}

function inSet(set: Set<number>, value: number, toleranz: number): boolean {
  for (let d = -toleranz; d <= toleranz; d++) {
    if (set.has(value + d)) return true;
  }
  return false;
}

interface Vorbereitet {
  einzel: Set<number>;
  /** Je Bieter: Positionswerte in Franken (Array + Set) */
  spalten: { werte: number[]; set: Set<number> }[];
}

function vorbereiten(matrix: OvZahlenMatrix): Vorbereitet {
  const einzel = new Set<number>();
  const add = (rp: number | null | undefined) => {
    if (rp === null || rp === undefined) return;
    einzel.add(toFr(rp));
  };
  const spalten = matrix.bieterPositionenRp.map((col) => {
    const werte: number[] = [];
    for (const rp of col) {
      if (rp === null) continue;
      const fr = toFr(rp);
      werte.push(fr);
      einzel.add(fr);
    }
    return { werte, set: new Set(werte) };
  });
  for (const gruppe of matrix.aggregatGruppenRp) {
    const frWerte = gruppe.filter((v): v is number => v !== null).map(toFr);
    frWerte.forEach((fr) => einzel.add(fr));
    // Paarweise Differenzen innerhalb der Gruppe (zwischen Bietern)
    for (let i = 0; i < frWerte.length; i++) {
      for (let j = i + 1; j < frWerte.length; j++) {
        einzel.add(Math.abs(frWerte[i] - frWerte[j]));
      }
    }
  }
  matrix.einzelwerteRp.forEach(add);
  return { einzel, spalten };
}

function istBelegt(zielFr: number, { einzel, spalten }: Vorbereitet): boolean {
  if (inSet(einzel, zielFr, 1)) return true;
  // Summen aus 2–3 Positionswerten desselben Bieters
  for (const { werte, set } of spalten) {
    for (let i = 0; i < werte.length; i++) {
      const rest = zielFr - werte[i];
      if (rest > 0 && inSet(set, rest, 2)) return true;
    }
    for (let i = 0; i < werte.length; i++) {
      for (let j = i + 1; j < werte.length; j++) {
        const rest = zielFr - werte[i] - werte[j];
        if (rest > 0 && inSet(set, rest, 3)) return true;
      }
    }
  }
  return false;
}

/**
 * Liefert die apostrophierten CHF-Zahlen aus den Texten, die weder als
 * Einzelwert noch als belegbare Summe/Differenz erklärbar sind.
 */
export function pruefeZahlen(
  texte: string[],
  matrix: OvZahlenMatrix,
): string[] {
  const vorbereitet = vorbereiten(matrix);
  const ohneBeleg = new Set<string>();
  const geprueft = new Map<number, boolean>();
  for (const text of texte) {
    // Nur apostrophierte CHF-Zahlen prüfen (NPK-Nummern/Prozente bleiben aussen vor)
    for (const m of text.matchAll(/\d{1,3}(?:[’']\d{3})+/g)) {
      const value = parseInt(m[0].replace(/[’']/g, ''), 10);
      let belegt = geprueft.get(value);
      if (belegt === undefined) {
        belegt = istBelegt(value, vorbereitet);
        geprueft.set(value, belegt);
      }
      if (!belegt) ohneBeleg.add(m[0]);
    }
  }
  return [...ohneBeleg];
}

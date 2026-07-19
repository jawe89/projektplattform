/**
 * Kontrollsummen-Abgleich mit erklärbaren Positionen (O-M3).
 *
 * Bei der Quelle «Positionenvergleich» weicht die Positionssumme
 * systematisch vom Offerten-Endbetrag (Kontrollsumme) ab, weil BauPlus
 * nicht-bieterbezogene Positionen (z.B. den Regieansatz) nicht in die
 * Bieterspalten stellt. Solche Positionen (aus lib/ov-parse.ts) erklären
 * die Differenz: Die Ampel wird nur grün, wenn die Differenz VOLLSTÄNDIG
 * durch benannte Positionen erklärt ist; bleibt eine Restdifferenz, wird
 * sie als echte Abweichung geflaggt.
 *
 * Reine Logik – unit-getestet in tests/ov-abgleich.test.ts.
 */

export interface OvErklaerbarePosition {
  npk: string;
  bezeichnung: string;
  betragRp: number;
}

export type OvAbgleichStatus =
  | 'ohne' // keine Kontrollsumme erfasst
  | 'deckungsgleich' // Differenz 0, keine erklärbaren Positionen nötig
  | 'erklaert' // Differenz vollständig durch benannte Positionen erklärt
  | 'abweichung'; // echte Restdifferenz (evtl. teilweise erklärt)

export interface OvAbgleich {
  status: OvAbgleichStatus;
  kontrollsummeRp: number | null;
  positionSummeRp: number;
  /** Kontrollsumme − Positionssumme */
  diffRp: number;
  /** Summe der angewandten erklärbaren Positionen */
  erklaertRp: number;
  /** Verbleibende Differenz nach Abzug der erklärbaren Positionen */
  restRp: number;
  erklaert: OvErklaerbarePosition[];
}

export function berechneAbgleich(
  positionSummeRp: number,
  kontrollsummeRp: number | null,
  erklaerbare: OvErklaerbarePosition[],
): OvAbgleich {
  if (kontrollsummeRp === null) {
    return {
      status: 'ohne',
      kontrollsummeRp: null,
      positionSummeRp,
      diffRp: 0,
      erklaertRp: 0,
      restRp: 0,
      erklaert: [],
    };
  }
  const diffRp = kontrollsummeRp - positionSummeRp;
  const erklaertRp = erklaerbare.reduce((sum, e) => sum + e.betragRp, 0);
  const restRp = diffRp - erklaertRp;

  let status: OvAbgleichStatus;
  if (erklaertRp === 0) {
    status = diffRp === 0 ? 'deckungsgleich' : 'abweichung';
  } else {
    status = restRp === 0 ? 'erklaert' : 'abweichung';
  }

  return {
    status,
    kontrollsummeRp,
    positionSummeRp,
    diffRp,
    erklaertRp,
    restRp,
    // Bei einer Abweichung ohne Erklärung keine Positionen ausweisen
    erklaert: erklaertRp === 0 ? [] : erklaerbare,
  };
}

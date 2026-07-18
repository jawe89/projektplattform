/**
 * Unit-Tests der KI-Zahlendisziplin (lib/ov-zahlen.ts): Einzelwerte,
 * 2er-/3er-Summen desselben Bieters, Aggregat-Differenzen zwischen
 * Bietern – und dass erfundene Zahlen weiterhin flaggen.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pruefeZahlen, type OvZahlenMatrix } from '../lib/ov-zahlen';

// Bieter A: 2'200.– / 501'600.– / 66'000.– · Bieter B: 417'450.– (2×) + 82'528.–
const MATRIX: OvZahlenMatrix = {
  bieterPositionenRp: [
    [220000, 50160000, 6600000],
    [41745000, 41745000, 8252800],
  ],
  aggregatGruppenRp: [
    [149447015, 232335485], // Totale
    [57465000, 137743500], // Kostenblock Entsorgung
  ],
  einzelwerteRp: [123400],
};

describe('pruefeZahlen', () => {
  it('akzeptiert Einzelwerte (±1) und ignoriert Zahlen ohne Apostroph', () => {
    const result = pruefeZahlen(
      ['CHF 501’600 bzw. gerundet 501’601; Position 711.222 mit 66 m3.'],
      MATRIX,
    );
    assert.deepEqual(result, []);
  });

  it('akzeptiert 2er-Summen desselben Bieters', () => {
    // 2'200 + 501'600 = 503'800 (Bieter A)
    assert.deepEqual(pruefeZahlen(['Summe CHF 503’800'], MATRIX), []);
    // 417'450 + 417'450 = 834'900 (Bieter B, zwei Positionen gleichen Werts)
    assert.deepEqual(pruefeZahlen(['zusammen 834’900'], MATRIX), []);
  });

  it('akzeptiert 3er-Summen desselben Bieters', () => {
    // 2'200 + 501'600 + 66'000 = 569'800 (Bieter A)
    assert.deepEqual(pruefeZahlen(['total 569’800'], MATRIX), []);
  });

  it('flaggt Summen über Bieter hinweg', () => {
    // 501'600 (A) + 82'528 (B) = 584'128 – kein gültiger Rechenweg
    assert.deepEqual(pruefeZahlen(['CHF 584’128'], MATRIX), [
      '584’128',
    ]);
  });

  it('akzeptiert Aggregat-Differenzen zwischen Bietern', () => {
    // Totale: 2'323'355 − 1'494'470 = 828'885
    assert.deepEqual(pruefeZahlen(['Vorsprung von CHF 828’885'], MATRIX), []);
    // Kostenblock: 1'377'435 − 574'650 = 802'785
    assert.deepEqual(pruefeZahlen(['Delta im Block: 802’785'], MATRIX), []);
  });

  it('flaggt erfundene Zahlen', () => {
    const result = pruefeZahlen(
      ["CHF 999'123 und plausible 501'600"],
      MATRIX,
    );
    assert.deepEqual(result, ["999'123"]);
  });

  it('akzeptiert Werte aus einzelwerteRp', () => {
    assert.deepEqual(pruefeZahlen(['Median CHF 1’234'], MATRIX), []);
  });
});

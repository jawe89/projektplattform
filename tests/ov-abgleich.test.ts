/**
 * Unit-Tests des Kontrollsummen-Abgleichs mit erklärbaren Positionen
 * (O-M3, lib/ov-abgleich.ts) – 281.6-Regieansatz-Fall.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { berechneAbgleich } from '../lib/ov-abgleich';

const REGIE = [
  { npk: '645.181.801', bezeichnung: 'Regieansatz', betragRp: 250000 },
];

describe('berechneAbgleich', () => {
  it('ohne Kontrollsumme → Status «ohne»', () => {
    const r = berechneAbgleich(8103950, null, REGIE);
    assert.equal(r.status, 'ohne');
  });

  it('Differenz exakt durch Regieansatz erklärt → «erklaert» (grün)', () => {
    // Positionssumme 81'039.50, Kontrollsumme 83'539.50, Regie Fr. 2'500
    const r = berechneAbgleich(8103950, 8353950, REGIE);
    assert.equal(r.status, 'erklaert');
    assert.equal(r.diffRp, 250000);
    assert.equal(r.erklaertRp, 250000);
    assert.equal(r.restRp, 0);
    assert.equal(r.erklaert.length, 1);
    assert.equal(r.erklaert[0].npk, '645.181.801');
  });

  it('künstliche Restdifferenz → «abweichung» (geflaggt)', () => {
    // Kontrollsumme Fr. 1'000 zu hoch: Regie erklärt 2'500, es bleiben 1'000
    const r = berechneAbgleich(8103950, 8453950, REGIE);
    assert.equal(r.status, 'abweichung');
    assert.equal(r.restRp, 100000);
    // erklärter Teil bleibt ausgewiesen
    assert.equal(r.erklaertRp, 250000);
  });

  it('ohne erklärbare Positionen und Differenz 0 → «deckungsgleich»', () => {
    const r = berechneAbgleich(1494470_15, 1494470_15, []);
    assert.equal(r.status, 'deckungsgleich');
    assert.deepEqual(r.erklaert, []);
  });

  it('ohne erklärbare Positionen und Differenz ≠ 0 → «abweichung»', () => {
    const r = berechneAbgleich(1494470_15, 1494480_15, []);
    assert.equal(r.status, 'abweichung');
    assert.equal(r.diffRp, 1000);
    assert.deepEqual(r.erklaert, []);
  });

  it('Bieter ohne den Regieansatz im Endbetrag → «abweichung»', () => {
    // Endbetrag = Positionssumme (Regie nicht eingerechnet) → Restdifferenz
    const r = berechneAbgleich(8103950, 8103950, REGIE);
    assert.equal(r.status, 'abweichung');
    assert.equal(r.restRp, -250000);
  });
});

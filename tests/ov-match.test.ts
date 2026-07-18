/**
 * Unit-Tests der Vollständigkeits-Abgleichslogik (O-M2, lib/ov-match.ts).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  matchOfferte,
  normalizeEinheit,
  type OvMatchOffertePosition,
  type OvMatchReferenzPosition,
} from '../lib/ov-match';

function ref(
  npk: string,
  overrides: Partial<OvMatchReferenzPosition> = {},
): OvMatchReferenzPosition {
  return {
    npk,
    bezeichnung: `Position ${npk}`,
    menge: 10,
    einheit: 'm3',
    ...overrides,
  };
}

function offer(
  npk: string,
  overrides: Partial<OvMatchOffertePosition> = {},
): OvMatchOffertePosition {
  return {
    npk,
    bezeichnung: `Position ${npk}`,
    menge: 10,
    einheit: 'm3',
    produkt: null,
    bemerkung: null,
    ...overrides,
  };
}

describe('normalizeEinheit', () => {
  it('normalisiert Hochzahlen, Gross-/Kleinschreibung und Aliase', () => {
    assert.equal(normalizeEinheit('m²'), 'm2');
    assert.equal(normalizeEinheit('M3'), 'm3');
    assert.equal(normalizeEinheit('Stk'), 'st');
    assert.equal(normalizeEinheit('St.'), 'st');
    assert.equal(normalizeEinheit('to'), 't');
    assert.equal(normalizeEinheit(' h '), 'h');
  });
});

describe('matchOfferte', () => {
  it('meldet nichts bei deckungsgleichen Listen', () => {
    const result = matchOfferte(
      [ref('211.111.100'), ref('211.111.200')],
      [offer('211.111.100'), offer('211.111.200')],
    );
    assert.deepEqual(result, []);
  });

  it('erkennt fehlende Positionen mit erwarteter Menge', () => {
    const result = matchOfferte(
      [ref('211.111.100'), ref('211.222.300', { menge: 5, einheit: 'St' })],
      [offer('211.111.100')],
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].typ, 'fehlend');
    assert.equal(result[0].npk, '211.222.300');
    assert.equal(result[0].erwartet, '5 St');
  });

  it('erkennt zusätzliche Positionen der Offerte', () => {
    const result = matchOfferte(
      [ref('211.111.100')],
      [offer('211.111.100'), offer('211.999.100', { menge: 2, einheit: 'gl' })],
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].typ, 'zusaetzlich');
    assert.equal(result[0].npk, '211.999.100');
    assert.equal(result[0].gefunden, '2 gl');
  });

  it('erkennt Mengenabweichungen mit beiden Werten', () => {
    const result = matchOfferte(
      [ref('211.111.100', { menge: 34000 })],
      [offer('211.111.100', { menge: 30000 })],
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].typ, 'menge');
    assert.equal(result[0].erwartet, '34000 m3');
    assert.equal(result[0].gefunden, '30000 m3');
  });

  it('toleriert Rundung bis 0.001 und fehlende Mengen', () => {
    const result = matchOfferte(
      [ref('211.111.100', { menge: 10.0004 }), ref('211.111.200', { menge: null })],
      [offer('211.111.100', { menge: 10 }), offer('211.111.200', { menge: 7 })],
    );
    assert.deepEqual(result, []);
  });

  it('meldet Einheiten-Wechsel statt Mengenabweichung', () => {
    const result = matchOfferte(
      [ref('211.111.100', { menge: 120, einheit: 'm3' })],
      [offer('211.111.100', { menge: 260, einheit: 'm2' })],
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].typ, 'einheit');
    assert.equal(result[0].erwartet, '120 m3');
    assert.equal(result[0].gefunden, '260 m2');
  });

  it('wertet m² und m2 als gleiche Einheit', () => {
    const result = matchOfferte(
      [ref('211.111.100', { einheit: 'm²', menge: 50 })],
      [offer('211.111.100', { einheit: 'm2', menge: 50 })],
    );
    assert.deepEqual(result, []);
  });

  it('erkennt Produktwechsel, toleriert aber Schreibvarianten', () => {
    const result = matchOfferte(
      [
        ref('211.111.100', { produkt: 'Sika Swell-P Profil Typ 2010H' }),
        ref('211.111.200', { produkt: 'Sika Swell-P 2010H' }),
      ],
      [
        offer('211.111.100', { produkt: 'Tricosal Quellband Typ B' }),
        offer('211.111.200', { produkt: 'Sika Swell-P Profil Typ 2010H' }),
      ],
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].typ, 'produkt');
    assert.equal(result[0].npk, '211.111.100');
    assert.equal(result[0].erwartet, 'Sika Swell-P Profil Typ 2010H');
    assert.equal(result[0].gefunden, 'Tricosal Quellband Typ B');
  });

  it('meldet kein Produkt-Delta, wenn nur die Offerte ein Fabrikat nennt', () => {
    const result = matchOfferte(
      [ref('211.111.100', { produkt: null })],
      [offer('211.111.100', { produkt: 'Rausa AG Retentionsbox' })],
    );
    assert.deepEqual(result, []);
  });

  it('führt doppelte Offerten-NPK zusammen (Chunk-Überlappung)', () => {
    const result = matchOfferte(
      [ref('211.111.100', { menge: 10 })],
      [
        offer('211.111.100', { menge: null }),
        offer('211.111.100', { menge: 10 }),
      ],
    );
    assert.deepEqual(result, []);
  });
});

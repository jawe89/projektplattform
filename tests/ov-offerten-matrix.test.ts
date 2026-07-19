/**
 * Unit-Test der Preismatrix aus Offerten-Extraktion (O-M3, zweite
 * Preisquelle): baueOffertenMatrix ordnet je Bieter-Offerte die Beträge
 * der richtigen Spalte zu und markiert handschriftlich gelesene Werte.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { baueOffertenMatrix } from '../lib/ov-offerten-matrix';
import type { OvDokPositionRow } from '../lib/types';

function pos(
  dokument_id: string,
  npk: string,
  betrag_rp: number | null,
  overrides: Partial<OvDokPositionRow> = {},
): OvDokPositionRow {
  return {
    id: `${dokument_id}-${npk}`,
    project_id: 'p',
    vergabe_id: 'v',
    dokument_id,
    npk,
    bezeichnung: `Pos ${npk}`,
    menge: 10,
    einheit: 'm2',
    betrag_rp,
    produkt: null,
    bemerkung: null,
    handschriftlich: false,
    chunk: 0,
    ...overrides,
  };
}

test('baueOffertenMatrix: Spaltenzuordnung, Union, Handschrift', () => {
  const bieter = [
    { id: 'b1', name: 'A AG' },
    { id: 'b2', name: 'B AG' },
  ];
  const offerDocs = [
    { id: 'doc1', bieter_id: 'b1' },
    { id: 'doc2', bieter_id: 'b2' },
  ];
  const dok: OvDokPositionRow[] = [
    pos('doc1', '281.645.101', 500000),
    pos('doc2', '281.645.101', 480000, { handschriftlich: true }),
    // Nur Bieter B hat diese Position → A bleibt null
    pos('doc2', '281.645.201', 12000),
  ];

  const { positionen, handschriftlich, handschriftlichCount } =
    baueOffertenMatrix(dok, offerDocs, bieter);

  // NPK-sortiert
  assert.deepEqual(
    positionen.map((p) => p.npk),
    ['281.645.101', '281.645.201'],
  );
  // Spalten korrekt: [A, B]
  assert.deepEqual(positionen[0].werteRp, [500000, 480000]);
  assert.deepEqual(positionen[1].werteRp, [null, 12000]);
  // Kapitel/Gruppe aus der NPK abgeleitet
  assert.equal(positionen[0].kapitel, '281');
  assert.equal(positionen[0].gruppe, '645');
  // Handschrift: B (Index 1) bei 281.645.101
  assert.ok(handschriftlich.has('281.645.101 1'));
  assert.equal(handschriftlichCount, 1);
});

test('baueOffertenMatrix: gleicht fehlende Kapitelnummer über Offerten an', () => {
  // El-ba-Fall: eine Offerte lässt das Kapitel weg («152.101» statt
  // «645.152.101») – wird auf die eindeutige 3-Gruppen-Entsprechung
  // der anderen Bieter abgebildet, damit die Preise fluchten.
  const bieter = [
    { id: 'b1', name: 'A AG' },
    { id: 'b2', name: 'B AG' },
    { id: 'b3', name: 'C AG' },
  ];
  const offerDocs = [
    { id: 'doc1', bieter_id: 'b1' },
    { id: 'doc2', bieter_id: 'b2' },
    { id: 'doc3', bieter_id: 'b3' },
  ];
  const dok: OvDokPositionRow[] = [
    pos('doc1', '645.152.101', 1072000),
    pos('doc2', '645.152.101', 938000),
    pos('doc3', '152.101', 616400), // Kapitel fehlt
  ];
  const { positionen } = baueOffertenMatrix(dok, offerDocs, bieter);
  // Eine gemeinsame Position, alle drei Spalten gefüllt
  assert.equal(positionen.length, 1);
  assert.equal(positionen[0].npk, '645.152.101');
  assert.deepEqual(positionen[0].werteRp, [1072000, 938000, 616400]);
});

test('baueOffertenMatrix: mehrdeutiges Kapitel bleibt unverändert', () => {
  const bieter = [{ id: 'b1', name: 'A AG' }, { id: 'b2', name: 'B AG' }];
  const offerDocs = [
    { id: 'doc1', bieter_id: 'b1' },
    { id: 'doc2', bieter_id: 'b2' },
  ];
  const dok: OvDokPositionRow[] = [
    pos('doc1', '645.152.101', 100),
    pos('doc1', '771.152.101', 200), // zweites Kapitel mit gleichem Ende
    pos('doc2', '152.101', 300), // mehrdeutig → nicht abgebildet
  ];
  const { positionen } = baueOffertenMatrix(dok, offerDocs, bieter);
  assert.ok(positionen.some((p) => p.npk === '152.101'));
});

test('baueOffertenMatrix: Offerte ohne Bieter-Zuordnung wird ignoriert', () => {
  const bieter = [{ id: 'b1', name: 'A AG' }];
  const offerDocs = [
    { id: 'doc1', bieter_id: 'b1' },
    { id: 'doc2', bieter_id: null },
  ];
  const dok: OvDokPositionRow[] = [
    pos('doc1', '281.645.101', 500000),
    pos('doc2', '281.645.999', 999999),
  ];
  const { positionen } = baueOffertenMatrix(dok, offerDocs, bieter);
  assert.deepEqual(
    positionen.map((p) => p.npk),
    ['281.645.101'],
  );
});

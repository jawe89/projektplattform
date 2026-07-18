/**
 * Parser-Tests gegen die ECHTEN BauPlus-Beispiel-PDFs (O-M0-Kontrollwerte):
 * BKP 211 – 191 Preiszeilen, Summen rappengenau deckungsgleich mit den
 * Offerten-Endbeträgen (Vetter «Total brutto» 1'494'470.15, Oberhänsli
 * «Zwischentotal» 2'323'354.85); BKP 211.4 – 162 Preiszeilen, andere
 * Bieter-Spaltenreihenfolge (muss aus dem Kopf gelesen werden).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parsePositionenvergleich } from '../lib/ov-parse';

const DIR = 'scripts/data/offertenvergleich';

function load(name: string): Uint8Array {
  return new Uint8Array(readFileSync(`${DIR}/${name}`));
}

test('BKP 211: vollständig, rappengenau, Bieter in Kopf-Reihenfolge', async () => {
  const result = await parsePositionenvergleich(
    load('MCD_239 Opening_Wattwil BKP 211 Positionenvergleich.pdf'),
  );

  assert.equal(result.meta.projectNo, 'MCD_239');
  assert.equal(result.meta.bkp, '211');
  assert.equal(result.meta.titel, 'Baumeisterarbeiten + Baugrube');
  assert.equal(result.meta.lvNummer, '21100');
  assert.equal(result.meta.datum, '2026-05-22');

  assert.deepEqual(
    result.bieter.map((b) => b.name),
    ['Vetter AG', 'E.Weber AG', 'Oberhänsli Bau AG'],
  );
  assert.equal(result.bieter[0].ort, '9506 Lommis');
  assert.equal(result.bieter[2].telefon, '+41 71 982 88 66');

  assert.equal(result.unparsedLines.length, 0);
  assert.equal(result.positionen.length, 191);

  // Summen-Abgleich (O-M0-Nachweis): exakt die Offerten-Endbeträge
  assert.deepEqual(result.summenRp, [149447015, 194879030, 232335485]);

  // Negative Einheitspreise von E. Weber (Spalte 2) an den bekannten NPK
  const schuett = result.positionen.find((p) => p.npk === '211.512.102');
  assert.ok(schuett);
  assert.equal(schuett.werteRp[1], -2050000);
  const oberboden = result.positionen.find((p) => p.npk === '211.751.111');
  assert.ok(oberboden);
  assert.equal(oberboden.werteRp[1], -1310400);

  // «inkl.»-Zellen: 4 Stück, alle bei Vetter (Spalte 1)
  const inklProBieter = result.bieter.map(
    (_, i) => result.positionen.filter((p) => p.werteRp[i] === null).length,
  );
  assert.deepEqual(inklProBieter, [4, 0, 0]);

  // Stichprobe Baustelleneinrichtung (Referenzbericht)
  const be = result.positionen.find((p) => p.npk === '113.111.001');
  assert.ok(be);
  assert.deepEqual(be.werteRp, [19140000, 1000000, 3500000]);
  assert.equal(be.menge, 1);
  assert.equal(be.einheit, 'gl');
});

test('BKP 211.4: andere Spaltenreihenfolge, vollständig', async () => {
  const result = await parsePositionenvergleich(
    load('MCD_239 Opening_Wattwil BKP 211.4 Positionenvergleich.pdf'),
  );

  assert.equal(result.meta.bkp, '211.4');
  assert.equal(result.meta.lvNummer, '21140');

  // Spaltenreihenfolge hier: Vetter, Oberhänsli, E.Weber (aus dem Kopf!)
  assert.deepEqual(
    result.bieter.map((b) => b.name),
    ['Vetter AG', 'Oberhänsli Bau AG', 'E.Weber AG'],
  );

  assert.equal(result.unparsedLines.length, 0);
  assert.equal(result.positionen.length, 162);
  assert.deepEqual(result.summenRp, [89557730, 118300220, 118643995]);
});

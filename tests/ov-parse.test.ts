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
import { parsePositionenvergleich, parsePreiszeilenWerte } from '../lib/ov-parse';

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

test('parsePreiszeilenWerte: per-Positionen (BKP-271-Format) und Normalfall', () => {
  // «271.1 - W per St A A A» → nach Präfix/Marker/Menge/Einheit/Trenner-A
  // bleibt der Marker-Rest «A A» (2 Bieter): keine Menge, alle Werte null
  assert.deepEqual(parsePreiszeilenWerte('per', 'A A', 2), {
    menge: null,
    werteRp: [null, null],
  });
  // per-Zeile MIT Beträgen bleibt bewusst unparsebar (harte Selbstprüfung)
  assert.equal(parsePreiszeilenWerte('per', "12.00 A 15.00 A", 2), null);
  // Marker-Anzahl muss der Bieterzahl entsprechen
  assert.equal(parsePreiszeilenWerte('per', 'A A A', 2), null);
  // Normalfall unverändert: Beträge + inkl. + negativ
  assert.deepEqual(parsePreiszeilenWerte('10.000', "1’360.00 A inkl. I -13’104.00 A", 3), {
    menge: 10,
    werteRp: [136000, null, -1310400],
  });
});

test('BKP 281.6: blanker LV-Präfix «- -» (Split-Format), Preise lesbar', async () => {
  // Produktiv-Variante: Offerten ausserhalb BauPlus ausgefüllt → die
  // Preiszeilen tragen einen blanken LV-Kurzform-Präfix «- -» statt der
  // BKP-Nummer. Der Parser darf davon nicht auf «keine Preise» fallen.
  const result = await parsePositionenvergleich(
    load('281.6/MCD_239 Opening_Wattwil BKP 281.6 Positionenvergleich.pdf'),
  );

  assert.equal(result.meta.bkp, '281.6');
  assert.equal(result.meta.titel, 'Bodenbeläge: Plattenarbeiten');
  assert.equal(result.meta.lvNummer, '28160');

  // Bieter-Reihenfolge aus dem Kopf
  assert.deepEqual(
    result.bieter.map((b) => b.name),
    ['Philippin Plattenbeläge AG', 'Baschti Keramik GmbH', 'El-ba AG'],
  );

  assert.equal(result.unparsedLines.length, 0);
  assert.equal(result.positionen.length, 23);
  // Positionssummen je Bieter (Offerten-Endbeträge minus Regie-Annahme
  // Fr. 2'500 der Pos. 181.801, die BauPlus nicht in die Spalten stellt)
  assert.deepEqual(result.summenRp, [8103950, 8694000, 8967800]);
});

test('BKP 281.6: erklärbare Position (Regieansatz) erkannt', async () => {
  const result = await parsePositionenvergleich(
    load('281.6/MCD_239 Opening_Wattwil BKP 281.6 Positionenvergleich.pdf'),
  );
  // Genau die Regieansatz-Position (Betrag im Text, keine Bieterspalten)
  assert.equal(result.erklaerbarePositionen.length, 1);
  assert.equal(result.erklaerbarePositionen[0].betragRp, 250000);
  assert.match(result.erklaerbarePositionen[0].npk, /181\.801$/);
});

test('BKP 211/211.4: keine erklärbaren Positionen (Merkmalcodes gefiltert)', async () => {
  for (const f of [
    'MCD_239 Opening_Wattwil BKP 211 Positionenvergleich.pdf',
    'MCD_239 Opening_Wattwil BKP 211.4 Positionenvergleich.pdf',
  ]) {
    const result = await parsePositionenvergleich(load(f));
    assert.equal(result.erklaerbarePositionen.length, 0);
  }
});

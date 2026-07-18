/** Statistik-Engine Offertenvergleich – Konzept-Regeln (Prüfmodul 2). */
import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import {
  autoWichtig,
  computeAnalyse,
  deltaPct,
  kostenblockOf,
  medianRp,
  positionStat,
  type OvCalcPosition,
} from '../lib/ov-calc';

function pos(
  npk: string,
  werteRp: (number | null)[],
  extra: Partial<OvCalcPosition> = {},
): OvCalcPosition {
  const [kapitel = '111', gruppe = '112'] = npk.split('.');
  return {
    npk,
    kapitel,
    gruppe,
    bezeichnung: `Position ${npk}`,
    menge: 1,
    einheit: 'gl',
    werteRp,
    ...extra,
  };
}

describe('medianRp / deltaPct', () => {
  test('ungerade und gerade Anzahl', () => {
    assert.equal(medianRp([300, 100, 200]), 200);
    assert.equal(medianRp([100, 200, 300, 400]), 250);
    assert.equal(medianRp([]), null);
  });

  test('Delta zum Median in Prozent', () => {
    assert.equal(deltaPct(150, 100), 50);
    assert.equal(deltaPct(50, 100), -50);
    assert.equal(deltaPct(100, 0), null);
  });
});

describe('positionStat', () => {
  test('Ranking pro Position: Minimum/Maximum, Spannweite', () => {
    const stat = positionStat(pos('111.112.001', [136000, 108000, 115050]));
    assert.equal(stat.minIndex, 1);
    assert.equal(stat.maxIndex, 0);
    assert.equal(stat.spreadRp, 28000);
    assert.equal(stat.medianRp, 115050);
  });

  test('«inkl.» zählt nicht in Median/Deltas und wird geflaggt', () => {
    const stat = positionStat(pos('113.111.002', [null, 1900000, 100]));
    assert.equal(stat.medianRp, Math.round((1900000 + 100) / 2));
    assert.equal(stat.deltaPct[0], null);
    assert.deepEqual(stat.flags[0], ['inkl']);
  });

  test('identische Preise: kein Günstigster/Teuerster', () => {
    const stat = positionStat(pos('111.112.001', [1000, 1000, 1000]));
    assert.equal(stat.minIndex, null);
    assert.equal(stat.maxIndex, null);
    assert.equal(stat.spreadRp, 0);
  });

  test('Flags: negativ, Preis 1.00, Ausreisser > 3× / < 1/3 Median', () => {
    const stat = positionStat(pos('211.512.102', [2460000, -2050000, 6221750]));
    assert.ok(stat.flags[1].includes('negativ'));

    const kran = positionStat(pos('113.512.111', [100, 1700000, 1200000]));
    assert.ok(kran.flags[0].includes('einheitspreis_1'));
    assert.ok(kran.flags[0].includes('ausreisser_tief'));
    assert.ok(!kran.flags[2].includes('ausreisser_hoch'));

    const hoch = positionStat(pos('111.112.001', [100000, 100000, 400000]));
    assert.ok(hoch.flags[2].includes('ausreisser_hoch'));
  });
});

describe('kostenblockOf', () => {
  test('NPK-Systematik mit 211/241-Verfeinerung und Fallback', () => {
    assert.equal(kostenblockOf('111', '112'), 'Regiearbeiten');
    assert.equal(kostenblockOf('211', '711'), 'Entsorgung / Transporte');
    assert.equal(kostenblockOf('211', '512'), 'Schüttung / Hinterfüllung');
    assert.equal(kostenblockOf('211', '211'), 'Aushub');
    assert.equal(kostenblockOf('241', '231'), 'Schalungen');
    assert.equal(kostenblockOf('241', '511'), 'Bewehrung / Stahleinlagen');
    assert.equal(kostenblockOf('999', '100'), 'NPK 999');
  });
});

describe('computeAnalyse', () => {
  const positionen = [
    pos('211.711.222', [50160000, 14047000, 41745000]),
    pos('211.751.116', [220000, 86614000, 41745000]),
    pos('113.111.001', [19140000, 1000000, 3500000]),
    pos('113.111.002', [null, 1900000, 100]),
  ];

  test('Bietertotale, Ranking, Summen-Abgleich', () => {
    const analyse = computeAnalyse(positionen, 3, [69520000, null, 87000000]);
    assert.deepEqual(analyse.bieterTotaleRp, [69520000, 103561000, 86990100]);
    // Rang 1 = günstigster (Index 0), dann 2, dann 1
    assert.deepEqual(analyse.ranking, [0, 2, 1]);
    assert.equal(analyse.abgleich[0].diffRp, 0);
    assert.equal(analyse.abgleich[1].diffRp, null);
    assert.equal(analyse.abgleich[2].diffRp, -9900);
  });

  test('Kostenblöcke summieren pro Bieter («inkl.» = 0)', () => {
    const analyse = computeAnalyse(positionen, 3);
    const entsorgung = analyse.kostenbloecke.find(
      (b) => b.name === 'Entsorgung / Transporte',
    );
    assert.ok(entsorgung);
    assert.deepEqual(entsorgung.summenRp, [50380000, 100661000, 83490000]);
    assert.equal(entsorgung.positionCount, 2);
    const be = analyse.kostenbloecke.find(
      (b) => b.name === 'Baustelleneinrichtung',
    );
    assert.ok(be);
    assert.deepEqual(be.summenRp, [19140000, 2900000, 3500100]);
  });

  test('Hot Spots nach Kostenrelevanz (Spannweite) absteigend', () => {
    const analyse = computeAnalyse(positionen, 3);
    assert.deepEqual(analyse.hotspots.slice(0, 2), [
      '211.751.116', // Spannweite 863'940.00
      '211.711.222', // Spannweite 361'130.00
    ]);
  });

  test('autoWichtig: Top-N plus geflaggte Positionen', () => {
    const analyse = computeAnalyse(positionen, 3);
    const wichtig = autoWichtig(analyse, 2);
    assert.ok(wichtig.has('211.751.116'));
    assert.ok(wichtig.has('211.711.222'));
    // 113.111.002 ist nicht Top-2, aber «inkl.»/Preis-1.00-geflaggt
    assert.ok(wichtig.has('113.111.002'));
  });
});

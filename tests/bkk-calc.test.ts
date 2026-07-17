/**
 * Unit-Tests der BKK-Berechnungslogik (lib/bkk-calc.ts).
 *
 * Sichert die dokumentierten Feinheiten des Alt-Tools ab, jetzt
 * baseline-bezogen (0008, Lesart B): Baseline-Total historisch fix pro
 * Baseline (zählt auch ausgeblendete Positionen), Positionen ohne
 * Baseline-Wert zählen 0 (alte Custom-Positionen-Regel), Status-Ampel-
 * Reihenfolge mit Toleranzfaktoren, 5-Rappen-Rundung als
 * Totalisierungsregel, Baseline-Wechsel ändert alle Vergleichszahlen.
 * Ausführen mit: npm run test:unit
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  type BkkCalcEntry,
  type BkkCalcOptions,
  type BkkCalcPosition,
  type BkkPositionWithEntries,
  baselineRp,
  deltaPct,
  deltaTone,
  displayRp,
  effectiveKvMutRp,
  entrySums,
  groupSubtotals,
  kvMutKpi,
  offenRp,
  positionStatus,
  round5Rp,
  sharePct,
  shareTone,
  totals,
  vertragKpiAmpel,
  zahlungKpiAmpel,
} from '../lib/bkk-calc';

const exact: BkkCalcOptions = { round5: false };
const rounded: BkkCalcOptions = { round5: true };

function position(overrides: Partial<BkkCalcPosition> = {}): BkkCalcPosition {
  return {
    bkp: '211',
    kvBaselineRp: 100_000_00,
    kvMutRp: null,
    hidden: false,
    ...overrides,
  };
}

function vertrag(betragRp: number): BkkCalcEntry {
  return { entryType: 'vertrag', betragRp };
}
function zahlung(betragRp: number): BkkCalcEntry {
  return { entryType: 'zahlung', betragRp };
}

describe('round5Rp / displayRp', () => {
  it('rundet auf die nächsten 5 Rappen', () => {
    assert.equal(round5Rp(121), 120);
    assert.equal(round5Rp(122), 120);
    assert.equal(round5Rp(123), 125);
    assert.equal(round5Rp(125), 125);
    assert.equal(round5Rp(0), 0);
    assert.equal(round5Rp(-123), -125);
  });

  it('displayRp rundet nur bei aktiver Regel', () => {
    assert.equal(displayRp(123, rounded), 125);
    assert.equal(displayRp(123, exact), 123);
  });
});

describe('baselineRp / effectiveKvMutRp', () => {
  it('Baseline-Wert; fehlend («nicht in dieser Baseline») = 0', () => {
    assert.equal(baselineRp(position(), exact), 100_000_00);
    assert.equal(baselineRp(position({ kvBaselineRp: null }), exact), 0);
  });

  it('KV mutiert effektiv: Mutation, sonst Baseline, sonst 0', () => {
    assert.equal(effectiveKvMutRp(position(), exact), 100_000_00);
    assert.equal(effectiveKvMutRp(position({ kvMutRp: 150_000_00 }), exact), 150_000_00);
    // 0 ist eine gültige Mutation
    assert.equal(effectiveKvMutRp(position({ kvMutRp: 0 }), exact), 0);
    // ohne Baseline-Wert läuft das Budget über die Mutationsebene
    assert.equal(
      effectiveKvMutRp(position({ kvBaselineRp: null, kvMutRp: 65_000_00 }), exact),
      65_000_00,
    );
    assert.equal(effectiveKvMutRp(position({ kvBaselineRp: null }), exact), 0);
  });
});

describe('entrySums', () => {
  it('summiert Verträge und Zahlungen getrennt', () => {
    const sums = entrySums(
      [vertrag(100_00), vertrag(200_00), zahlung(50_00)],
      exact,
    );
    assert.deepEqual(sums, { vertragRp: 300_00, zahlungRp: 50_00 });
  });
});

describe('positionStatus – Reihenfolge und Toleranzen wie im Alt-Tool', () => {
  const pos = position({ kvBaselineRp: 100_000_00 }); // kvm = 10'000'000 Rp

  it('keine Einträge → offen', () => {
    assert.equal(positionStatus(pos, [], exact), 'offen');
  });

  it('Verträge über KV erst ab +0.1 % Toleranz → ueber_kv', () => {
    // knapp über KV (+0.05 %) liegt innerhalb der Toleranz …
    assert.equal(positionStatus(pos, [vertrag(10_005_000)], exact), 'vertrag');
    // … deutlich darüber (+0.2 %) nicht mehr
    assert.equal(positionStatus(pos, [vertrag(10_020_000)], exact), 'ueber_kv');
  });

  it('kvm = 0 (Mutation auf 0 oder ohne Baseline-Wert) → nie ueber_kv', () => {
    assert.equal(
      positionStatus(position({ kvMutRp: 0 }), [vertrag(100_00)], exact),
      'vertrag',
    );
    assert.equal(
      positionStatus(position({ kvBaselineRp: null }), [vertrag(100_00)], exact),
      'vertrag',
    );
  });

  it('Zahlungen ab 99.9 % der Verträge → bezahlt', () => {
    assert.equal(
      positionStatus(pos, [vertrag(100_000_00), zahlung(99_900_00)], exact),
      'bezahlt',
    );
    assert.equal(
      positionStatus(pos, [vertrag(100_000_00), zahlung(99_899_99)], exact),
      'teilbezahlt',
    );
  });

  it('ueber_kv gewinnt vor bezahlt (Prüfreihenfolge)', () => {
    assert.equal(
      positionStatus(pos, [vertrag(20_000_000), zahlung(20_000_000)], exact),
      'ueber_kv',
    );
  });

  it('nur Zahlung ohne Vertrag → teilbezahlt', () => {
    assert.equal(positionStatus(pos, [zahlung(100_00)], exact), 'teilbezahlt');
  });

  it('nur Vertrag innerhalb KV → vertrag', () => {
    assert.equal(positionStatus(pos, [vertrag(100_00)], exact), 'vertrag');
  });
});

describe('totals – Baseline-Total historisch fix, fehlende Baseline-Werte zählen 0', () => {
  const rows: BkkPositionWithEntries[] = [
    {
      position: position({ bkp: '211', kvBaselineRp: 100_000_00, kvMutRp: 120_000_00 }),
      entries: [vertrag(110_000_00), zahlung(40_000_00)],
    },
    {
      // ausgeblendet: zählt NUR ins Baseline-Total
      position: position({ bkp: '224', kvBaselineRp: 50_000_00, hidden: true }),
      entries: [vertrag(1_000_00)],
    },
    {
      // nicht in dieser Baseline (z.B. später angelegt): Baseline 0,
      // Budget über kv_mut – zählt in alles andere (alte Custom-Regel)
      position: position({ bkp: '273.0', kvBaselineRp: null, kvMutRp: 65_000_00 }),
      entries: [vertrag(60_000_00), zahlung(30_000_00)],
    },
  ];

  it('zählt exakt wie das Alt-Tool (baseline-bezogen)', () => {
    const t = totals(rows, exact);
    // Baseline: 211 + ausgeblendete 224; Position ohne Baseline-Wert 0
    assert.equal(t.kvBaselineRp, 150_000_00);
    // KV mutiert: 211 (mutiert) + 273.0 (über Mutationsebene), ausgeblendete nicht
    assert.equal(t.kvMutRp, 120_000_00 + 65_000_00);
    // Verträge/Zahlungen: sichtbare, ausgeblendete nicht
    assert.equal(t.vertragRp, 110_000_00 + 60_000_00);
    assert.equal(t.zahlungRp, 40_000_00 + 30_000_00);
    assert.equal(offenRp(t), t.vertragRp - t.zahlungRp);
  });

  it('Baseline-Wechsel ändert alle Vergleichszahlen', () => {
    // Neue Baseline «KV rev. 1» = bisheriger Stand inkl. Mutationen:
    // alle Positionen erhalten Werte (auch die bisher baseline-lose 273.0)
    const revised: BkkPositionWithEntries[] = rows.map((r) => ({
      entries: r.entries,
      position: {
        ...r.position,
        kvBaselineRp: r.position.kvMutRp ?? r.position.kvBaselineRp ?? 0,
        kvMutRp: null,
      },
    }));
    const t = totals(revised, exact);
    // Baseline neu: 120'000 + 50'000 (ausgeblendet, historisch fix) + 65'000
    assert.equal(t.kvBaselineRp, 235_000_00);
    // keine Mutationen mehr → KV mutiert = Baseline der sichtbaren
    assert.equal(t.kvMutRp, 120_000_00 + 65_000_00);
    // KPI vergleicht Mut-Total (sichtbare) mit Baseline-Total (inkl.
    // ausgeblendeter) – die Alt-Tool-Asymmetrie zeigt hier eine «Einsparung»
    const kpi = kvMutKpi(t);
    assert.equal(kpi.ampel, 'green');
    assert.equal(kpi.einsparung, true);
    // Δ der Position 211 gegenüber neuer Baseline: 0 statt +20 %
    assert.equal(deltaPct(effectiveKvMutRp(revised[0].position, exact), baselineRp(revised[0].position, exact)), 0);
    // … gegenüber der ALTEN Baseline war es +20 %
    assert.equal(deltaPct(effectiveKvMutRp(rows[0].position, exact), baselineRp(rows[0].position, exact)), 20);
  });
});

describe('groupSubtotals – Zählregel pro Spalte identisch mit dem Gesamttotal', () => {
  it('Positionen ohne Baseline-Wert zählen 0 im Baseline-Zwischentotal', () => {
    const sub = groupSubtotals(
      [
        {
          position: position({ bkp: '211', kvBaselineRp: 100_000_00 }),
          entries: [vertrag(80_000_00)],
        },
        {
          position: position({ bkp: '273.0', kvBaselineRp: null, kvMutRp: 65_000_00 }),
          entries: [zahlung(10_000_00)],
        },
      ],
      exact,
    );
    assert.deepEqual(sub, {
      kvBaselineRp: 100_000_00,
      kvMutRp: 165_000_00,
      vertragRp: 80_000_00,
      zahlungRp: 10_000_00,
    });
  });

  it('ausgeblendete Positionen zählen im Baseline-Zwischentotal, sonst nicht (Fachblick-Korrektur)', () => {
    const sub = groupSubtotals(
      [
        {
          position: position({ bkp: '112', kvBaselineRp: 20_000_00, hidden: true }),
          entries: [vertrag(1_000_00)],
        },
      ],
      exact,
    );
    assert.deepEqual(sub, {
      kvBaselineRp: 20_000_00, // historisch fix – auch im Zwischentotal
      kvMutRp: 0,
      vertragRp: 0,
      zahlungRp: 0,
    });
  });

  it('Summenprobe: Zwischentotale addieren sich pro Spalte exakt zum Gesamttotal', () => {
    const group1: BkkPositionWithEntries[] = [
      {
        // ausgeblendet: nur Baseline-Spalte
        position: position({ bkp: '112', kvBaselineRp: 20_000_00, hidden: true }),
        entries: [],
      },
    ];
    const group2: BkkPositionWithEntries[] = [
      {
        position: position({ bkp: '211', kvBaselineRp: 100_000_00, kvMutRp: 120_000_00 }),
        entries: [vertrag(110_000_00), zahlung(40_000_00)],
      },
      {
        // nicht in der Baseline (Custom): Baseline 0, Rest über kv_mut
        position: position({ bkp: '273.0', kvBaselineRp: null, kvMutRp: 65_000_00 }),
        entries: [vertrag(60_000_00), zahlung(30_000_00)],
      },
    ];
    const sub1 = groupSubtotals(group1, exact);
    const sub2 = groupSubtotals(group2, exact);
    const t = totals([...group1, ...group2], exact);
    for (const key of ['kvBaselineRp', 'kvMutRp', 'vertragRp', 'zahlungRp'] as const) {
      assert.equal(sub1[key] + sub2[key], t[key], key);
    }
    // Gesamttotal selbst unverändert (Alt-Tool-Parität für P2-M4)
    assert.equal(t.kvBaselineRp, 120_000_00);
    assert.equal(t.kvMutRp, 185_000_00);
    assert.equal(t.vertragRp, 170_000_00);
    assert.equal(t.zahlungRp, 70_000_00);
  });
});

describe('5-Rappen-Rundung als Totalisierungsregel', () => {
  it('rundet jeden Einzelbetrag vor der Summierung', () => {
    const rows: BkkPositionWithEntries[] = [
      {
        position: position({ kvBaselineRp: 101 }),
        entries: [vertrag(101), vertrag(102), zahlung(103)],
      },
    ];
    const tExact = totals(rows, exact);
    assert.equal(tExact.vertragRp, 203);
    assert.equal(tExact.zahlungRp, 103);
    assert.equal(tExact.kvBaselineRp, 101);

    const tRounded = totals(rows, rounded);
    assert.equal(tRounded.vertragRp, 200); // 100 + 100, nicht round5(203)=205
    assert.equal(tRounded.zahlungRp, 105);
    assert.equal(tRounded.kvBaselineRp, 100);
  });

  it('Alt-Tool-Werte (bereits Vielfache von 5) bleiben mit und ohne Regel identisch', () => {
    const rows: BkkPositionWithEntries[] = [
      {
        position: position({ kvBaselineRp: 140_000_000, kvMutRp: 150_000_000 }),
        entries: [vertrag(143_800_000), zahlung(44_300_000)],
      },
    ];
    assert.deepEqual(totals(rows, exact), totals(rows, rounded));
  });
});

describe('KPI «KV mutiert» (Δ%-Ampel gegenüber der aktiven Baseline)', () => {
  it('unter ±0.05 % → neutral', () => {
    const kpi = kvMutKpi({ kvBaselineRp: 100_000_00, kvMutRp: 100_004_00 });
    assert.equal(kpi.ampel, 'neutral');
    assert.equal(kpi.einsparung, false);
  });

  it('negativ → grün mit Einsparung', () => {
    const kpi = kvMutKpi({ kvBaselineRp: 100_000_00, kvMutRp: 95_000_00 });
    assert.equal(kpi.ampel, 'green');
    assert.equal(kpi.einsparung, true);
    assert.equal(kpi.deltaPct, -5);
  });

  it('0–5 % → gelb, über 5 % → rot', () => {
    assert.equal(kvMutKpi({ kvBaselineRp: 100_000_00, kvMutRp: 103_000_00 }).ampel, 'amber');
    assert.equal(kvMutKpi({ kvBaselineRp: 100_000_00, kvMutRp: 105_000_00 }).ampel, 'amber');
    assert.equal(kvMutKpi({ kvBaselineRp: 100_000_00, kvMutRp: 105_100_00 }).ampel, 'red');
  });

  it('Baseline-Total 0 → Δ 0, neutral', () => {
    assert.equal(kvMutKpi({ kvBaselineRp: 0, kvMutRp: 50_000_00 }).ampel, 'neutral');
  });
});

describe('KPI-Ampeln Verträge/Zahlungen', () => {
  it('Verträge: neutral ohne Vergabe, grün mit, rot über KV mutiert (+0.1 %)', () => {
    assert.equal(vertragKpiAmpel({ kvMutRp: 100_000_00, vertragRp: 0 }), 'neutral');
    assert.equal(vertragKpiAmpel({ kvMutRp: 100_000_00, vertragRp: 80_000_00 }), 'green');
    assert.equal(vertragKpiAmpel({ kvMutRp: 100_000_00, vertragRp: 10_010_001 }), 'red');
    // KV mutiert 0 mit Verträgen → rot (wie Alt-Tool: vertrag > 0·1.001)
    assert.equal(vertragKpiAmpel({ kvMutRp: 0, vertragRp: 1 }), 'red');
  });

  it('Zahlungen: neutral ohne Verträge, grün mit, rot über den Verträgen (+0.1 %)', () => {
    assert.equal(zahlungKpiAmpel({ vertragRp: 0, zahlungRp: 0 }), 'neutral');
    assert.equal(zahlungKpiAmpel({ vertragRp: 100_000_00, zahlungRp: 50_000_00 }), 'green');
    assert.equal(zahlungKpiAmpel({ vertragRp: 100_000_00, zahlungRp: 10_010_001 }), 'red');
  });
});

describe('Zellen-Einfärbung (deltaTone/shareTone)', () => {
  it('deltaPct/sharePct liefern null ohne Referenz (Anzeige «–»)', () => {
    assert.equal(deltaPct(100, 0), null);
    assert.equal(sharePct(0, 100), null);
    assert.equal(sharePct(100, 0), null);
  });

  it('deltaTone: > +0.05 neg, < −0.05 pos, dazwischen zero', () => {
    assert.equal(deltaTone(0.06), 'neg');
    assert.equal(deltaTone(-0.06), 'pos');
    assert.equal(deltaTone(0.05), 'zero');
    assert.equal(deltaTone(null), 'zero');
  });

  it('shareTone: > 100.05 % neg, ab 80 % pos, sonst zero', () => {
    assert.equal(shareTone(100.06), 'neg');
    assert.equal(shareTone(100.05), 'pos');
    assert.equal(shareTone(80), 'pos');
    assert.equal(shareTone(79.9), 'zero');
    assert.equal(shareTone(null), 'zero');
  });
});

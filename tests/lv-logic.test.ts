/**
 * Unit-Tests der LV-Workflow-Logik (lib/lv-logic.ts).
 *
 * Sichert die Alt-Tool-Feinheiten ab, BEVOR die Oberfläche entsteht
 * (P2-M3): Fortschritt = letzter ausgefüllter Schritt, «nach Aufwand» nur
 * bei allen vier WV-Schritten mit ⊘-Marker, «abgeschlossen» nur ohne
 * ⊘-Marker im letzten Schritt, KPI-Zählung, strikte TT.MM.JJJJ-Prüfung
 * für den Import (Entscheid 3). Ausführen mit: npm run test:unit
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LV_DONE_MARKER,
  LV_NA_MARKER,
  type LvUnitStepMap,
  isFilled,
  isNachAufwand,
  isNaValue,
  lastFilledStep,
  parseStrictSwissDate,
  unitKpis,
  unitStatus,
} from '../lib/lv-logic';

const datum = (iso: string) => ({ datum: iso, freitext: null });
const text = (value: string) => ({ datum: null, freitext: value });
const na = () => text(LV_NA_MARKER);

describe('isFilled / isNaValue', () => {
  it('ausgefüllt = Datum oder Freitext', () => {
    assert.equal(isFilled(undefined), false);
    assert.equal(isFilled({ datum: null, freitext: null }), false);
    assert.equal(isFilled(datum('2026-02-24')), true);
    assert.equal(isFilled(text(LV_DONE_MARKER)), true);
  });

  it('⊘-Marker wird auch mit Leerraum erkannt', () => {
    assert.equal(isNaValue(na()), true);
    assert.equal(isNaValue(text(`  ${LV_NA_MARKER}  `)), true);
    assert.equal(isNaValue(text('nach Aufwand')), false);
    assert.equal(isNaValue(datum('2026-02-24')), false);
  });
});

describe('lastFilledStep – letzter ausgefüllter Schritt, Lücken egal', () => {
  it('leer → null', () => {
    assert.equal(lastFilledStep({}), null);
  });

  it('rückwärts gesucht, Lücken davor spielen keine Rolle', () => {
    const steps: LvUnitStepMap = {
      lv_erstellt: datum('2026-01-10'),
      // lv_versendet fehlt (Lücke)
      off_erhalten: text('KW 34'),
    };
    assert.equal(lastFilledStep(steps), 'off_erhalten');
  });

  it('Marker zählen als ausgefüllt', () => {
    assert.equal(
      lastFilledStep({ wv_zurueck: text(LV_DONE_MARKER) }),
      'wv_zurueck',
    );
  });
});

describe('isNachAufwand – alle vier WV-Schritte mit ⊘-Marker', () => {
  it('alle vier → true', () => {
    const steps: LvUnitStepMap = {
      wv_erstellt: na(),
      wv_unt: na(),
      wv_bh: na(),
      wv_zurueck: na(),
    };
    assert.equal(isNachAufwand(steps), true);
    assert.deepEqual(unitStatus(steps), { kind: 'nach_aufwand' });
  });

  it('nur drei von vier → false', () => {
    const steps: LvUnitStepMap = {
      wv_erstellt: na(),
      wv_unt: na(),
      wv_bh: na(),
      wv_zurueck: datum('2026-06-01'),
    };
    assert.equal(isNachAufwand(steps), false);
  });

  it('Datum statt Marker zählt nicht als nach Aufwand', () => {
    assert.equal(isNachAufwand({ wv_erstellt: datum('2026-06-01') }), false);
  });
});

describe('unitStatus – Reihenfolge wie im Alt-Tool', () => {
  it('keine Schritte → offen', () => {
    assert.deepEqual(unitStatus({}), { kind: 'offen' });
  });

  it('letzter Schritt mitten im Workflow → in_arbeit mit diesem Schritt', () => {
    assert.deepEqual(
      unitStatus({ lv_erstellt: datum('2026-01-10'), av_erstellt: text('KW 12') }),
      { kind: 'in_arbeit', lastStep: 'av_erstellt' },
    );
  });

  it('WV zurück mit Datum oder ✓ → abgeschlossen', () => {
    assert.deepEqual(unitStatus({ wv_zurueck: datum('2026-06-01') }), {
      kind: 'abgeschlossen',
    });
    assert.deepEqual(unitStatus({ wv_zurueck: text(LV_DONE_MARKER) }), {
      kind: 'abgeschlossen',
    });
  });

  it('WV zurück mit ⊘-Marker allein → NICHT abgeschlossen (in_arbeit)', () => {
    assert.deepEqual(unitStatus({ wv_zurueck: na() }), {
      kind: 'in_arbeit',
      lastStep: 'wv_zurueck',
    });
  });

  it('nach_aufwand gewinnt vor abgeschlossen', () => {
    const steps: LvUnitStepMap = {
      lv_erstellt: datum('2026-01-10'),
      wv_erstellt: na(),
      wv_unt: na(),
      wv_bh: na(),
      wv_zurueck: na(),
    };
    assert.deepEqual(unitStatus(steps), { kind: 'nach_aufwand' });
  });
});

describe('unitKpis – Marker zählen als erledigt', () => {
  it('zählt wie das Alt-Tool', () => {
    const units: LvUnitStepMap[] = [
      { lv_erstellt: datum('2026-01-10'), off_erhalten: text('KW 8') },
      { lv_erstellt: text(LV_DONE_MARKER), wv_zurueck: na() },
      {},
    ];
    assert.deepEqual(unitKpis(units), {
      total: 3,
      lvErstellt: 2,
      offErhalten: 1,
      wvZurueck: 1, // ⊘-Marker zählt als ausgefüllt (wie Alt-Tool)
      offen: 1,
    });
  });
});

describe('parseStrictSwissDate – Entscheid 3 (Import verliert keine Werte)', () => {
  it('strikte TT.MM.JJJJ-Werte → ISO', () => {
    assert.equal(parseStrictSwissDate('24.02.2026'), '2026-02-24');
    assert.equal(parseStrictSwissDate('01.12.2025'), '2025-12-01');
    assert.equal(parseStrictSwissDate(' 4.6.2026 '), '2026-06-04');
  });

  it('Marker, KW-Angaben und Freitext → null (bleiben Freitext)', () => {
    assert.equal(parseStrictSwissDate(LV_DONE_MARKER), null);
    assert.equal(parseStrictSwissDate(LV_NA_MARKER), null);
    assert.equal(parseStrictSwissDate('KW 34'), null);
    assert.equal(parseStrictSwissDate('vor Baustart'), null);
    assert.equal(parseStrictSwissDate(''), null);
  });

  it('ungültige Kalenderdaten → null', () => {
    assert.equal(parseStrictSwissDate('32.01.2026'), null);
    assert.equal(parseStrictSwissDate('29.02.2026'), null); // kein Schaltjahr
    assert.equal(parseStrictSwissDate('01.13.2026'), null);
    assert.equal(parseStrictSwissDate('24.02.26'), null); // zweistelliges Jahr
  });

  it('Schaltjahr korrekt', () => {
    assert.equal(parseStrictSwissDate('29.02.2028'), '2028-02-29');
  });
});

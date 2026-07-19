/**
 * Preismatrix aus den extrahierten Offerten-Positionen (O-M3, zweite
 * Preisquelle). Reine Logik ohne IO/Server-Abhängigkeiten – unit-getestet
 * in tests/ov-offerten-matrix.test.ts. Der Extraktions-Job (server-only,
 * features/offertenvergleich/extract-offerten.ts) re-exportiert dies.
 */
import type { OvCalcPosition } from '@/lib/ov-calc';
import type { OvDokPositionRow } from '@/lib/types';

export interface OffertenMatrix {
  positionen: OvCalcPosition[];
  /** «npk bieterIndex» der handschriftlich gelesenen Werte */
  handschriftlich: Set<string>;
  /** Anzahl handschriftlich gelesener (nicht-null) Beträge in der Matrix */
  handschriftlichCount: number;
}

/**
 * Baut die Preismatrix aus den extrahierten Offerten-Positionen. Jede
 * Offerte ist einem Bieter zugeordnet (dokument.bieter_id); die Spalte
 * eines Bieters trägt den Betrag seiner Offerte je NPK. Positionen ohne
 * Betrag beim Bieter = null (zählen 0, wie «inkl.»).
 */
export function baueOffertenMatrix(
  dokPositionen: OvDokPositionRow[],
  offerDocs: { id: string; bieter_id: string | null }[],
  bieter: { id: string; name: string }[],
): OffertenMatrix {
  const colByBieter = new Map(bieter.map((b, i) => [b.id, i]));
  const bieterByDoc = new Map(offerDocs.map((d) => [d.id, d.bieter_id]));
  const canonicalNpk = buildNpkKanonisierer(dokPositionen);

  interface Agg {
    bezeichnung: string | null;
    menge: number | null;
    einheit: string | null;
    werteRp: (number | null)[];
    hand: boolean[];
  }
  const byNpk = new Map<string, Agg>();

  for (const p of dokPositionen) {
    const bieterId = bieterByDoc.get(p.dokument_id);
    if (bieterId == null) continue; // Offerte ohne Bieter-Zuordnung ignorieren
    const col = colByBieter.get(bieterId);
    if (col === undefined) continue;
    const npk = canonicalNpk(p.npk);
    let agg = byNpk.get(npk);
    if (!agg) {
      agg = {
        bezeichnung: null,
        menge: null,
        einheit: null,
        werteRp: bieter.map(() => null),
        hand: bieter.map(() => false),
      };
      byNpk.set(npk, agg);
    }
    if (p.betrag_rp !== null) agg.werteRp[col] = Number(p.betrag_rp);
    if (p.handschriftlich && p.betrag_rp !== null) agg.hand[col] = true;
    // Beschreibung/Menge/Einheit vom ersten Bieter, der sie liefert
    if (!agg.bezeichnung && p.bezeichnung) agg.bezeichnung = p.bezeichnung;
    if (agg.menge === null && p.menge !== null) agg.menge = Number(p.menge);
    if (!agg.einheit && p.einheit) agg.einheit = p.einheit;
  }

  const handschriftlich = new Set<string>();
  let handschriftlichCount = 0;
  const positionen: OvCalcPosition[] = [];
  // NPK-sortiert (stabile, fachlich lesbare Reihenfolge)
  for (const npk of [...byNpk.keys()].sort()) {
    const agg = byNpk.get(npk)!;
    const teile = npk.split('.');
    agg.hand.forEach((h, i) => {
      if (h) {
        handschriftlich.add(`${npk} ${i}`);
        handschriftlichCount++;
      }
    });
    positionen.push({
      npk,
      kapitel: teile[0] ?? '',
      gruppe: teile[1] ?? '',
      bezeichnung: agg.bezeichnung || npk,
      menge: agg.menge,
      einheit: agg.einheit ?? '',
      werteRp: agg.werteRp,
    });
  }

  return { positionen, handschriftlich, handschriftlichCount };
}

/**
 * NPK-Angleichung über Offerten hinweg: Manche Offerten-Extraktionen lassen
 * die Kapitelnummer weg (z.B. «152.101» statt «645.152.101»), sodass
 * dieselbe Position bei verschiedenen Bietern unterschiedliche NPK trägt
 * und die Preise nebeneinander nicht mehr fluchten. Trägt ein 2-Gruppen-NPK
 * (Gruppe.Position) genau EINE eindeutige 3-Gruppen-Entsprechung
 * (Kapitel.Gruppe.Position) mit gleichem Ende, wird er darauf abgebildet.
 */
function buildNpkKanonisierer(
  dokPositionen: OvDokPositionRow[],
): (npk: string) => string {
  const tailToFull = new Map<string, Set<string>>();
  for (const p of dokPositionen) {
    const parts = p.npk.split('.');
    if (parts.length >= 3) {
      const tail = parts.slice(-2).join('.');
      let set = tailToFull.get(tail);
      if (!set) {
        set = new Set();
        tailToFull.set(tail, set);
      }
      set.add(p.npk);
    }
  }
  return (npk: string): string => {
    const parts = npk.split('.');
    if (parts.length === 2) {
      const full = tailToFull.get(npk);
      if (full && full.size === 1) return [...full][0];
    }
    return npk;
  };
}

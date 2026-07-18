/**
 * Deterministischer Abgleich der Vollständigkeitsprüfung (O-M2, Konzept
 * Prüfmodul 1): Referenz-Positionsliste (Ausschreibung, sonst
 * Positionenvergleich) gegen die aus einer Offerte extrahierten Positionen.
 *
 * Erkennt: fehlende Positionen, zusätzliche Positionen, Mengenabweichungen,
 * Einheiten-Wechsel und Produktwechsel. Bei einem Einheiten-Wechsel wird
 * KEINE Mengenabweichung gemeldet (andere Einheit → Mengen nicht direkt
 * vergleichbar, Konzept 4a).
 *
 * Reine Logik ohne IO – unit-getestet in tests/ov-match.test.ts.
 */

export interface OvMatchReferenzPosition {
  npk: string;
  bezeichnung: string;
  menge: number | null;
  einheit: string | null;
  /** Produktvorgabe aus der Ausschreibung (falls Referenz = Ausschreibung) */
  produkt?: string | null;
  bemerkung?: string | null;
}

export interface OvMatchOffertePosition {
  npk: string;
  bezeichnung: string | null;
  menge: number | null;
  einheit: string | null;
  produkt: string | null;
  bemerkung: string | null;
}

export interface OvMatchAbweichung {
  typ: 'fehlend' | 'zusaetzlich' | 'menge' | 'einheit' | 'produkt';
  npk: string;
  titel: string;
  erwartet?: string;
  gefunden?: string;
}

/** Einheiten für den Vergleich normalisieren (m² = m2, St = Stk, …) */
export function normalizeEinheit(einheit: string): string {
  const cleaned = einheit
    .trim()
    .toLowerCase()
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/[.\s]/g, '');
  const aliases: Record<string, string> = {
    stk: 'st',
    stck: 'st',
    'stück': 'st',
    to: 't',
    lst: 'le',
    gl: 'gl',
    pau: 'gl',
    pauschal: 'gl',
  };
  return aliases[cleaned] ?? cleaned;
}

function produktTokens(produkt: string): Set<string> {
  return new Set(
    produkt
      .toLowerCase()
      .split(/[^a-z0-9äöü]+/)
      .filter((t) => t.length > 0),
  );
}

/** Gleiches Fabrikat in Schreibvarianten: eine Token-Menge ⊆ der anderen */
function gleichesProdukt(a: string, b: string): boolean {
  const ta = produktTokens(a);
  const tb = produktTokens(b);
  if (ta.size === 0 || tb.size === 0) return true;
  const [kurz, lang] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  for (const token of kurz) {
    if (!lang.has(token)) return false;
  }
  return true;
}

function mengeLabel(menge: number | null, einheit: string | null): string {
  if (menge === null) return einheit ?? '–';
  const text =
    menge % 1 === 0 ? String(menge) : String(Math.round(menge * 1000) / 1000);
  return `${text} ${einheit ?? ''}`.trim();
}

/**
 * Gleicht eine Offerte gegen die Referenzliste ab. Doppelte NPK auf der
 * Offertenseite werden vorab zusammengeführt (erster Eintrag mit Menge
 * gewinnt – Chunk-Überlappungen der Extraktion).
 */
export function matchOfferte(
  referenz: OvMatchReferenzPosition[],
  offerte: OvMatchOffertePosition[],
): OvMatchAbweichung[] {
  const offerByNpk = new Map<string, OvMatchOffertePosition>();
  for (const position of offerte) {
    const existing = offerByNpk.get(position.npk);
    if (!existing || (existing.menge === null && position.menge !== null)) {
      offerByNpk.set(position.npk, position);
    }
  }

  const abweichungen: OvMatchAbweichung[] = [];
  const refNpk = new Set(referenz.map((r) => r.npk));

  for (const ref of referenz) {
    const offer = offerByNpk.get(ref.npk);
    if (!offer) {
      abweichungen.push({
        typ: 'fehlend',
        npk: ref.npk,
        titel: ref.bezeichnung,
        erwartet: mengeLabel(ref.menge, ref.einheit),
      });
      continue;
    }

    const titel = ref.bezeichnung || offer.bezeichnung || ref.npk;

    // Einheiten-Wechsel (dann keine Mengenabweichung – nicht vergleichbar)
    const einheitenVergleichbar =
      ref.einheit !== null && offer.einheit !== null;
    if (
      einheitenVergleichbar &&
      normalizeEinheit(ref.einheit!) !== normalizeEinheit(offer.einheit!)
    ) {
      abweichungen.push({
        typ: 'einheit',
        npk: ref.npk,
        titel,
        erwartet: mengeLabel(ref.menge, ref.einheit),
        gefunden: mengeLabel(offer.menge, offer.einheit),
      });
    } else if (
      ref.menge !== null &&
      offer.menge !== null &&
      Math.abs(ref.menge - offer.menge) > 0.001
    ) {
      abweichungen.push({
        typ: 'menge',
        npk: ref.npk,
        titel,
        erwartet: mengeLabel(ref.menge, ref.einheit),
        gefunden: mengeLabel(offer.menge, offer.einheit),
      });
    }

    // Produktwechsel: nur wenn beide Seiten ein Produkt nennen und keine
    // Seite die andere enthält (Schreibvarianten desselben Fabrikats)
    if (ref.produkt && offer.produkt) {
      if (!gleichesProdukt(ref.produkt, offer.produkt)) {
        abweichungen.push({
          typ: 'produkt',
          npk: ref.npk,
          titel,
          erwartet: ref.produkt,
          gefunden: offer.produkt,
        });
      }
    }
  }

  for (const [npk, offer] of offerByNpk) {
    if (!refNpk.has(npk)) {
      abweichungen.push({
        typ: 'zusaetzlich',
        npk,
        titel: offer.bezeichnung || npk,
        gefunden: mengeLabel(offer.menge, offer.einheit),
      });
    }
  }

  return npkMatcherFallback(abweichungen, referenz, offerByNpk);
}

/**
 * NPK-Matcher-Fallback: Grundnummer↔Variante-Paare zusammenführen.
 *
 * LV-Drucke führen dieselbe Position teils unter der Grundnummer (endet
 * auf 0) und teils unter der Merkmal-Variante (letzte Ziffer 1–9). Ein
 * «fehlend»/«zusätzlich»-Paar gilt als dieselbe Position, wenn Kapitel und
 * Gruppe identisch sind, die Positionsnummer sich nur in der letzten
 * Ziffer unterscheidet und Menge + Einheit exakt übereinstimmen – und die
 * Zuordnung eindeutig (1:1) ist.
 */
function npkMatcherFallback(
  abweichungen: OvMatchAbweichung[],
  referenz: OvMatchReferenzPosition[],
  offerByNpk: Map<string, OvMatchOffertePosition>,
): OvMatchAbweichung[] {
  const refByNpk = new Map(referenz.map((r) => [r.npk, r]));
  const paarKey = (
    npk: string,
    menge: number | null,
    einheit: string | null,
  ): string | null => {
    const teile = npk.split('.');
    if (teile.length !== 3 || !/^\d{3}$/.test(teile[2])) return null;
    if (menge === null || einheit === null) return null;
    return [
      teile[0],
      teile[1],
      teile[2].slice(0, 2), // letzte Ziffer egal (Grundnummer/Variante)
      String(menge),
      normalizeEinheit(einheit),
    ].join('|');
  };

  const fehlend = new Map<string, OvMatchAbweichung[]>();
  const zusaetzlich = new Map<string, OvMatchAbweichung[]>();
  for (const a of abweichungen) {
    const quelle =
      a.typ === 'fehlend'
        ? refByNpk.get(a.npk)
        : a.typ === 'zusaetzlich'
          ? offerByNpk.get(a.npk)
          : null;
    if (!quelle) continue;
    const key = paarKey(a.npk, quelle.menge, quelle.einheit);
    if (key === null) continue;
    const map = a.typ === 'fehlend' ? fehlend : zusaetzlich;
    map.set(key, [...(map.get(key) ?? []), a]);
  }

  const gematcht = new Set<OvMatchAbweichung>();
  for (const [key, fehlendListe] of fehlend) {
    const zusatzListe = zusaetzlich.get(key) ?? [];
    if (fehlendListe.length === 1 && zusatzListe.length === 1) {
      gematcht.add(fehlendListe[0]);
      gematcht.add(zusatzListe[0]);
    }
  }
  return abweichungen.filter((a) => !gematcht.has(a));
}

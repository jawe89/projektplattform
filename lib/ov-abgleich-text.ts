/**
 * Anzeige-Text für den Kontrollsummen-Abgleich (O-M3) – gemeinsam für UI
 * (features/offertenvergleich/ov-client.tsx) und PDF-Bericht
 * (features/offertenvergleich/report/build-report.ts), damit die
 * Erklärung von erklärbaren Positionen (Regieansatz u.ä.) überall gleich
 * lautet. Deutsche Texte über lib/texts.ts.
 */
import { formatRappen } from '@/lib/format';
import type { OvAbgleich } from '@/lib/ov-abgleich';
import { texts } from '@/lib/texts';

export interface OvAbgleichAnzeige {
  text: string;
  tone: 'ok' | 'warn';
}

/** Baut die Abgleich-Zeile; null, wenn keine Kontrollsumme erfasst ist. */
export function beschreibeAbgleich(a: OvAbgleich): OvAbgleichAnzeige | null {
  const t = texts.ov.auswertung;
  switch (a.status) {
    case 'ohne':
      return null;
    // Kein «✓»/«–»: die Zeichen fehlen im eingebetteten Antonio/Montserrat
    // des PDF-Berichts; der grüne Ton signalisiert «in Ordnung».
    case 'deckungsgleich':
      return { text: texts.ov.report.abgleichOk, tone: 'ok' };
    case 'erklaert': {
      const positionen = a.erklaert
        .map((e) => `${t.abgleichPosition} ${e.npk}`)
        .join(', ');
      return {
        text: `${t.abgleichErklaertPrefix} ${formatRappen(a.erklaertRp)} ${t.abgleichEntspricht} ${positionen} - ${t.abgleichAusserhalb}`,
        tone: 'ok',
      };
    }
    case 'abweichung': {
      const rest = `${texts.ov.report.abgleichDiff} ${formatRappen(a.restRp)}`;
      const davon =
        a.erklaertRp !== 0
          ? ` · ${t.abgleichDavonErklaert} ${formatRappen(a.erklaertRp)}`
          : '';
      return { text: `${rest}${davon}`, tone: 'warn' };
    }
  }
}

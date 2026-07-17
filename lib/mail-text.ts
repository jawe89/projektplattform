/**
 * Bereinigung von Texten für Supabase-Mail-Metadaten.
 *
 * Hintergrund: Supabase HTML-maskiert Template-Variablen ({{ .Data.… }})
 * auch im TEXT-Kontext des Mail-Betreffs – aus «McDonald's» wird dort
 * wörtlich «McDonald&#39;s». Deshalb werden Namen vor der Übergabe als
 * Mail-Metadaten auf HTML-neutrale, typografische Zeichen umgestellt.
 * Die Originalnamen in der Datenbank bleiben unverändert.
 *
 * Regeln:
 *  * ASCII-Apostroph  '  → typografisches ’ (U+2019)
 *  * gerade Anführungszeichen "…" → Guillemets «…» (paarweise)
 *  * &  → « und » (nur in der Mail-Variante; im Betreff nicht maskierbar)
 *  * <, > → entfernt (würden als &lt;/&gt; erscheinen)
 */
export function sanitizeMailText(value: string): string {
  let open = true;
  return value
    .replace(/'/g, '’')
    .replace(/\s*&\s*/g, ' und ')
    .replace(/[<>]/g, '')
    .replace(/"/g, () => {
      const guillemet = open ? '«' : '»';
      open = !open;
      return guillemet;
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
}

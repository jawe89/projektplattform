/**
 * PDF-Report des Moduls Offertenvergleich (O-M1) – Layout nach den
 * manuellen Referenzberichten BKP 211/211.4 (WeasyPrint-Vorlage).
 *
 * Läuft serverseitig über @react-pdf/renderer; Projekt-CI via ReportBrand,
 * deutsche Labels aus lib/texts.ts, Beträge über lib/format.ts. Die
 * Layout-Probe (scripts/ov-report-probe.tsx) rendert Titelblock,
 * Bieter-Karten, farbcodierte Differenzen-Tabelle und Erkenntnis-Boxen;
 * Fazit/Vollständigkeit folgen mit der Pipeline.
 */
import React from 'react';
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import { formatRappen } from '@/lib/format';
import { texts } from '@/lib/texts';
import { COMPARE_COLORS, type ReportBrand } from './theme';

// ---------------------------------------------------------------------------
// Datenformen (werden später von der Analyse-Pipeline geliefert)

export interface ReportMeta {
  bkp: string;
  gattung: string;
  projectNo: string;
  bauvorhaben: string[];
  lvNummer: string;
  stand: string; // TT.MM.JJJJ
}

export interface ReportBieter {
  name: string;
  ort: string;
  telefon: string;
  /** Positionssumme in Rappen (mit Summen-Abgleich, falls Kontrollsumme) */
  totalRp?: number;
  kontrollsummeRp?: number | null;
  diffRp?: number | null;
}

export interface ReportFazit {
  ranking: { name: string; ort: string; charakter: string; tendenz: string }[];
  bereinigung: { name: string; text: string }[];
  empfehlung: string;
}

export interface ReportDiffRow {
  npk: string;
  bezeichnung: string;
  mengeLabel: string; // '2'200 m³', '1 gl · Anzahl 1'
  /** Beträge in Rappen je Bieter (Reihenfolge = bieter[]); null = «inkl.» */
  werteRp: (number | null)[];
  /** true je Bieter = Betrag handschriftlich gelesen (Markierung «✎») */
  handschriftlich?: boolean[];
}

export interface ReportDiffBlock {
  titel: string; // Kostenblock, z.B. 'Entsorgung · Transporte'
  rows: ReportDiffRow[];
}

export interface ReportErkenntnis {
  titel: string;
  tag: string; // 'KRITISCH', 'HOT SPOT', …
  tagColor: string;
  text: string;
  bullets: string[];
}

export interface ReportAbweichung {
  typ: string; // Label 'Fehlt', 'Menge', …
  typColor: string;
  npk: string;
  titel: string;
  delta: string; // 'LV: 120 m3 → Offerte: 260 m2'
  bewertung: string; // 'KRITISCH' | 'TOLERIERBAR' | '' (offen)
  bewertungColor: string;
  notiz: string | null;
}

/** Abweichungen einer Offerte (O-M2, «falls Abweichungen» im Bericht) */
export interface ReportVollstaendigkeitGruppe {
  bieterName: string;
  abweichungen: ReportAbweichung[];
}

export interface ReportProps {
  brand: ReportBrand;
  meta: ReportMeta;
  bieter: ReportBieter[];
  /** «Preise aus: …» – Belastbarkeit der Matrix (Vergleich vs. Offerten) */
  quelleLabel: string;
  /** Warnhinweis, falls handschriftlich gelesene Werte enthalten sind */
  handschriftHinweis?: string | null;
  vollstaendigkeit?: ReportVollstaendigkeitGruppe[];
  diffBlocks: ReportDiffBlock[];
  erkenntnisse: ReportErkenntnis[];
  fazit?: ReportFazit | null;
}

// ---------------------------------------------------------------------------

const NUM_COL_WIDTH = 74;

function buildStyles(brand: ReportBrand) {
  const { colors } = brand;
  return StyleSheet.create({
    page: {
      fontFamily: 'Montserrat',
      fontSize: 8.5,
      color: colors.ink,
      paddingTop: 42,
      paddingHorizontal: 44,
      paddingBottom: 54,
    },
    display: { fontFamily: 'Antonio', textTransform: 'uppercase' },

    // Kopf
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      borderBottomWidth: 1,
      borderBottomColor: colors.ink,
      paddingBottom: 10,
      marginBottom: 14,
    },
    title: {
      fontFamily: 'Antonio',
      textTransform: 'uppercase',
      fontSize: 22,
      fontWeight: 600,
      letterSpacing: 0.6,
    },
    subtitle: {
      fontFamily: 'Antonio',
      textTransform: 'uppercase',
      fontSize: 9,
      letterSpacing: 1.6,
      color: colors.primaryDark,
      marginTop: 4,
    },
    brandBlock: { alignItems: 'flex-end' },
    brandName: {
      fontFamily: 'Antonio',
      textTransform: 'uppercase',
      fontSize: 12,
      fontWeight: 600,
      letterSpacing: 1,
      textAlign: 'right',
    },
    brandSuffix: {
      fontFamily: 'Antonio',
      textTransform: 'uppercase',
      fontSize: 7,
      letterSpacing: 2,
      color: colors.primary,
      marginTop: 2,
      textAlign: 'right',
    },

    // Info-Block
    infoRow: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.bg,
      marginBottom: 14,
    },
    infoCell: { flex: 1, padding: 8, borderLeftWidth: 1, borderLeftColor: colors.line },
    infoCellFirst: { flex: 1, padding: 8 },
    infoLabel: {
      fontFamily: 'Antonio',
      textTransform: 'uppercase',
      fontSize: 6.5,
      letterSpacing: 1.4,
      color: colors.accent,
      marginBottom: 3,
    },
    infoValue: { fontSize: 8, lineHeight: 1.45 },
    infoValueBold: { fontSize: 8, fontWeight: 600, lineHeight: 1.45 },

    // Sektionstitel
    sectionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      paddingBottom: 4,
      marginBottom: 8,
      marginTop: 6,
    },
    sectionTitle: {
      fontFamily: 'Antonio',
      textTransform: 'uppercase',
      fontSize: 12,
      fontWeight: 500,
      letterSpacing: 1,
    },
    sectionHint: {
      fontFamily: 'Antonio',
      textTransform: 'uppercase',
      fontSize: 7,
      letterSpacing: 1.6,
      color: colors.primary,
    },

    // Bieter-Karten
    bieterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    bieterCard: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.line,
      borderTopWidth: 2,
      borderTopColor: colors.accent,
      padding: 8,
    },
    bieterName: { fontSize: 9.5, fontWeight: 700, marginBottom: 3 },
    bieterMeta: { fontSize: 7.5, color: colors.primaryDark, lineHeight: 1.5 },
    bieterTotal: {
      fontSize: 8.5,
      fontWeight: 700,
      marginTop: 5,
      paddingTop: 4,
      borderTopWidth: 1,
      borderTopColor: colors.line,
    },
    bieterAbgleich: { fontSize: 6.6, color: colors.primary, marginTop: 1.5 },

    readingHint: {
      fontSize: 7,
      color: colors.primaryDark,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 6,
      lineHeight: 1.5,
      marginBottom: 14,
    },
    quelleZeile: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
      gap: 8,
    },
    quelleLabel: {
      fontFamily: 'Antonio',
      textTransform: 'uppercase',
      fontSize: 7,
      letterSpacing: 1,
      color: colors.primaryDark,
    },
    quelleWarn: {
      fontSize: 7,
      fontWeight: 700,
      color: COMPARE_COLORS.warn,
    },

    // Differenzen-Tabelle
    table: { borderWidth: 1, borderColor: colors.line, marginBottom: 14 },
    theadRow: {
      flexDirection: 'row',
      backgroundColor: colors.ink,
      alignItems: 'center',
    },
    thText: {
      fontFamily: 'Antonio',
      textTransform: 'uppercase',
      fontSize: 7,
      letterSpacing: 1,
      color: '#ffffff',
      paddingVertical: 5,
      paddingHorizontal: 6,
    },
    blockRow: {
      backgroundColor: colors.bg,
      borderTopWidth: 1,
      borderTopColor: colors.line,
    },
    blockText: {
      fontFamily: 'Antonio',
      textTransform: 'uppercase',
      fontSize: 7.5,
      fontWeight: 500,
      letterSpacing: 1.2,
      color: colors.primaryDark,
      paddingVertical: 4,
      paddingHorizontal: 6,
    },
    tr: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderTopColor: colors.line,
      alignItems: 'stretch',
    },
    tdNpk: {
      width: 62,
      paddingVertical: 4,
      paddingHorizontal: 6,
      fontSize: 7.5,
      fontWeight: 600,
      color: colors.primaryDark,
    },
    tdBez: { flex: 1, paddingVertical: 4, paddingHorizontal: 6 },
    bezText: { fontSize: 8, fontWeight: 500 },
    mengeText: { fontSize: 7, color: colors.primary, marginTop: 1.5 },
    tdNum: {
      width: NUM_COL_WIDTH,
      paddingVertical: 4,
      paddingHorizontal: 6,
      justifyContent: 'center',
      borderLeftWidth: 1,
      borderLeftColor: colors.line,
    },
    numText: { fontSize: 8, textAlign: 'right' },

    // Vollständigkeitsprüfung
    vollGruppeRow: {
      backgroundColor: colors.bg,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingRight: 6,
    },
    vollTypTag: {
      fontFamily: 'Antonio',
      textTransform: 'uppercase',
      fontSize: 6,
      fontWeight: 600,
      letterSpacing: 0.8,
      color: '#ffffff',
      paddingVertical: 1.5,
      paddingHorizontal: 4,
      alignSelf: 'flex-start',
    },
    vollTypCell: { width: 54, paddingVertical: 4, paddingHorizontal: 6 },
    vollDeltaText: { fontSize: 7, color: colors.primaryDark, marginTop: 1.5 },
    // Keine Italic-Variante eingebettet – Notiz nur über Farbe/Guillemets
    vollNotizText: {
      fontSize: 7,
      color: colors.primary,
      marginTop: 1.5,
    },
    vollBewertung: {
      width: 66,
      fontFamily: 'Antonio',
      textTransform: 'uppercase',
      fontSize: 6.5,
      fontWeight: 600,
      letterSpacing: 0.8,
      textAlign: 'right',
      paddingVertical: 5,
      paddingHorizontal: 6,
    },

    // Erkenntnis-Boxen
    erkenntnisBox: {
      borderWidth: 1,
      borderColor: colors.line,
      borderLeftWidth: 3,
      padding: 9,
      marginBottom: 8,
    },
    erkenntnisHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 5,
      gap: 8,
    },
    erkenntnisTitle: {
      fontFamily: 'Antonio',
      textTransform: 'uppercase',
      fontSize: 9,
      fontWeight: 500,
      letterSpacing: 0.6,
      flexShrink: 1,
    },
    tag: {
      fontFamily: 'Antonio',
      textTransform: 'uppercase',
      fontSize: 6.5,
      fontWeight: 600,
      letterSpacing: 1,
      color: '#ffffff',
      paddingVertical: 2,
      paddingHorizontal: 6,
    },
    erkenntnisText: { fontSize: 7.8, lineHeight: 1.55, color: colors.ink },
    bulletRow: { flexDirection: 'row', marginTop: 3, paddingRight: 8 },
    bulletDot: { width: 10, fontSize: 7.8, color: colors.primary },
    bulletText: { flex: 1, fontSize: 7.8, lineHeight: 1.5 },

    // Fazit
    rankTable: { borderWidth: 1, borderColor: colors.line, marginBottom: 10 },
    rankRow: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderTopColor: colors.line,
      alignItems: 'center',
    },
    rankHead: { backgroundColor: colors.ink, borderTopWidth: 0 },
    rankNum: {
      width: 26,
      fontFamily: 'Antonio',
      fontSize: 11,
      fontWeight: 600,
      color: colors.accent,
      textAlign: 'center',
      paddingVertical: 6,
    },
    rankNameCell: { width: 108, paddingVertical: 6, paddingRight: 6 },
    rankName: { fontSize: 8.5, fontWeight: 700 },
    rankOrt: { fontSize: 7, color: colors.primary, marginTop: 1 },
    rankCharakter: {
      flex: 1,
      fontSize: 7.6,
      lineHeight: 1.5,
      paddingVertical: 6,
      paddingRight: 8,
    },
    rankTendenz: {
      width: 92,
      fontFamily: 'Antonio',
      textTransform: 'uppercase',
      fontSize: 7,
      fontWeight: 600,
      letterSpacing: 0.8,
      color: colors.primaryDark,
      textAlign: 'right',
      paddingVertical: 6,
      paddingRight: 8,
    },
    empfehlungBox: {
      borderWidth: 1,
      borderColor: colors.line,
      borderLeftWidth: 3,
      borderLeftColor: colors.accent,
      backgroundColor: colors.bg,
      padding: 10,
    },
    empfehlungTitle: {
      fontFamily: 'Antonio',
      textTransform: 'uppercase',
      fontSize: 9,
      fontWeight: 500,
      letterSpacing: 1,
      marginBottom: 6,
    },
    empfehlungAbsatz: { fontSize: 7.8, lineHeight: 1.55, marginBottom: 5 },
    empfehlungName: { fontWeight: 700 },

    // Footer
    footer: {
      position: 'absolute',
      left: 44,
      right: 44,
      bottom: 24,
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: colors.line,
      paddingTop: 6,
    },
    footerText: { fontSize: 6.5, color: colors.primary },
  });
}

/** Farbregel je Zeile: Minimum grün, Maximum orange, negativ rot (fix) */
function cellTone(
  werteRp: (number | null)[],
  index: number,
): { color?: string; backgroundColor?: string; fontWeight?: 600 | 700 } {
  const value = werteRp[index];
  if (value === null) return {};
  const numbers = werteRp.filter((v): v is number => v !== null);
  if (numbers.length < 2) return {};
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  if (min === max) return {};
  if (value < 0) {
    return { color: COMPARE_COLORS.kritisch, fontWeight: 700 };
  }
  if (value === min) {
    return {
      color: COMPARE_COLORS.guenstigster,
      backgroundColor: COMPARE_COLORS.guenstigsterTint,
      fontWeight: 700,
    };
  }
  if (value === max) {
    return {
      color: COMPARE_COLORS.teuerster,
      backgroundColor: COMPARE_COLORS.teuersterTint,
      fontWeight: 700,
    };
  }
  return {};
}

export function ReportDocument({
  brand,
  meta,
  bieter,
  quelleLabel,
  handschriftHinweis,
  vollstaendigkeit,
  diffBlocks,
  erkenntnisse,
  fazit,
}: ReportProps) {
  const styles = buildStyles(brand);
  const t = texts.ov.report;

  return (
    <Document
      title={`${t.title} BKP ${meta.bkp} – ${meta.projectNo}`}
      author={brand.managementName}
    >
      <Page size="A4" style={styles.page}>
        {/* Kopf */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>{t.title}</Text>
            <Text style={styles.subtitle}>
              BKP {meta.bkp} · {meta.gattung} · {meta.projectNo}
            </Text>
          </View>
          <View style={styles.brandBlock}>
            <Text style={styles.brandName}>{brand.managementName}</Text>
            {brand.managementSuffix && (
              <Text style={styles.brandSuffix}>{brand.managementSuffix}</Text>
            )}
          </View>
        </View>

        {/* Info-Block */}
        <View style={styles.infoRow}>
          <View style={styles.infoCellFirst}>
            <Text style={styles.infoLabel}>{t.infoBauvorhaben}</Text>
            {meta.bauvorhaben.map((line, i) => (
              <Text key={i} style={i === 0 ? styles.infoValueBold : styles.infoValue}>
                {line}
              </Text>
            ))}
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>{t.infoGattung}</Text>
            <Text style={styles.infoValueBold}>BKP {meta.bkp}</Text>
            <Text style={styles.infoValue}>{meta.gattung}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>{t.infoLv}</Text>
            <Text style={styles.infoValueBold}>LV {meta.lvNummer}</Text>
            <Text style={styles.infoValue}>
              {t.standPrefix} {meta.stand}
            </Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>{t.infoManagement}</Text>
            <Text style={styles.infoValueBold}>{brand.managementName}</Text>
            {brand.managementAddress && (
              <Text style={styles.infoValue}>{brand.managementAddress}</Text>
            )}
          </View>
        </View>

        {/* Bieter */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>{t.bieterTitle}</Text>
          <Text style={styles.sectionHint}>
            {bieter.length} {t.bieterSuffix}
          </Text>
        </View>
        <View style={styles.bieterRow}>
          {bieter.map((b) => (
            <View key={b.name} style={styles.bieterCard}>
              <Text style={styles.bieterName}>{b.name}</Text>
              <Text style={styles.bieterMeta}>{b.ort}</Text>
              <Text style={styles.bieterMeta}>{b.telefon}</Text>
              {b.totalRp !== undefined && (
                <>
                  <Text style={styles.bieterTotal}>
                    {t.totalLabel} CHF {formatRappen(b.totalRp)}
                  </Text>
                  {b.kontrollsummeRp != null && (
                    <Text style={styles.bieterAbgleich}>
                      {t.kontrollsummeLabel} {formatRappen(b.kontrollsummeRp)}
                      {b.diffRp === 0
                        ? ` · ${t.abgleichOk}`
                        : ` · ${t.abgleichDiff} ${formatRappen(b.diffRp ?? 0)}`}
                    </Text>
                  )}
                </>
              )}
            </View>
          ))}
        </View>

        {/* Vollständigkeitsprüfung (O-M2, nur falls Abweichungen) */}
        {vollstaendigkeit && vollstaendigkeit.length > 0 && (
          <View>
            <View style={styles.sectionRow} minPresenceAhead={80}>
              <Text style={styles.sectionTitle}>{t.vollTitle}</Text>
              <Text style={styles.sectionHint}>{t.vollSubtitle}</Text>
            </View>
            <View style={styles.table}>
              {vollstaendigkeit.map((gruppe) => (
                <View key={gruppe.bieterName}>
                  <View style={styles.vollGruppeRow}>
                    <Text style={styles.blockText}>{gruppe.bieterName}</Text>
                    <Text style={styles.sectionHint}>
                      {gruppe.abweichungen.length}{' '}
                      {gruppe.abweichungen.length === 1
                        ? t.vollSuffixOne
                        : t.vollSuffix}
                    </Text>
                  </View>
                  {gruppe.abweichungen.map((a) => (
                    <View
                      key={`${a.typ}:${a.npk}`}
                      style={styles.tr}
                      wrap={false}
                    >
                      <View style={styles.vollTypCell}>
                        <Text
                          style={[
                            styles.vollTypTag,
                            { backgroundColor: a.typColor },
                          ]}
                        >
                          {a.typ}
                        </Text>
                      </View>
                      <Text style={styles.tdNpk}>{a.npk}</Text>
                      <View style={styles.tdBez}>
                        <Text style={styles.bezText}>{a.titel}</Text>
                        {a.delta ? (
                          <Text style={styles.vollDeltaText}>{a.delta}</Text>
                        ) : null}
                        {a.notiz ? (
                          <Text style={styles.vollNotizText}>
                            «{a.notiz}»
                          </Text>
                        ) : null}
                      </View>
                      <Text
                        style={[styles.vollBewertung, { color: a.bewertungColor }]}
                      >
                        {a.bewertung}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.quelleZeile}>
          <Text style={styles.quelleLabel}>{quelleLabel}</Text>
          {handschriftHinweis ? (
            <Text style={styles.quelleWarn}>{handschriftHinweis}</Text>
          ) : null}
        </View>

        <Text style={styles.readingHint}>{t.readingHint}</Text>

        {/* Grosse Unterschiede */}
        <View style={styles.sectionRow} minPresenceAhead={80}>
          <Text style={styles.sectionTitle}>{t.diffTitle}</Text>
          <Text style={styles.sectionHint}>{t.diffSubtitle}</Text>
        </View>
        <View style={styles.table}>
          <View style={styles.theadRow}>
            <Text style={[styles.thText, { width: 62 }]}>{t.colNpk}</Text>
            <Text style={[styles.thText, { flex: 1 }]}>{t.colBezeichnung}</Text>
            {bieter.map((b) => (
              <Text
                key={b.name}
                style={[
                  styles.thText,
                  { width: NUM_COL_WIDTH, textAlign: 'right' },
                ]}
              >
                {b.name}
              </Text>
            ))}
          </View>
          {diffBlocks.map((block) => (
            <View key={block.titel}>
              <View style={styles.blockRow}>
                <Text style={styles.blockText}>{block.titel}</Text>
              </View>
              {block.rows.map((row) => (
                <View key={row.npk} style={styles.tr} wrap={false}>
                  <Text style={styles.tdNpk}>{row.npk}</Text>
                  <View style={styles.tdBez}>
                    <Text style={styles.bezText}>{row.bezeichnung}</Text>
                    <Text style={styles.mengeText}>{row.mengeLabel}</Text>
                  </View>
                  {row.werteRp.map((value, i) => {
                    const tone = cellTone(row.werteRp, i);
                    return (
                      <View
                        key={i}
                        style={[
                          styles.tdNum,
                          tone.backgroundColor
                            ? { backgroundColor: tone.backgroundColor }
                            : {},
                        ]}
                      >
                        <Text
                          style={[
                            styles.numText,
                            tone.color ? { color: tone.color } : {},
                            tone.fontWeight ? { fontWeight: tone.fontWeight } : {},
                          ]}
                        >
                          {value === null ? 'inkl.' : formatRappen(value)}
                          {row.handschriftlich?.[i] ? ' *' : ''}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          ))}
        </View>

        {/* Erkenntnisse – Sektionskopf mit der ersten Box gruppiert, damit
            der Titel nie allein am Seitenende steht (Orphan) */}
        {erkenntnisse.map((e, index) => {
          const box = (
            <View
              style={[styles.erkenntnisBox, { borderLeftColor: e.tagColor }]}
              wrap={false}
            >
              <View style={styles.erkenntnisHead}>
                <Text style={styles.erkenntnisTitle}>
                  {index + 1} · {e.titel}
                </Text>
                <Text style={[styles.tag, { backgroundColor: e.tagColor }]}>
                  {e.tag}
                </Text>
              </View>
              <Text style={styles.erkenntnisText}>{e.text}</Text>
              {e.bullets.map((bullet, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>{bullet}</Text>
                </View>
              ))}
            </View>
          );
          if (index > 0) return <View key={e.titel}>{box}</View>;
          return (
            <View key={e.titel} wrap={false}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>{t.erkenntnisseTitle}</Text>
                <Text style={styles.sectionHint}>
                  {erkenntnisse.length} {t.erkenntnisseSuffix}
                </Text>
              </View>
              {box}
            </View>
          );
        })}

        {/* Fazit (Ranking + Bereinigungsgespräche + Empfehlung) */}
        {fazit && (
          <>
            <View wrap={false}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>{t.fazitTitle}</Text>
                <Text style={styles.sectionHint}>{t.fazitSubtitle}</Text>
              </View>
              <View style={styles.rankTable}>
                <View style={[styles.rankRow, styles.rankHead]}>
                  <Text style={[styles.thText, { width: 26, textAlign: 'center' }]}>
                    {t.colRang}
                  </Text>
                  <Text style={[styles.thText, { width: 108 }]}>
                    {t.colUnternehmen}
                  </Text>
                  <Text style={[styles.thText, { flex: 1 }]}>
                    {t.colCharakter}
                  </Text>
                  <Text style={[styles.thText, { width: 92, textAlign: 'right' }]}>
                    {t.colTendenz}
                  </Text>
                </View>
                {fazit.ranking.map((r, index) => (
                  <View key={r.name} style={styles.rankRow} wrap={false}>
                    <Text style={styles.rankNum}>{index + 1}</Text>
                    <View style={styles.rankNameCell}>
                      <Text style={styles.rankName}>{r.name}</Text>
                      {r.ort ? <Text style={styles.rankOrt}>{r.ort}</Text> : null}
                    </View>
                    <Text style={styles.rankCharakter}>{r.charakter}</Text>
                    <Text style={styles.rankTendenz}>{r.tendenz}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={styles.empfehlungBox} wrap={false}>
              <Text style={styles.empfehlungTitle}>{t.empfehlungTitle}</Text>
              {fazit.bereinigung.map((b) => (
                <Text key={b.name} style={styles.empfehlungAbsatz}>
                  <Text style={styles.empfehlungName}>{b.name}</Text> – {b.text}
                </Text>
              ))}
              <Text style={styles.empfehlungAbsatz}>{fazit.empfehlung}</Text>
            </View>
          </>
        )}

        {/* Footer (fix auf jeder Seite) */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            © {brand.managementName}
            {brand.managementAddress ? ` · ${brand.managementAddress}` : ''}
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `${meta.projectNo} · BKP ${meta.bkp} · ${t.pagePrefix} ${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

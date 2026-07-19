/**
 * PDF-Report-Erzeugung (O-M1): lädt Auswertung, «wichtige» Positionen,
 * Bieter und Projekt-CI, rendert das ReportDocument serverseitig und
 * archiviert das PDF im Storage unter der Vergabe
 * ({project_id}/offertenvergleich/{vergabe_id}/bericht-….pdf).
 *
 * Der Summen-Abgleich wird hier FRISCH gegen die aktuellen Kontrollsummen
 * gerechnet (die können nach der Analyse erfasst worden sein).
 */
import 'server-only';
import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ReportDocument,
  type ReportDiffBlock,
  type ReportErkenntnis,
  type ReportProps,
} from '@/features/offertenvergleich/report/report-document';
import {
  COMPARE_COLORS,
  registerReportFonts,
  type ReportBrand,
} from '@/features/offertenvergleich/report/theme';
import { DEFAULT_COLORS } from '@/features/theming/theme';
import { formatDate, formatNumber } from '@/lib/format';
import { berechneAbgleich } from '@/lib/ov-abgleich';
import { beschreibeAbgleich } from '@/lib/ov-abgleich-text';
import { texts } from '@/lib/texts';
import type {
  BrandingColors,
  OvAbweichungRow,
  OvAbweichungTyp,
  OvAngebotRow,
  OvAuswertungRow,
  OvBieterRow,
  OvDokument,
  OvErkenntnisTag,
  OvPositionRow,
  OvVergabe,
  ProjectBranding,
} from '@/lib/types';

const TAG_COLORS: Record<OvErkenntnisTag, string> = {
  kritisch: COMPARE_COLORS.kritisch,
  hot_spot: COMPARE_COLORS.warn,
  plausibilitaet: COMPARE_COLORS.warn,
  staerke: COMPARE_COLORS.guenstigster,
  hinweis: '#5a5a5a',
};

const ABWEICHUNG_TYP_COLORS: Record<OvAbweichungTyp, string> = {
  fehlend: COMPARE_COLORS.kritisch,
  zusaetzlich: COMPARE_COLORS.warn,
  menge: COMPARE_COLORS.warn,
  einheit: COMPARE_COLORS.warn,
  produkt: '#5a5a5a',
};

const BEWERTUNG_COLORS: Record<string, string> = {
  kritisch: COMPARE_COLORS.kritisch,
  tolerierbar: COMPARE_COLORS.guenstigster,
  offen: '#7c7c7c',
};

function mengeLabel(menge: number | null, einheit: string | null): string {
  if (menge === null) return einheit ?? '';
  const decimals = Number.isInteger(menge) ? 0 : 3;
  return `${formatNumber(menge, decimals)} ${einheit ?? ''}`.trim();
}

export async function buildReportForVergabe(
  supabase: SupabaseClient,
  { projectId, vergabeId }: { projectId: string; vergabeId: string },
): Promise<{ auswertungId: string; filePath: string }> {
  const [{ data: vergabe }, { data: auswertung }] = await Promise.all([
    supabase
      .from('ov_vergaben')
      .select('*')
      .eq('id', vergabeId)
      .maybeSingle<OvVergabe>(),
    supabase
      .from('ov_auswertungen')
      .select('*')
      .eq('vergabe_id', vergabeId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<OvAuswertungRow>(),
  ]);
  if (!vergabe) throw new Error('Vergabe nicht gefunden');
  if (!auswertung) throw new Error('Noch keine Auswertung vorhanden');

  const [
    { data: bieterRows },
    { data: positionRows },
    { data: abweichungRows },
    { data: dokumentRows },
    brandData,
  ] = await Promise.all([
    supabase
      .from('ov_bieter')
      .select('*')
      .eq('vergabe_id', vergabeId)
      .order('sort')
      .returns<OvBieterRow[]>(),
    supabase
      .from('ov_positionen')
      .select('*')
      .eq('vergabe_id', vergabeId)
      .eq('wichtig', true)
      .order('sort')
      .returns<OvPositionRow[]>(),
    supabase
      .from('ov_abweichungen')
      .select('*')
      .eq('vergabe_id', vergabeId)
      .neq('bewertung', 'ignoriert')
      .order('npk')
      .returns<OvAbweichungRow[]>(),
    supabase
      .from('ov_dokumente')
      .select('*')
      .eq('vergabe_id', vergabeId)
      .eq('art', 'offerte')
      .order('created_at')
      .returns<OvDokument[]>(),
    loadBrand(supabase, projectId),
  ]);
  const bieter = bieterRows ?? [];
  const positionen = positionRows ?? [];
  if (bieter.length === 0) throw new Error('Keine Bieter vorhanden');

  const positionIds = positionen.map((p) => p.id);
  const { data: angebotRows } = positionIds.length
    ? await supabase
        .from('ov_angebote')
        .select('*')
        .in('position_id', positionIds)
        .returns<OvAngebotRow[]>()
    : { data: [] as OvAngebotRow[] };
  const angebotKey = new Map(
    (angebotRows ?? []).map((a) => [`${a.position_id}:${a.bieter_id}`, a]),
  );

  const inhalt = auswertung.inhalt;

  // Diff-Tabelle: wichtige Positionen, gruppiert nach Kostenblock
  const blocks = new Map<string, ReportDiffBlock>();
  for (const position of positionen) {
    const name = position.kostenblock ?? '–';
    const block = blocks.get(name) ?? { titel: name, rows: [] };
    block.rows.push({
      npk: position.npk,
      bezeichnung: position.bezeichnung,
      mengeLabel: mengeLabel(position.menge, position.einheit),
      werteRp: bieter.map((b) => {
        const angebot = angebotKey.get(`${position.id}:${b.id}`);
        return angebot?.is_inkl ? null : (angebot?.betrag_rp ?? null);
      }),
      handschriftlich: bieter.map((b) => {
        const angebot = angebotKey.get(`${position.id}:${b.id}`);
        return (angebot?.flags ?? []).includes('handschriftlich');
      }),
    });
    blocks.set(name, block);
  }

  // Vollständigkeitsprüfung (O-M2): nicht-ignorierte Abweichungen je Offerte,
  // sortiert Typ-schwer (fehlend zuerst), Sektion entfällt ohne Abweichungen
  const tv = texts.ov.vollstaendigkeit;
  const typOrder: Record<string, number> = {
    fehlend: 0,
    einheit: 1,
    menge: 2,
    produkt: 3,
    zusaetzlich: 4,
  };
  const bieterNameById = new Map(bieter.map((b) => [b.id, b.name]));
  const vollstaendigkeit = (dokumentRows ?? [])
    .map((dokument) => {
      const list = (abweichungRows ?? [])
        .filter((a) => a.dokument_id === dokument.id)
        .sort(
          (a, b) =>
            (typOrder[a.typ] ?? 9) - (typOrder[b.typ] ?? 9) ||
            a.npk.localeCompare(b.npk),
        );
      return {
        bieterName: dokument.bieter_id
          ? (bieterNameById.get(dokument.bieter_id) ?? dokument.original_name)
          : dokument.original_name,
        abweichungen: list.map((a) => ({
          typ: tv.typLabels[a.typ] ?? a.typ,
          typColor: ABWEICHUNG_TYP_COLORS[a.typ] ?? '#5a5a5a',
          npk: a.npk,
          titel: a.titel,
          // «→» fehlt im eingebetteten Font – Präfixe LV:/Offerte: reichen
          delta: [
            a.details.erwartet !== undefined
              ? `${tv.erwartetPrefix} ${a.details.erwartet}`
              : null,
            a.details.gefunden !== undefined
              ? `${tv.gefundenPrefix} ${a.details.gefunden}`
              : null,
          ]
            .filter(Boolean)
            .join(' · '),
          bewertung: tv.bewertungLabels[a.bewertung] ?? a.bewertung,
          bewertungColor: BEWERTUNG_COLORS[a.bewertung] ?? '#7c7c7c',
          notiz: a.notiz,
        })),
      };
    })
    .filter((gruppe) => gruppe.abweichungen.length > 0);

  const erkenntnisse: ReportErkenntnis[] = inhalt.erkenntnisse.map((e) => ({
    titel: e.titel,
    tag: texts.ov.tagLabels[e.tag] ?? e.tag,
    tagColor: TAG_COLORS[e.tag] ?? '#5a5a5a',
    text: e.text,
    bullets: e.bullets,
  }));

  const ortByName = new Map(bieter.map((b) => [b.name, b.ort ?? '']));
  const fazit = inhalt.fazit
    ? {
        ranking: inhalt.fazit.ranking.map((r) => ({
          name: r.name,
          ort: ortByName.get(r.name) ?? '',
          charakter: r.charakter,
          tendenz: r.tendenz,
        })),
        bereinigung: inhalt.fazit.bereinigung,
        empfehlung: inhalt.fazit.empfehlung,
      }
    : null;

  const props: ReportProps = {
    brand: brandData,
    meta: {
      bkp: inhalt.meta.bkp || vergabe.bkp,
      gattung: inhalt.meta.titel || vergabe.titel,
      projectNo: inhalt.meta.projectNo,
      bauvorhaben: inhalt.meta.projektzeile
        ? inhalt.meta.projektzeile.split(', ')
        : [],
      lvNummer: inhalt.meta.lvNummer || (vergabe.lv_nummer ?? ''),
      stand: inhalt.meta.datum ? formatDate(inhalt.meta.datum) : '–',
    },
    bieter: bieter.map((b, i) => {
      const totalRp = inhalt.analyse.bieterTotaleRp[i] ?? 0;
      const kontrollsummeRp = b.kontrollsumme_rp;
      // Abgleich frisch mit den erklärbaren Positionen (Regieansatz u.ä.)
      const anzeige = beschreibeAbgleich(
        berechneAbgleich(
          totalRp,
          kontrollsummeRp,
          inhalt.erklaerbarePositionen ?? [],
        ),
      );
      return {
        name: b.name,
        ort: b.ort ?? '',
        telefon: b.telefon ?? '',
        totalRp,
        kontrollsummeRp,
        abgleichText: anzeige?.text ?? null,
        abgleichTone: anzeige?.tone ?? null,
      };
    }),
    // Belastbarkeit: aus welcher Quelle die Preise stammen, plus Warnung,
    // falls handschriftlich gelesene Werte in der Matrix sind
    quelleLabel:
      (inhalt.preisquelle ?? 'positionenvergleich') === 'offerten'
        ? texts.ov.report.quelleOfferten
        : texts.ov.report.quelleVergleich,
    handschriftHinweis:
      (inhalt.handschriftlichCount ?? 0) > 0
        ? `${texts.ov.report.handschriftHinweis} (${inhalt.handschriftlichCount})`
        : null,
    vollstaendigkeit,
    diffBlocks: [...blocks.values()],
    erkenntnisse,
    fazit,
  };

  registerReportFonts();
  const buffer = await renderToBuffer(
    // ReportDocument rendert ein <Document> – react-pdf erwartet dessen Props
    createElement(ReportDocument, props) as unknown as ReactElement<DocumentProps>,
  );

  const filePath = `${projectId}/offertenvergleich/${vergabeId}/bericht-${Date.now()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from('project-files')
    .upload(filePath, buffer, { contentType: 'application/pdf' });
  if (uploadError) throw new Error(`Upload: ${uploadError.message}`);

  const { error: updateError } = await supabase
    .from('ov_auswertungen')
    .update({ report_file_path: filePath })
    .eq('id', auswertung.id);
  if (updateError) throw updateError;

  return { auswertungId: auswertung.id, filePath };
}

async function loadBrand(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ReportBrand> {
  const { data: branding } = await supabase
    .from('project_branding')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle<ProjectBranding>();
  const colors: BrandingColors = {
    ...DEFAULT_COLORS,
    ...(branding?.colors ?? {}),
  };
  return {
    managementName: branding?.management_name ?? '',
    managementSuffix: branding?.management_suffix ?? null,
    managementAddress: null,
    colors: {
      primary: colors.primary,
      primaryDark: colors.primaryDark,
      accent: colors.accent,
      line: colors.line,
      bg: colors.bg,
      ink: colors.ink,
    },
  };
}

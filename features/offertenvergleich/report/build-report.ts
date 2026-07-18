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
import { texts } from '@/lib/texts';
import type {
  BrandingColors,
  OvAngebotRow,
  OvAuswertungRow,
  OvBieterRow,
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

  const [{ data: bieterRows }, { data: positionRows }, brandData] =
    await Promise.all([
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
    });
    blocks.set(name, block);
  }

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
      return {
        name: b.name,
        ort: b.ort ?? '',
        telefon: b.telefon ?? '',
        totalRp,
        kontrollsummeRp,
        diffRp: kontrollsummeRp === null ? null : totalRp - kontrollsummeRp,
      };
    }),
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

'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ToastContainer, useToasts } from '@/components/ui/toast';
import { LogoutButton } from '@/features/auth/logout-button';
import { formatDate, formatRappen, parseChfToRappen } from '@/lib/format';
import { berechneAbgleich } from '@/lib/ov-abgleich';
import { beschreibeAbgleich } from '@/lib/ov-abgleich-text';
import { createClient } from '@/lib/supabase/client';
import { texts } from '@/lib/texts';
import type {
  OvAbweichungBewertung,
  OvAbweichungRow,
  OvAbweichungTyp,
  OvAngebotRow,
  OvAuswertungRow,
  OvBieterRow,
  OvDokument,
  OvDokumentArt,
  OvErkenntnisTag,
  OvJobRow,
  OvPositionRow,
  OvVergabe,
  OvVergabeStatus,
} from '@/lib/types';

export interface OvDetail {
  vergabe: OvVergabe;
  dokumente: OvDokument[];
  bieter: OvBieterRow[];
  positionen: OvPositionRow[];
  angebote: OvAngebotRow[];
  abweichungen: OvAbweichungRow[];
  auswertung: OvAuswertungRow | null;
  berichte: { id: string; report_file_path: string; created_at: string }[];
}

interface OvClientProps {
  projectId: string;
  projectName: string;
  projectNo: string | null;
  managementName: string | null;
  managementLogoUrl: string | null;
  canEdit: boolean;
  vergaben: OvVergabe[];
  bieterCounts: Record<string, number>;
  detail: OvDetail | null;
}

const PILL_BASE =
  'inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em]';

const STATUS_PILL: Record<OvVergabeStatus, string> = {
  offen: 'border-primary text-primary',
  in_pruefung: 'border-status-vertrag text-status-vertrag',
  abgeschlossen: 'border-status-bezahlt text-status-bezahlt',
};

const TAG_BORDER: Record<OvErkenntnisTag, string> = {
  kritisch: 'border-l-status-ueber',
  hot_spot: 'border-l-ov-teuer',
  plausibilitaet: 'border-l-ov-teuer',
  staerke: 'border-l-ov-guenstig',
  hinweis: 'border-l-primary',
};

const TAG_PILL: Record<OvErkenntnisTag, string> = {
  kritisch: 'bg-status-ueber',
  hot_spot: 'bg-ov-teuer',
  plausibilitaet: 'bg-ov-teuer',
  staerke: 'bg-ov-guenstig',
  hinweis: 'bg-primary',
};

const DOK_ARTEN: OvDokumentArt[] = [
  'positionenvergleich',
  'offerte',
  'ausschreibung',
  'beilage',
];

const ABWEICHUNG_TYP_PILL: Record<OvAbweichungTyp, string> = {
  fehlend: 'border-status-ueber text-status-ueber',
  zusaetzlich: 'border-ov-teuer text-ov-teuer',
  menge: 'border-ov-teuer text-ov-teuer',
  einheit: 'border-ov-teuer text-ov-teuer',
  produkt: 'border-primary-dark text-primary-dark',
};

const BEWERTUNGEN: OvAbweichungBewertung[] = [
  'kritisch',
  'tolerierbar',
  'ignoriert',
];

const BEWERTUNG_AKTIV: Record<OvAbweichungBewertung, string> = {
  offen: 'border-primary bg-primary text-white',
  kritisch: 'border-status-ueber bg-status-ueber text-white',
  tolerierbar: 'border-ov-guenstig bg-ov-guenstig text-white',
  ignoriert: 'border-primary bg-primary text-white',
};

/** Maximale automatische Fortsetzungs-Runden der Vollständigkeitsprüfung */
const MAX_FORTSETZUNGEN = 20;

function sanitizeFileName(name: string): string {
  // Supabase-Storage-Keys erlauben keine Umlaute («Invalid key») –
  // transliterieren statt verwerfen, Rest auf ASCII-Wortzeichen eindampfen
  return name
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/[^\w.\- ]+/g, '_')
    .slice(-80);
}

/**
 * Modul Offertenvergleich (O-M1): Vergabe-Übersicht, Vergabe-Detail mit
 * Uploads, Analyse mit Job-Polling (Parsing → Statistik → KI) und
 * interaktiver Auswertung (Hot Spots mit «wichtig»-Auswahl, Erkenntnisse,
 * Fazit, PDF-Report). Navigation über ?vergabe=<id> analog ?baseline= im
 * BKK-Modul; Mutationen speichern sofort (Toasts), kein Dirty-Zustand.
 */
export function OvClient({
  projectId,
  projectName,
  projectNo,
  managementName,
  managementLogoUrl,
  canEdit,
  vergaben,
  bieterCounts,
  detail,
}: OvClientProps) {
  const { toasts, showToast } = useToasts();
  const [busy, setBusy] = useState(false);
  const [neuOpen, setNeuOpen] = useState(false);
  const [job, setJob] = useState<OvJobRow | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyseRundenRef = useRef(0);
  const [vollJob, setVollJob] = useState<OvJobRow | null>(null);
  const vollPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const vollRundenRef = useRef(0);
  const [abweichungen, setAbweichungen] = useState<OvAbweichungRow[]>(
    () => detail?.abweichungen ?? [],
  );
  const monogram = managementName?.trim().charAt(0).toUpperCase();
  const t = texts.ov;

  // Lokale, sofort gespeicherte Zustände (Auswertung interaktiv)
  const [wichtig, setWichtig] = useState<Set<string>>(
    () => new Set((detail?.positionen ?? []).filter((p) => p.wichtig).map((p) => p.id)),
  );
  const [kontrollsummen, setKontrollsummen] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        (detail?.bieter ?? []).map((b) => [
          b.id,
          b.kontrollsumme_rp !== null ? formatRappen(b.kontrollsumme_rp) : '',
        ]),
      ),
  );

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (vollPollRef.current) clearInterval(vollPollRef.current);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Mutationen

  async function createVergabe(bkp: string, titel: string, lv: string) {
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('ov_vergaben')
      .insert({
        project_id: projectId,
        bkp: bkp.trim(),
        titel: titel.trim(),
        lv_nummer: lv.trim() || null,
      })
      .select('id')
      .single<{ id: string }>();
    setBusy(false);
    if (error || !data) {
      showToast(t.neu.fehler, 'error');
      return;
    }
    window.location.assign(`/module/offertenvergleich?vergabe=${data.id}`);
  }

  async function deleteVergabe() {
    if (!detail) return;
    if (!window.confirm(t.vergabe.confirmDelete)) return;
    setBusy(true);
    const supabase = createClient();
    const paths = detail.dokumente.map((d) => d.file_path);
    const berichtPaths = detail.berichte.map((b) => b.report_file_path);
    if (paths.length + berichtPaths.length > 0) {
      await supabase.storage
        .from('project-files')
        .remove([...paths, ...berichtPaths]);
    }
    const { error } = await supabase
      .from('ov_vergaben')
      .delete()
      .eq('id', detail.vergabe.id);
    setBusy(false);
    if (error) {
      showToast(texts.hub.saveErrorToast, 'error');
      return;
    }
    window.location.assign('/module/offertenvergleich');
  }

  async function uploadDokument(file: File, art: OvDokumentArt) {
    if (!detail) return;
    setBusy(true);
    const supabase = createClient();
    const path = `${projectId}/offertenvergleich/${detail.vergabe.id}/${crypto.randomUUID().slice(0, 8)}-${sanitizeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage
      .from('project-files')
      .upload(path, file, { contentType: 'application/pdf' });
    if (uploadError) {
      setBusy(false);
      showToast(t.vergabe.uploadError, 'error');
      return;
    }
    const { error } = await supabase.from('ov_dokumente').insert({
      project_id: projectId,
      vergabe_id: detail.vergabe.id,
      art,
      file_path: path,
      original_name: file.name,
    });
    setBusy(false);
    if (error) {
      showToast(t.vergabe.uploadError, 'error');
      return;
    }
    window.location.reload();
  }

  async function deleteDokument(dokument: OvDokument) {
    if (!window.confirm(t.vergabe.confirmDeleteDoc)) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.storage.from('project-files').remove([dokument.file_path]);
    const { error } = await supabase
      .from('ov_dokumente')
      .delete()
      .eq('id', dokument.id);
    setBusy(false);
    if (error) {
      showToast(texts.hub.saveErrorToast, 'error');
      return;
    }
    window.location.reload();
  }

  async function saveKontrollsumme(bieter: OvBieterRow, raw: string) {
    const rp = raw.trim() === '' ? null : parseChfToRappen(raw);
    setKontrollsummen((s) => ({
      ...s,
      [bieter.id]: rp !== null ? formatRappen(rp) : '',
    }));
    const supabase = createClient();
    const { error } = await supabase
      .from('ov_bieter')
      .update({ kontrollsumme_rp: rp })
      .eq('id', bieter.id);
    if (error) showToast(texts.hub.saveErrorToast, 'error');
    else showToast(texts.hub.savedToast);
  }

  async function toggleWichtig(position: OvPositionRow) {
    const next = new Set(wichtig);
    const value = !next.has(position.id);
    if (value) next.add(position.id);
    else next.delete(position.id);
    setWichtig(next);
    const supabase = createClient();
    const { error } = await supabase
      .from('ov_positionen')
      .update({ wichtig: value })
      .eq('id', position.id);
    if (error) showToast(texts.hub.saveErrorToast, 'error');
  }

  async function saveDokumentBieter(dokument: OvDokument, bieterId: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('ov_dokumente')
      .update({ bieter_id: bieterId === '' ? null : bieterId })
      .eq('id', dokument.id);
    if (error) {
      showToast(texts.hub.saveErrorToast, 'error');
      return;
    }
    showToast(texts.hub.savedToast);
    window.location.reload();
  }

  async function saveBewertung(
    abweichung: OvAbweichungRow,
    bewertung: OvAbweichungBewertung,
  ) {
    setAbweichungen((list) =>
      list.map((a) => (a.id === abweichung.id ? { ...a, bewertung } : a)),
    );
    const supabase = createClient();
    const { error } = await supabase
      .from('ov_abweichungen')
      .update({ bewertung })
      .eq('id', abweichung.id);
    if (error) showToast(texts.hub.saveErrorToast, 'error');
  }

  async function saveNotiz(abweichung: OvAbweichungRow, raw: string) {
    const notiz = raw.trim() === '' ? null : raw.trim();
    setAbweichungen((list) =>
      list.map((a) => (a.id === abweichung.id ? { ...a, notiz } : a)),
    );
    const supabase = createClient();
    const { error } = await supabase
      .from('ov_abweichungen')
      .update({ notiz })
      .eq('id', abweichung.id);
    if (error) showToast(texts.hub.saveErrorToast, 'error');
    else showToast(texts.hub.savedToast);
  }

  async function startVollstaendigkeit(fortsetzung = false) {
    if (!detail) return;
    if (!fortsetzung) vollRundenRef.current = 0;
    setVollJob({
      id: '',
      project_id: projectId,
      vergabe_id: detail.vergabe.id,
      typ: 'vollstaendigkeit',
      status: 'queued',
      stufe: null,
      fehler: null,
      auswertung_id: null,
      heartbeat_at: null,
      created_at: '',
      finished_at: null,
    });
    const response = await fetch('/api/ov/vollstaendigkeit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vergabeId: detail.vergabe.id }),
    });
    if (!response.ok) {
      setVollJob(null);
      showToast(t.vollstaendigkeit.jobError, 'error');
      return;
    }
    const { jobId } = (await response.json()) as { jobId: string };
    vollPollRef.current = setInterval(async () => {
      const jobResponse = await fetch(`/api/ov/jobs/${jobId}`);
      if (!jobResponse.ok) return;
      const current = (await jobResponse.json()) as OvJobRow;
      setVollJob(current);
      if (current.status === 'done') {
        if (vollPollRef.current) clearInterval(vollPollRef.current);
        // Zeitbudget erreicht → Folge-Job liest die restlichen Chunks
        if (
          current.stufe === 'fortsetzung' &&
          vollRundenRef.current < MAX_FORTSETZUNGEN
        ) {
          vollRundenRef.current += 1;
          void startVollstaendigkeit(true);
        } else {
          window.location.reload();
        }
      }
      if (current.status === 'error' && vollPollRef.current) {
        clearInterval(vollPollRef.current);
      }
    }, 2500);
  }

  async function startAnalyse(
    quelle: 'positionenvergleich' | 'offerten' = 'positionenvergleich',
    fortsetzung = false,
  ) {
    if (!detail) return;
    if (!fortsetzung) analyseRundenRef.current = 0;
    setJob({
      id: '',
      project_id: projectId,
      vergabe_id: detail.vergabe.id,
      typ: 'analyse',
      status: 'queued',
      stufe: null,
      fehler: null,
      auswertung_id: null,
      heartbeat_at: null,
      created_at: '',
      finished_at: null,
    });
    const response = await fetch('/api/ov/analyse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vergabeId: detail.vergabe.id, quelle }),
    });
    if (!response.ok) {
      setJob(null);
      showToast(t.vergabe.jobError, 'error');
      return;
    }
    const { jobId } = (await response.json()) as { jobId: string };
    pollRef.current = setInterval(async () => {
      const jobResponse = await fetch(`/api/ov/jobs/${jobId}`);
      if (!jobResponse.ok) return;
      const current = (await jobResponse.json()) as OvJobRow;
      setJob(current);
      if (current.status === 'done') {
        if (pollRef.current) clearInterval(pollRef.current);
        // Offerten-Extraktion in Etappen: Folge-Job liest die restlichen Chunks
        if (
          current.stufe === 'fortsetzung' &&
          analyseRundenRef.current < MAX_FORTSETZUNGEN
        ) {
          analyseRundenRef.current += 1;
          void startAnalyse('offerten', true);
        } else {
          window.location.reload();
        }
      }
      if (current.status === 'error' && pollRef.current) {
        clearInterval(pollRef.current);
      }
    }, 2500);
  }

  async function createReport() {
    if (!detail) return;
    setBusy(true);
    const response = await fetch('/api/ov/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vergabeId: detail.vergabe.id }),
    });
    setBusy(false);
    if (!response.ok) {
      showToast(t.auswertung.reportError, 'error');
      return;
    }
    const { filePath } = (await response.json()) as { filePath: string };
    window.open(`/api/ov/file?path=${encodeURIComponent(filePath)}`, '_blank');
    window.setTimeout(() => window.location.reload(), 800);
  }

  // -------------------------------------------------------------------------
  // Bausteine

  function statusPill(status: OvVergabeStatus) {
    return (
      <span className={`${PILL_BASE} ${STATUS_PILL[status]}`}>
        {t.status[status]}
      </span>
    );
  }

  function sectionTitle(title: string, hint?: string) {
    return (
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
        <h2 className="display-title text-[13px] font-medium tracking-[0.14em] text-ink sm:text-[15px]">
          {title}
        </h2>
        {hint && <span className="text-[11px] text-primary">{hint}</span>}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Screen 1: Übersicht

  function uebersicht() {
    return (
      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="text-xs text-primary">
            {vergaben.length}{' '}
            {vergaben.length === 1
              ? t.uebersicht.countSuffixOne
              : t.uebersicht.countSuffix}
          </span>
          {canEdit && (
            <button
              type="button"
              onClick={() => setNeuOpen(true)}
              className="display-title bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.14em] text-white transition-opacity hover:opacity-90 sm:px-5 sm:text-[12px]"
            >
              {t.uebersicht.add}
            </button>
          )}
        </div>
        <div className="overflow-x-auto border border-line bg-white">
          {vergaben.length === 0 ? (
            <p className="px-4 py-6 text-sm text-primary">{t.uebersicht.empty}</p>
          ) : (
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-line bg-bg text-left">
                  <th className="display-title px-4 py-3 text-[11px] font-medium tracking-[0.16em] text-primary-dark">
                    {t.uebersicht.colBkp}
                  </th>
                  <th className="display-title px-4 py-3 text-[11px] font-medium tracking-[0.16em] text-primary-dark">
                    {t.uebersicht.colTitel}
                  </th>
                  <th className="display-title px-4 py-3 text-[11px] font-medium tracking-[0.16em] text-primary-dark">
                    {t.uebersicht.colStatus}
                  </th>
                  <th className="display-title px-4 py-3 text-right text-[11px] font-medium tracking-[0.16em] text-primary-dark">
                    {t.uebersicht.colBieter}
                  </th>
                  <th className="display-title px-4 py-3 text-[11px] font-medium tracking-[0.16em] text-primary-dark">
                    {t.uebersicht.colStand}
                  </th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {vergaben.map((vergabe) => (
                  <tr
                    key={vergabe.id}
                    className="cursor-pointer border-b border-line transition-colors last:border-b-0 hover:bg-bg"
                    onClick={() =>
                      window.location.assign(
                        `/module/offertenvergleich?vergabe=${vergabe.id}`,
                      )
                    }
                  >
                    <td className="px-4 py-3 font-bold text-ink tabular-nums">
                      {vergabe.bkp}
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">
                      {vergabe.titel}
                    </td>
                    <td className="px-4 py-3">{statusPill(vergabe.status)}</td>
                    <td className="px-4 py-3 text-right text-primary-dark tabular-nums">
                      {bieterCounts[vergabe.id] ?? 0}
                    </td>
                    <td className="px-4 py-3 text-primary-dark tabular-nums">
                      {vergabe.stand ? formatDate(vergabe.stand) : '–'}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-accent">
                      {t.uebersicht.open} →
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    );
  }

  // -------------------------------------------------------------------------
  // Screen 2: Vergabe-Detail

  function dokumentGruppe(art: OvDokumentArt) {
    if (!detail) return null;
    const list = detail.dokumente.filter((d) => d.art === art);
    return (
      <div key={art} className="min-w-0 border border-line bg-white p-4">
        <p className="display-title text-[11px] font-medium tracking-[0.16em] text-primary-dark">
          {t.vergabe.art[art]}
        </p>
        <p className="mt-0.5 text-[10px] text-primary">{t.vergabe.artHint[art]}</p>
        <ul className="mt-2">
          {list.map((dokument) => (
            <li
              key={dokument.id}
              className="flex items-center gap-2 border-b border-line py-1.5 text-xs last:border-b-0"
            >
              <a
                href={`/api/ov/file?path=${encodeURIComponent(dokument.file_path)}`}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate font-medium text-ink underline-offset-2 hover:text-accent hover:underline"
              >
                {dokument.original_name}
              </a>
              {art === 'positionenvergleich' && dokument.parse_status === 'fehler' && (
                <span
                  className={`${PILL_BASE} border-status-ueber text-status-ueber`}
                  title={dokument.parse_fehler ?? undefined}
                >
                  {t.vergabe.parseFehler}
                </span>
              )}
              {(art === 'offerte' || art === 'ausschreibung') &&
                dokument.parse_status === 'geparst' && (
                  <span
                    className={`${PILL_BASE} border-ov-guenstig text-ov-guenstig`}
                    title={(dokument.parse_fortschritt?.hinweise ?? []).join('\n') || undefined}
                  >
                    ✓ {t.vergabe.gelesen}
                  </span>
                )}
              {art === 'offerte' && detail.bieter.length > 0 && (
                <select
                  value={dokument.bieter_id ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => void saveDokumentBieter(dokument, e.target.value)}
                  title={t.vergabe.bieterZuordnung}
                  className="max-w-32 shrink-0 truncate border border-line bg-bg px-1.5 py-0.5 text-[10px] text-primary-dark outline-none focus:border-accent disabled:opacity-60"
                >
                  <option value="">{t.vergabe.bieterOhne}</option>
                  {detail.bieter.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
              <span className="shrink-0 text-[10px] text-primary tabular-nums">
                {formatDate(dokument.created_at)}
              </span>
              {canEdit && (
                <button
                  type="button"
                  title={t.vergabe.deleteDoc}
                  onClick={() => deleteDokument(dokument)}
                  className="shrink-0 border border-line bg-white px-1.5 py-0.5 text-[11px] text-primary-dark hover:border-error hover:text-error"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <label className="mt-2 block cursor-pointer border border-dashed border-line px-3 py-1.5 text-center text-[11px] text-primary transition-colors hover:border-primary hover:text-primary-dark">
            {busy ? t.vergabe.uploading : t.vergabe.upload}
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadDokument(file, art);
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>
    );
  }

  function analyseBereich() {
    if (!detail) return null;
    const hatVergleich = detail.dokumente.some(
      (d) => d.art === 'positionenvergleich',
    );
    const offerten = detail.dokumente.filter((d) => d.art === 'offerte');
    const offertenZugeordnet = offerten.some((d) => d.bieter_id);
    const laueft =
      job !== null &&
      (job.status === 'queued' ||
        job.status === 'running' ||
        (job.status === 'done' && job.stufe === 'fortsetzung'));
    const stufeLabel = laueft
      ? (t.vergabe.stufen[
          (job?.stufe ?? 'queued') as keyof typeof t.vergabe.stufen
        ] ?? t.vergabe.stufen.queued)
      : null;
    const keinePreise = job?.status === 'error' && job.stufe === 'keine_preise';
    const ausOfferten = detail.auswertung?.inhalt.preisquelle === 'offerten';
    return (
      <div className="mt-4">
        {canEdit && (
          <p className="mb-3 max-w-3xl text-[11px] leading-relaxed text-primary">
            {t.vergabe.ablaufHint}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => startAnalyse('positionenvergleich')}
                disabled={!hatVergleich || laueft || busy}
                title={!hatVergleich ? t.vergabe.needsVergleich : undefined}
                className="display-title bg-accent px-5 py-2.5 text-[12px] font-medium tracking-[0.14em] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {detail.auswertung && !ausOfferten
                  ? t.vergabe.analyseErneut
                  : t.vergabe.analyse}
              </button>
              <button
                type="button"
                onClick={() => startAnalyse('offerten')}
                disabled={!offertenZugeordnet || laueft || busy}
                title={
                  !offertenZugeordnet
                    ? t.vergabe.needsOffertenZuordnung
                    : undefined
                }
                className="display-title border border-accent px-5 py-2.5 text-[12px] font-medium tracking-[0.14em] text-accent transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                {detail.auswertung && ausOfferten
                  ? t.vergabe.analyseOffertenErneut
                  : t.vergabe.analyseOfferten}
              </button>
            </>
          )}
          {laueft && (
            <span className="flex items-center gap-2 text-xs font-semibold text-status-vertrag">
              <span className="h-2 w-2 animate-pulse rounded-full bg-status-vertrag" />
              {stufeLabel}
              {analyseRundenRef.current > 0 && ` (${analyseRundenRef.current + 1})`}
            </span>
          )}
          {job?.status === 'error' && !keinePreise && (
            <span className="text-xs text-status-ueber">
              {t.vergabe.jobError}: {job.fehler}
            </span>
          )}
          {canEdit && detail.auswertung && !laueft && (
            <span className="text-[11px] text-primary">
              {t.vergabe.analyseHint}
            </span>
          )}
        </div>
        {keinePreise && (
          <div className="mt-3 max-w-3xl border border-warn border-l-[3px] border-l-warn bg-ov-teuer-tint p-4">
            <p className="display-title text-[11px] font-medium tracking-[0.14em] text-ink">
              {t.vergabe.keinePreiseTitel}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink">
              {t.vergabe.keinePreiseText}
            </p>
            {canEdit && (
              <button
                type="button"
                onClick={() => startAnalyse('offerten')}
                disabled={!offertenZugeordnet || busy}
                title={
                  !offertenZugeordnet
                    ? t.vergabe.needsOffertenZuordnung
                    : undefined
                }
                className="display-title mt-3 bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.14em] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {t.vergabe.analyseOfferten}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  function abweichungGruppe(dokument: OvDokument) {
    const tv = t.vollstaendigkeit;
    const list = abweichungen.filter((a) => a.dokument_id === dokument.id);
    const bieterNameById = new Map(detail!.bieter.map((b) => [b.id, b.name]));
    const name = dokument.bieter_id
      ? (bieterNameById.get(dokument.bieter_id) ?? dokument.original_name)
      : `${dokument.original_name} (${tv.dokumentOhneBieter})`;
    const stichprobe = dokument.parse_fortschritt?.stichprobe;
    const hinweise = dokument.parse_fortschritt?.hinweise ?? [];
    if (dokument.parse_status !== 'geparst' && list.length === 0) return null;
    return (
      <div key={dokument.id} className="border border-line bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-bg px-4 py-2.5">
          <span className="text-xs font-bold text-ink">{name}</span>
          <span className="text-[10px] text-primary">
            {list.length === 0
              ? tv.keineAbweichungen
              : `${list.length} ${list.length === 1 ? tv.abweichungSuffixOne : tv.abweichungenSuffix}`}
          </span>
          {stichprobe && stichprobe.verglichen > 0 && (
            <span
              className={`${PILL_BASE} ${
                stichprobe.abweichend === 0
                  ? 'border-ov-guenstig text-ov-guenstig'
                  : 'border-status-ueber text-status-ueber'
              }`}
              title={`${tv.stichprobe}: ${stichprobe.verglichen - stichprobe.abweichend}/${stichprobe.verglichen}`}
            >
              {stichprobe.abweichend === 0
                ? `✓ ${tv.stichprobe}`
                : `${tv.stichprobe}: ${stichprobe.abweichend} Δ`}
            </span>
          )}
          {hinweise.length > 0 && (
            <span
              className="cursor-help text-[10px] text-primary underline decoration-dotted underline-offset-2"
              title={hinweise.join('\n')}
            >
              {tv.hinweiseTitle} ({hinweise.length})
            </span>
          )}
        </div>
        {list.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <tbody>
                {list.map((a) => (
                  <tr
                    key={a.id}
                    className={`border-b border-line last:border-b-0 ${
                      a.bewertung === 'ignoriert' ? 'opacity-45' : ''
                    }`}
                  >
                    <td className="w-24 px-3 py-2 align-top">
                      <span className={`${PILL_BASE} ${ABWEICHUNG_TYP_PILL[a.typ]}`}>
                        {tv.typLabels[a.typ]}
                      </span>
                    </td>
                    <td className="w-28 px-3 py-2 align-top text-xs font-semibold text-primary-dark tabular-nums whitespace-nowrap">
                      {a.npk}
                    </td>
                    <td className="min-w-48 px-3 py-2 align-top">
                      <span className="block text-xs font-medium text-ink">
                        {a.titel}
                      </span>
                      <span className="block text-[10px] text-primary">
                        {a.details.erwartet !== undefined &&
                          `${tv.erwartetPrefix} ${a.details.erwartet}`}
                        {a.details.erwartet !== undefined &&
                          a.details.gefunden !== undefined &&
                          ' → '}
                        {a.details.gefunden !== undefined &&
                          `${tv.gefundenPrefix} ${a.details.gefunden}`}
                      </span>
                    </td>
                    <td className="w-64 px-3 py-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        {BEWERTUNGEN.map((bewertung) => {
                          const aktiv = a.bewertung === bewertung;
                          return (
                            <button
                              key={bewertung}
                              type="button"
                              disabled={!canEdit}
                              onClick={() =>
                                void saveBewertung(
                                  a,
                                  aktiv ? 'offen' : bewertung,
                                )
                              }
                              className={`${PILL_BASE} transition-colors disabled:cursor-default ${
                                aktiv
                                  ? BEWERTUNG_AKTIV[bewertung]
                                  : 'border-line bg-white text-primary hover:border-primary'
                              }`}
                            >
                              {tv.bewertungLabels[bewertung]}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="w-52 px-3 py-2 align-top">
                      <input
                        type="text"
                        defaultValue={a.notiz ?? ''}
                        placeholder={tv.notizPlaceholder}
                        disabled={!canEdit}
                        onBlur={(e) => {
                          if (canEdit && e.currentTarget.value.trim() !== (a.notiz ?? '')) {
                            void saveNotiz(a, e.currentTarget.value);
                          }
                        }}
                        className="w-full border border-line bg-bg px-2 py-1 text-xs text-ink outline-none focus:border-accent disabled:opacity-60"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function vollstaendigkeitBereich() {
    if (!detail) return null;
    const tv = t.vollstaendigkeit;
    const offerten = detail.dokumente.filter((d) => d.art === 'offerte');
    const hatAusschreibung = detail.dokumente.some(
      (d) => d.art === 'ausschreibung',
    );
    const laueft =
      vollJob !== null &&
      (vollJob.status === 'queued' ||
        vollJob.status === 'running' ||
        (vollJob.status === 'done' && vollJob.stufe === 'fortsetzung'));
    const stufeLabel = laueft
      ? (tv.stufen[(vollJob?.stufe ?? 'queued') as keyof typeof tv.stufen] ??
        tv.stufen.queued)
      : null;
    const geprueft = offerten.some((d) => d.parse_status === 'geparst');
    return (
      <section className="mt-8">
        {sectionTitle(
          tv.title,
          hatAusschreibung ? tv.referenzAusschreibung : tv.referenzVergleich,
        )}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {canEdit && (
            <button
              type="button"
              onClick={() => void startVollstaendigkeit()}
              disabled={offerten.length === 0 || laueft || busy}
              title={offerten.length === 0 ? tv.needsOfferte : undefined}
              className="display-title bg-accent px-5 py-2.5 text-[12px] font-medium tracking-[0.14em] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {geprueft ? tv.erneut : tv.start}
            </button>
          )}
          {laueft && (
            <span className="flex items-center gap-2 text-xs font-semibold text-status-vertrag">
              <span className="h-2 w-2 animate-pulse rounded-full bg-status-vertrag" />
              {stufeLabel}
              {vollRundenRef.current > 0 && ` (${vollRundenRef.current + 1})`}
            </span>
          )}
          {laueft && vollRundenRef.current > 0 && (
            <span className="text-[11px] text-primary">{tv.fortsetzungInfo}</span>
          )}
          {vollJob?.status === 'error' && (
            <span className="text-xs text-status-ueber">
              {tv.jobError}: {vollJob.fehler}
            </span>
          )}
          {canEdit && geprueft && !laueft && (
            <span className="text-[11px] text-primary">{tv.bewertungHint}</span>
          )}
        </div>
        {!geprueft && !laueft ? (
          <p className="text-sm text-primary">{tv.nochNichtGeprueft}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {offerten.map((dokument) => abweichungGruppe(dokument))}
          </div>
        )}
      </section>
    );
  }

  function bieterKarten() {
    if (!detail || detail.bieter.length === 0) return null;
    const inhalt = detail.auswertung?.inhalt ?? null;
    return (
      <section className="mt-8">
        {sectionTitle(t.vergabe.bieterTitle)}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {detail.bieter.map((bieter, index) => {
            const totalRp = inhalt?.analyse.bieterTotaleRp[index] ?? null;
            const rang =
              inhalt !== null ? inhalt.analyse.ranking.indexOf(index) + 1 : null;
            const kontrollRp =
              (kontrollsummen[bieter.id] ?? '').trim() === ''
                ? null
                : parseChfToRappen(kontrollsummen[bieter.id]);
            const abgleichAnzeige =
              totalRp !== null
                ? beschreibeAbgleich(
                    berechneAbgleich(
                      totalRp,
                      kontrollRp,
                      inhalt?.erklaerbarePositionen ?? [],
                    ),
                  )
                : null;
            return (
              <div
                key={bieter.id}
                className="border border-line border-t-2 border-t-accent bg-white p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-ink">{bieter.name}</p>
                  {rang !== null && (
                    <span
                      className={`${PILL_BASE} ${
                        rang === 1
                          ? 'border-ov-guenstig text-ov-guenstig'
                          : 'border-primary text-primary'
                      }`}
                    >
                      {t.auswertung.rangPrefix} {rang}
                    </span>
                  )}
                </div>
                <p className="text-xs text-primary-dark">{bieter.ort}</p>
                <p className="text-xs text-primary-dark">{bieter.telefon}</p>
                {totalRp !== null && (
                  <p className="mt-2 border-t border-line pt-2 text-sm font-bold text-ink tabular-nums">
                    {formatRappen(totalRp)}
                    <span className="ml-1 text-[10px] font-normal text-primary">
                      {t.auswertung.totalLabel}
                    </span>
                  </p>
                )}
                <div className="mt-2">
                  <label className="block text-[10px] text-primary">
                    {t.vergabe.kontrollsumme}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={kontrollsummen[bieter.id] ?? ''}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setKontrollsummen((s) => ({
                        ...s,
                        [bieter.id]: e.target.value,
                      }))
                    }
                    onBlur={(e) =>
                      canEdit && void saveKontrollsumme(bieter, e.currentTarget.value)
                    }
                    className="mt-0.5 w-full border border-line bg-bg px-2 py-1.5 text-right text-xs text-ink tabular-nums outline-none focus:border-accent disabled:opacity-60"
                  />
                  {abgleichAnzeige && (
                    <p
                      className={`mt-1 text-[10px] font-semibold leading-snug ${
                        abgleichAnzeige.tone === 'ok'
                          ? 'text-ov-guenstig'
                          : 'text-status-ueber'
                      }`}
                    >
                      {abgleichAnzeige.text}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-primary">
          {t.vergabe.kontrollsummeHint}
        </p>
      </section>
    );
  }

  function selbstpruefungZeile() {
    const inhalt = detail?.auswertung?.inhalt;
    if (!inhalt) return null;
    const sp = inhalt.selbstpruefung;
    return (
      <div className="border border-line bg-white px-4 py-3 text-xs">
        <span className="display-title mr-3 text-[10px] font-medium tracking-[0.16em] text-primary-dark">
          {t.auswertung.selbstpruefung}
        </span>
        <span className="mr-3 font-semibold text-ov-guenstig">
          ✓ {sp.positionCount} {t.auswertung.parserOk}
        </span>
        {(detail?.bieter ?? []).map((b, i) => {
          const totalRp = inhalt.analyse.bieterTotaleRp[i] ?? 0;
          const kontrollRp =
            (kontrollsummen[b.id] ?? '').trim() === ''
              ? null
              : parseChfToRappen(kontrollsummen[b.id]);
          const a = berechneAbgleich(
            totalRp,
            kontrollRp,
            inhalt.erklaerbarePositionen ?? [],
          );
          if (a.status === 'ohne') {
            return (
              <span key={i} className="mr-3 text-primary">
                {b.name}: {t.auswertung.abgleichFehlt}
              </span>
            );
          }
          if (a.status === 'abweichung') {
            return (
              <span key={i} className="mr-3 font-semibold text-status-ueber">
                {b.name}: {t.report.abgleichDiff} {formatRappen(a.restRp)}
              </span>
            );
          }
          return (
            <span key={i} className="mr-3 font-semibold text-ov-guenstig">
              ✓ {b.name}
            </span>
          );
        })}
        {sp.kiUebersprungen && (
          <span className="mr-3 text-warn">{t.auswertung.kiUebersprungen}</span>
        )}
        {sp.kiZahlenOhneBeleg.length > 0 && (
          <span className="text-warn">
            {t.auswertung.kiZahlenHinweis} {sp.kiZahlenOhneBeleg.join(', ')}
          </span>
        )}
        {sp.warnings.length > 0 && (
          <span className="ml-3 text-primary">
            {t.auswertung.warnings}: {sp.warnings.join(' · ')}
          </span>
        )}
      </div>
    );
  }

  function hotspotsTabelle() {
    if (!detail?.auswertung) return null;
    const inhalt = detail.auswertung.inhalt;
    const posByNpk = new Map(detail.positionen.map((p) => [p.npk, p]));
    const angebotKey = new Map(
      detail.angebote.map((a) => [`${a.position_id}:${a.bieter_id}`, a]),
    );
    const rows = inhalt.analyse.hotspots
      .map((npk) => posByNpk.get(npk))
      .filter((p): p is OvPositionRow => Boolean(p))
      .slice(0, 40);

    return (
      <section className="mt-8">
        {sectionTitle(t.auswertung.hotspotsTitle, t.auswertung.hotspotsHint)}
        <div className="overflow-x-auto border border-line bg-white">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-line bg-bg text-left">
                <th className="display-title px-3 py-2.5 text-[10px] font-medium tracking-[0.12em] text-primary-dark">
                  {t.auswertung.colNpk}
                </th>
                <th className="display-title px-3 py-2.5 text-[10px] font-medium tracking-[0.12em] text-primary-dark">
                  {t.auswertung.colBezeichnung}
                </th>
                {detail.bieter.map((b) => (
                  <th
                    key={b.id}
                    className="display-title px-3 py-2.5 text-right text-[10px] font-medium tracking-[0.12em] text-primary-dark"
                  >
                    {b.name}
                  </th>
                ))}
                <th className="display-title px-3 py-2.5 text-center text-[10px] font-medium tracking-[0.12em] text-primary-dark">
                  {t.auswertung.colWichtig}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((position) => {
                const werte = detail.bieter.map((b) => {
                  const angebot = angebotKey.get(`${position.id}:${b.id}`);
                  return angebot?.is_inkl ? null : (angebot?.betrag_rp ?? null);
                });
                const handschrift = detail.bieter.map((b) => {
                  const angebot = angebotKey.get(`${position.id}:${b.id}`);
                  return (angebot?.flags ?? []).includes('handschriftlich');
                });
                const numbers = werte.filter((w): w is number => w !== null);
                const min = numbers.length >= 2 ? Math.min(...numbers) : null;
                const max = numbers.length >= 2 ? Math.max(...numbers) : null;
                return (
                  <tr key={position.id} className="border-b border-line last:border-b-0">
                    <td className="px-3 py-2 text-xs font-semibold text-primary-dark tabular-nums whitespace-nowrap">
                      {position.npk}
                    </td>
                    <td className="px-3 py-2">
                      <span className="block text-xs font-medium text-ink">
                        {position.bezeichnung}
                      </span>
                      <span className="block text-[10px] text-primary">
                        {position.menge !== null
                          ? `${position.menge % 1 === 0 ? position.menge : position.menge.toFixed(3)} ${position.einheit ?? ''}`
                          : (position.einheit ?? '')}
                        {position.kostenblock && ` · ${position.kostenblock}`}
                      </span>
                    </td>
                    {werte.map((wert, i) => {
                      const tone =
                        wert === null || min === null || min === max
                          ? ''
                          : wert < 0
                            ? 'font-bold text-status-ueber'
                            : wert === min
                              ? 'bg-ov-guenstig-tint font-bold text-ov-guenstig'
                              : wert === max
                                ? 'bg-ov-teuer-tint font-bold text-ov-teuer'
                                : '';
                      return (
                        <td
                          key={i}
                          className={`px-3 py-2 text-right text-xs tabular-nums whitespace-nowrap ${tone}`}
                        >
                          {wert === null
                            ? t.auswertung.inklLabel
                            : formatRappen(wert)}
                          {handschrift[i] && (
                            <span
                              title={t.vergabe.handschriftlich}
                              className="ml-1 cursor-help text-warn"
                            >
                              ✎
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={wichtig.has(position.id)}
                        disabled={!canEdit}
                        onChange={() => toggleWichtig(position)}
                        className="accent-accent"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  function kostenbloecke() {
    const inhalt = detail?.auswertung?.inhalt;
    if (!inhalt || !detail) return null;
    return (
      <section className="mt-8">
        {sectionTitle(t.auswertung.blockTitle)}
        <div className="overflow-x-auto border border-line bg-white">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-line bg-bg text-left">
                <th className="display-title px-3 py-2.5 text-[10px] font-medium tracking-[0.12em] text-primary-dark">
                  {t.auswertung.blockTitle}
                </th>
                {inhalt.bieter.map((b) => (
                  <th
                    key={b.name}
                    className="display-title px-3 py-2.5 text-right text-[10px] font-medium tracking-[0.12em] text-primary-dark"
                  >
                    {b.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inhalt.analyse.kostenbloecke.map((block) => {
                const min = Math.min(...block.summenRp);
                const max = Math.max(...block.summenRp);
                return (
                  <tr key={block.name} className="border-b border-line last:border-b-0">
                    <td className="px-3 py-2 text-xs font-medium text-ink">
                      {block.name}
                      <span className="ml-1 text-[10px] text-primary">
                        ({block.positionCount})
                      </span>
                    </td>
                    {block.summenRp.map((summe, i) => (
                      <td
                        key={i}
                        className={`px-3 py-2 text-right text-xs tabular-nums whitespace-nowrap ${
                          min !== max && summe === min
                            ? 'font-bold text-ov-guenstig'
                            : min !== max && summe === max
                              ? 'font-bold text-ov-teuer'
                              : ''
                        }`}
                      >
                        {formatRappen(summe)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  function erkenntnisse() {
    const inhalt = detail?.auswertung?.inhalt;
    if (!inhalt || inhalt.erkenntnisse.length === 0) return null;
    return (
      <section className="mt-8">
        {sectionTitle(
          t.auswertung.erkenntnisseTitle,
          `${inhalt.erkenntnisse.length} ${t.report.erkenntnisseSuffix}`,
        )}
        <div className="flex flex-col gap-3">
          {inhalt.erkenntnisse.map((e, index) => (
            <div
              key={index}
              className={`border border-line border-l-[3px] bg-white p-4 ${TAG_BORDER[e.tag] ?? 'border-l-primary'}`}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="display-title text-xs font-medium tracking-[0.08em] text-ink">
                  {index + 1} · {e.titel}
                </h3>
                <span
                  className={`display-title px-2 py-0.5 text-[9px] font-semibold tracking-[0.14em] text-white ${TAG_PILL[e.tag] ?? 'bg-primary'}`}
                >
                  {texts.ov.tagLabels[e.tag] ?? e.tag}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-ink">{e.text}</p>
              {e.bullets.length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-1">
                  {e.bullets.map((bullet, i) => (
                    <li key={i} className="flex gap-2 text-xs text-primary-dark">
                      <span className="text-primary">•</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>
    );
  }

  function fazit() {
    const inhalt = detail?.auswertung?.inhalt;
    if (!inhalt?.fazit) return null;
    return (
      <section className="mt-8">
        {sectionTitle(t.auswertung.fazitTitle, t.report.fazitSubtitle)}
        <div className="overflow-x-auto border border-line bg-white">
          <table className="w-full min-w-[36rem] text-sm">
            <tbody>
              {inhalt.fazit.ranking.map((r, index) => (
                <tr key={r.name} className="border-b border-line last:border-b-0">
                  <td className="display-title w-10 px-3 py-3 text-center text-lg font-semibold text-accent">
                    {index + 1}
                  </td>
                  <td className="w-40 px-3 py-3 text-xs font-bold text-ink">
                    {r.name}
                  </td>
                  <td className="px-3 py-3 text-xs leading-relaxed text-primary-dark">
                    {r.charakter}
                  </td>
                  <td className="display-title w-36 px-3 py-3 text-right text-[10px] font-semibold tracking-[0.1em] text-primary-dark">
                    {r.tendenz}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 border border-line border-l-[3px] border-l-accent bg-white p-4">
          <p className="display-title mb-2 text-[11px] font-medium tracking-[0.16em] text-ink">
            {t.report.empfehlungTitle}
          </p>
          {inhalt.fazit.bereinigung.map((b) => (
            <p key={b.name} className="mb-2 text-xs leading-relaxed text-ink">
              <span className="font-bold">{b.name}</span> – {b.text}
            </p>
          ))}
          <p className="text-xs leading-relaxed text-ink">
            {inhalt.fazit.empfehlung}
          </p>
        </div>
      </section>
    );
  }

  function berichte() {
    if (!detail?.auswertung) return null;
    return (
      <section className="mt-8">
        {sectionTitle(t.auswertung.berichteTitle)}
        <div className="flex flex-wrap items-center gap-3">
          {canEdit && (
            <button
              type="button"
              onClick={createReport}
              disabled={busy}
              className="display-title bg-accent px-5 py-2.5 text-[12px] font-medium tracking-[0.14em] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? t.auswertung.reportRunning : t.auswertung.report}
            </button>
          )}
          {detail.berichte.map((bericht) => (
            <a
              key={bericht.id}
              href={`/api/ov/file?path=${encodeURIComponent(bericht.report_file_path)}`}
              target="_blank"
              rel="noreferrer"
              className="border border-line bg-white px-3 py-2 text-xs text-primary-dark transition-colors hover:border-accent hover:text-accent"
            >
              {t.auswertung.reportDownload} · {formatDate(bericht.created_at)}
            </a>
          ))}
        </div>
      </section>
    );
  }

  function detailScreen() {
    if (!detail) return null;
    return (
      <section>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/module/offertenvergleich"
              className="shrink-0 text-xs text-primary transition-colors hover:text-ink"
            >
              ← {t.vergabe.back}
            </Link>
            <span className="hidden h-5 w-px shrink-0 bg-line sm:block" />
            <h2 className="display-title min-w-0 truncate text-[15px] font-medium tracking-[0.08em] text-ink sm:text-lg">
              BKP {detail.vergabe.bkp} · {detail.vergabe.titel}
            </h2>
            {statusPill(detail.vergabe.status)}
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={deleteVergabe}
              disabled={busy}
              className="border border-line bg-white px-3 py-1.5 text-xs text-primary-dark transition-colors hover:border-error hover:text-error disabled:opacity-50"
            >
              {t.vergabe.delete}
            </button>
          )}
        </div>

        {sectionTitle(t.vergabe.dokumenteTitle)}
        <div className="grid gap-3 sm:grid-cols-2">
          {DOK_ARTEN.map((art) => dokumentGruppe(art))}
        </div>
        {analyseBereich()}

        {bieterKarten()}

        {vollstaendigkeitBereich()}

        {detail.auswertung ? (
          <>
            <section className="mt-8">
              {sectionTitle(
                t.auswertung.title,
                `${t.auswertung.stand} ${formatDate(detail.auswertung.created_at)}`,
              )}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={`${PILL_BASE} border-primary text-primary`}>
                  {detail.auswertung.inhalt.preisquelle === 'offerten'
                    ? t.report.quelleOfferten
                    : t.report.quelleVergleich}
                </span>
                {(detail.auswertung.inhalt.handschriftlichCount ?? 0) > 0 && (
                  <span className={`${PILL_BASE} border-warn text-warn`}>
                    ✎ {detail.auswertung.inhalt.handschriftlichCount}{' '}
                    {t.vergabe.handschriftlich}
                  </span>
                )}
              </div>
              {selbstpruefungZeile()}
            </section>
            {hotspotsTabelle()}
            {kostenbloecke()}
            {erkenntnisse()}
            {fazit()}
            {berichte()}
          </>
        ) : (
          <p className="mt-8 text-sm text-primary">
            {t.auswertung.keineAuswertung}
          </p>
        )}
      </section>
    );
  }

  // -------------------------------------------------------------------------

  function neuModal() {
    if (!neuOpen) return null;
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4">
        <form
          className="w-full max-w-sm border border-line bg-white p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void createVergabe(
              String(form.get('bkp') ?? ''),
              String(form.get('titel') ?? ''),
              String(form.get('lv') ?? ''),
            );
          }}
        >
          <h2 className="display-title mb-4 text-sm text-ink">{t.neu.title}</h2>
          <label className="mb-3 block">
            <span className="display-title text-[10px] font-medium tracking-[0.12em] text-primary-dark">
              {t.neu.bkp}
            </span>
            <input
              name="bkp"
              required
              placeholder={t.neu.bkpPlaceholder}
              className="mt-1 w-full border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="mb-3 block">
            <span className="display-title text-[10px] font-medium tracking-[0.12em] text-primary-dark">
              {t.neu.titel}
            </span>
            <input
              name="titel"
              required
              placeholder={t.neu.titelPlaceholder}
              className="mt-1 w-full border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="mb-4 block">
            <span className="display-title text-[10px] font-medium tracking-[0.12em] text-primary-dark">
              {t.neu.lv}
            </span>
            <input
              name="lv"
              className="mt-1 w-full border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setNeuOpen(false)}
              className="border border-line bg-white px-4 py-2 text-xs text-primary-dark hover:border-primary"
            >
              {texts.common.cancel}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="display-title bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.14em] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {t.neu.anlegen}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Sticky Toolbar (Design-System, analog BKK/LV) */}
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="mx-auto flex h-13 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:h-14 sm:px-14">
          <div className="flex min-w-0 items-center gap-3">
            {managementLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- externe Storage-URL
              <img
                src={managementLogoUrl}
                alt={managementName ?? ''}
                className="h-7 w-auto shrink-0"
              />
            ) : (
              <>
                {monogram && (
                  <span className="display-title flex h-7 w-7 shrink-0 items-center justify-center border border-ink text-sm font-semibold text-ink">
                    {monogram}
                  </span>
                )}
                <span className="display-title hidden truncate text-[15px] font-medium tracking-[0.14em] text-ink lg:block">
                  {managementName}
                </span>
              </>
            )}
            <span className="hidden h-5 w-px shrink-0 bg-line sm:block" />
            <Link
              href="/hub"
              className="shrink-0 text-xs text-primary transition-colors hover:text-ink"
            >
              ← {texts.hub.title}
            </Link>
          </div>
          <LogoutButton />
        </div>
      </header>

      {/* Modul-Kopfzeile */}
      <div className="border-b border-line">
        <div className="mx-auto w-full max-w-7xl px-5 py-5 sm:px-14 sm:py-7">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <span className="display-title bg-ink px-2 py-1 text-[9px] font-medium tracking-[0.22em] text-white sm:px-2.5 sm:text-[10px] sm:tracking-[0.24em]">
              {texts.modules.badge}
            </span>
            <h1 className="display-title text-lg leading-tight font-medium tracking-[0.05em] text-ink sm:text-[26px] sm:tracking-[0.06em]">
              {texts.modules.offertenvergleich.label}
            </h1>
          </div>
          <p className="display-title mt-1.5 truncate text-[10px] tracking-[0.2em] text-primary sm:text-xs sm:tracking-[0.26em]">
            {projectName}
            {projectNo && ` · ${texts.landing.projectNoPrefix} ${projectNo}`}
          </p>
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-6 sm:px-14 sm:py-8">
        {detail ? detailScreen() : uebersicht()}
      </main>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-0.5 px-5 py-4 text-[10px] uppercase tracking-[0.08em] text-primary sm:flex-row sm:justify-between sm:px-14 sm:py-5 sm:text-[11px]">
          <span>
            {projectNo && `${texts.landing.projectNoPrefix} ${projectNo}`}
          </span>
          {managementName && (
            <span>
              © {new Date().getFullYear()} {managementName}
            </span>
          )}
        </div>
      </footer>

      {neuModal()}
      <ToastContainer toasts={toasts} />
    </div>
  );
}

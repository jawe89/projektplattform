'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { ToastContainer, useToasts } from '@/components/ui/toast';
import { LogoutButton } from '@/features/auth/logout-button';
import {
  BaselineModal,
  type BaselineModalResult,
} from '@/features/bkk/baseline-modal';
import { EntryModal, type EntryModalResult } from '@/features/bkk/entry-modal';
import { GroupModal, type GroupModalResult } from '@/features/bkk/group-modal';
import {
  PositionModal,
  type PositionModalResult,
} from '@/features/bkk/position-modal';
import {
  type BkkAmpel,
  type BkkCalcOptions,
  type BkkPositionWithEntries,
  type BkkStatus,
  baselineRp,
  deltaPct,
  deltaTone,
  displayRp,
  effectiveKvMutRp,
  entrySums,
  groupDeltaPct,
  groupSubtotals,
  kvMutKpi,
  offenRp,
  positionStatus,
  totals,
} from '@/lib/bkk-calc';
import { formatDate, formatRappen, parseChfToRappen } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import { texts } from '@/lib/texts';
import type {
  BkkBaseline,
  BkkEntry,
  BkkEntryType,
  BkkGroup,
  BkkPosition,
} from '@/lib/types';

interface BkkClientProps {
  projectId: string;
  projectName: string;
  /** Projekt-Nr. für Kopfzeile und Footer (Design-Referenz) */
  projectNo: string | null;
  managementName: string | null;
  managementLogoUrl: string | null;
  /** Bearbeitung (Rollen-Freigabe «Bearbeiten» oder Projekt-Admin) */
  canEdit: boolean;
  /** 5-Rappen-Anzeige-/Totalisierungsregel (Moduleinstellung) */
  round5: boolean;
  groups: BkkGroup[];
  /** Alle Baselines des Projekts (für die Verwaltung) */
  baselines: BkkBaseline[];
  /** Betrachtete Baseline (aktive oder per ?baseline= gewählte) oder null */
  viewedBaseline: BkkBaseline | null;
  /** position_id → kv_rp der betrachteten Baseline */
  baselineValues: Record<string, number>;
  /** false = Read-only-Ansicht einer nicht aktiven Baseline */
  isActiveBaselineView: boolean;
  initialPositions: BkkPosition[];
  initialEntries: BkkEntry[];
}

/** Spaltenzahl der Tabelle (für colSpan der Gruppen-/Detailzeilen) */
const COLS = 7;

/* Status-Pillen und Ampeln mit den fixen Statusfarben der Design-Referenz –
   bewusst tenant-unabhängig, damit die Ampellogik in jedem Branding lesbar
   bleibt. */
const PILL_BASE =
  'inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em]';

const STATUS_PILL: Record<BkkStatus, string> = {
  offen: 'border-primary text-primary',
  vertrag: 'border-status-vertrag text-status-vertrag',
  bezahlt: 'border-status-bezahlt text-status-bezahlt',
  teilbezahlt: 'border-status-teilbezahlt text-status-teilbezahlt',
  ueber_kv: 'border-status-ueber text-status-ueber',
};

const TONE_TEXT: Record<'pos' | 'neg' | 'zero', string> = {
  pos: 'text-status-bezahlt',
  neg: 'text-status-ueber',
  zero: 'text-primary',
};

const AMPEL_TEXT: Record<BkkAmpel, string> = {
  neutral: 'text-primary',
  green: 'text-status-bezahlt',
  amber: 'text-status-teilbezahlt',
  red: 'text-status-ueber',
};

const AMPEL_DOT: Record<BkkAmpel, string> = {
  neutral: 'bg-primary',
  green: 'bg-status-bezahlt',
  amber: 'bg-status-teilbezahlt',
  red: 'bg-status-ueber',
};

/** «+3.0 %» / «−5.0 %» */
function formatPctSigned(pct: number): string {
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)} %`;
}

/** «KV orig. 23.01.2026» – Spaltenkopf/KPI-Titel der betrachteten Baseline */
function baselineLabel(baseline: BkkBaseline | null): string {
  if (!baseline) return texts.bkk.colOrig;
  return `${baseline.bezeichnung} ${formatDate(baseline.datum)}`;
}

/** Inline-Eingabe «KV mutiert» (Alt-Tool-Bedienung: leer = wie Baseline) */
function KvMutInput({
  valueRp,
  placeholderRp,
  onCommit,
}: {
  valueRp: number | null;
  placeholderRp: number | null;
  onCommit: (rp: number | null) => void;
}) {
  const [text, setText] = useState(
    valueRp !== null ? formatRappen(valueRp) : '',
  );
  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholderRp !== null ? formatRappen(placeholderRp) : ''}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => {
        setText((t) => t.replace(/['’\s]/g, ''));
        e.target.select();
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const rp = parseChfToRappen(text);
        setText(rp !== null ? formatRappen(rp) : '');
        if (rp !== valueRp) onCommit(rp);
      }}
      className="w-28 border border-transparent bg-transparent px-1 py-0.5 text-right text-[12.5px] font-semibold text-ink tabular-nums outline-none hover:border-bkk-mut-ink focus:border-bkk-mut-ink focus:bg-white"
    />
  );
}

/**
 * Modul Baukostenkontrolle (P2-M2): vier Spaltbereiche mit der Farblogik des
 * Alt-Tools, Positionen nach Gruppen mit Zwischentotalen, Live-Gesamttotale
 * und KPI-Ampeln aus lib/bkk-calc.ts, aufklappbare Positionsdetails,
 * Erfassen/Bearbeiten über Modals, Speicherstatus/Toasts analog Hub.
 * KV-Referenz = aktive Baseline (0008); alte Baselines sind read-only
 * aufrufbar, die Verwaltung (Anlegen/Umschalten) ist Teil des Moduls.
 * Sehen-Rolle: reine Ansicht ohne Bearbeitungselemente.
 */
export function BkkClient({
  projectId,
  projectName,
  projectNo,
  managementName,
  managementLogoUrl,
  canEdit,
  round5,
  groups,
  baselines,
  viewedBaseline,
  baselineValues,
  isActiveBaselineView,
  initialPositions,
  initialEntries,
}: BkkClientProps) {
  const [positions, setPositions] = useState<BkkPosition[]>(initialPositions);
  const [entries, setEntries] = useState<BkkEntry[]>(initialEntries);
  const [deletedPositionIds, setDeletedPositionIds] = useState<string[]>([]);
  const [deletedEntryIds, setDeletedEntryIds] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [positionModal, setPositionModal] = useState<{
    position?: BkkPosition;
  } | null>(null);
  const [entryModal, setEntryModal] = useState<{
    positionId: string;
    kind: BkkEntryType;
    entry?: BkkEntry;
  } | null>(null);
  const [baselineModal, setBaselineModal] = useState(false);
  const [baselineBusy, setBaselineBusy] = useState(false);
  const [groupModal, setGroupModal] = useState<{ group?: BkkGroup } | null>(
    null,
  );
  const { toasts, showToast } = useToasts();

  // In der Ansicht einer alten Baseline ist ALLES read-only
  const editing = canEdit && isActiveBaselineView;
  const monogram = managementName?.trim().charAt(0).toUpperCase();
  const opts: BkkCalcOptions = useMemo(() => ({ round5 }), [round5]);

  // Warnung bei ungespeicherten Änderungen (wie Hub)
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = texts.hub.leaveWarning;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function entriesOf(positionId: string, kind?: BkkEntryType): BkkEntry[] {
    return entries.filter(
      (e) => e.position_id === positionId && (!kind || e.entry_type === kind),
    );
  }

  /** kv_rp der Position in der betrachteten Baseline; null = nicht enthalten */
  function baselineValueOf(position: BkkPosition): number | null {
    return baselineValues[position.id] ?? null;
  }

  function toCalcRow(position: BkkPosition): BkkPositionWithEntries {
    return {
      position: {
        bkp: position.bkp,
        kvBaselineRp: baselineValueOf(position),
        kvMutRp: position.kv_mut_rp,
        hidden: position.hidden,
      },
      entries: entriesOf(position.id).map((e) => ({
        entryType: e.entry_type,
        betragRp: e.betrag_rp,
      })),
    };
  }

  /** Positionen einer Gruppe, natürlich nach BKP sortiert (211.4 vor 212) */
  function positionsOf(groupId: string): BkkPosition[] {
    return positions
      .filter((p) => p.group_id === groupId)
      .sort((a, b) =>
        a.bkp.localeCompare(b.bkp, 'de-CH', { numeric: true, sensitivity: 'base' }),
      );
  }

  const grandTotals = useMemo(
    () => totals(positions.map(toCalcRow), opts),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toCalcRow hängt nur von positions/entries ab
    [positions, entries, opts],
  );

  // -------------------------------------------------------------------------
  // Mutationen (nur editing)

  function markDirty() {
    setDirty(true);
  }

  function updatePosition(id: string, patch: Partial<BkkPosition>) {
    setPositions((current) =>
      current.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
    markDirty();
  }

  function applyPositionModal(result: PositionModalResult) {
    if (!positionModal) return;
    if (positionModal.position) {
      updatePosition(positionModal.position.id, result);
      showToast(texts.hub.updatedToast);
    } else {
      setPositions((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          project_id: projectId,
          is_custom: true,
          sort: current.length,
          ...result,
        },
      ]);
      markDirty();
      showToast(texts.hub.addedToast);
    }
    setPositionModal(null);
  }

  function removePosition(position: BkkPosition) {
    if (!window.confirm(texts.bkk.confirmDeletePosition)) return;
    setPositions((current) => current.filter((p) => p.id !== position.id));
    setEntries((current) =>
      current.filter((e) => e.position_id !== position.id),
    );
    // Zugehörige Einträge/Baseline-Werte löscht die DB per Cascade
    setDeletedPositionIds((current) => [...current, position.id]);
    markDirty();
    showToast(texts.hub.deletedToast);
  }

  function applyEntryModal(result: EntryModalResult) {
    if (!entryModal) return;
    if (entryModal.entry) {
      setEntries((current) =>
        current.map((e) =>
          e.id === entryModal.entry!.id ? { ...e, ...result } : e,
        ),
      );
      showToast(texts.hub.updatedToast);
    } else {
      setEntries((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          project_id: projectId,
          position_id: entryModal.positionId,
          entry_type: entryModal.kind,
          source_id: null,
          ...result,
        },
      ]);
      showToast(texts.hub.addedToast);
    }
    markDirty();
    setEntryModal(null);
  }

  function removeEntry(entry: BkkEntry) {
    if (!window.confirm(texts.bkk.confirmDeleteEntry)) return;
    setEntries((current) => current.filter((e) => e.id !== entry.id));
    setDeletedEntryIds((current) => [...current, entry.id]);
    markDirty();
    showToast(texts.hub.deletedToast);
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();

    // Sortierung je Gruppe aus der angezeigten (natürlichen) Reihenfolge
    const positionRows = groups.flatMap((group) =>
      positionsOf(group.id).map((p, index) => ({ ...p, sort: index })),
    );
    const entryRows = entries.map((e) => ({ ...e }));

    let failed = false;
    if (positionRows.length > 0) {
      const { error } = await supabase.from('bkk_positions').upsert(positionRows);
      if (error) failed = true;
    }
    if (!failed && entryRows.length > 0) {
      const { error } = await supabase.from('bkk_entries').upsert(entryRows);
      if (error) failed = true;
    }
    if (!failed && deletedEntryIds.length > 0) {
      const { error } = await supabase
        .from('bkk_entries')
        .delete()
        .in('id', deletedEntryIds);
      if (error) failed = true;
    }
    if (!failed && deletedPositionIds.length > 0) {
      const { error } = await supabase
        .from('bkk_positions')
        .delete()
        .in('id', deletedPositionIds);
      if (error) failed = true;
    }

    setSaving(false);
    if (failed) {
      showToast(texts.hub.saveErrorToast, 'error');
    } else {
      setDeletedEntryIds([]);
      setDeletedPositionIds([]);
      setDirty(false);
      showToast(texts.hub.savedToast);
    }
  }

  // -------------------------------------------------------------------------
  // Baseline-Verwaltung (nur editing; arbeitet auf dem gespeicherten Stand)

  async function createBaseline(result: BaselineModalResult) {
    setBaselineModal(false);
    setBaselineBusy(true);
    const supabase = createClient();

    const { data: created, error } = await supabase
      .from('bkk_baselines')
      .insert({
        project_id: projectId,
        bezeichnung: result.bezeichnung,
        datum: result.datum,
        is_active: false,
      })
      .select('id')
      .single<{ id: string }>();

    let failed = Boolean(error) || !created;
    if (!failed && created) {
      // Werte-Snapshot: aus der bisherigen Baseline (Positionen ohne Wert
      // bleiben ohne Wert) oder aus KV mutiert (alle Positionen erhalten
      // einen Wert – der revidierte KV wird neue Referenz)
      const valueRows =
        result.source === 'active'
          ? positions
              .filter((p) => baselineValueOf(p) !== null)
              .map((p) => ({
                baseline_id: created.id,
                position_id: p.id,
                kv_rp: baselineValueOf(p)!,
              }))
          : positions.map((p) => ({
              baseline_id: created.id,
              position_id: p.id,
              kv_rp: p.kv_mut_rp ?? baselineValueOf(p) ?? 0,
            }));
      if (valueRows.length > 0) {
        const { error: valueError } = await supabase
          .from('bkk_position_baseline_values')
          .insert(valueRows);
        failed = Boolean(valueError);
      }
    }

    setBaselineBusy(false);
    if (failed) {
      showToast(texts.bkk.baselines.errorToast, 'error');
    } else {
      showToast(texts.bkk.baselines.createdToast);
      // Neu laden, damit Liste und Werte dem gespeicherten Stand entsprechen
      window.location.reload();
    }
  }

  async function activateBaseline(baseline: BkkBaseline) {
    if (!window.confirm(texts.bkk.baselines.confirmActivate)) return;
    setBaselineBusy(true);
    const supabase = createClient();

    // Partial-Unique-Index verlangt: zuerst deaktivieren, dann aktivieren
    const { error: deactivateError } = await supabase
      .from('bkk_baselines')
      .update({ is_active: false })
      .eq('project_id', projectId)
      .eq('is_active', true);
    let failed = Boolean(deactivateError);
    if (!failed) {
      const { error: activateError } = await supabase
        .from('bkk_baselines')
        .update({ is_active: true })
        .eq('id', baseline.id);
      failed = Boolean(activateError);
    }

    setBaselineBusy(false);
    if (failed) {
      showToast(texts.bkk.baselines.errorToast, 'error');
    } else {
      showToast(texts.bkk.baselines.activatedToast);
      window.location.assign('/module/baukostenkontrolle');
    }
  }

  // -------------------------------------------------------------------------
  // Gruppenpflege (nur editing; direkte DB-Aktionen wie Baselines)

  async function applyGroupModal(result: GroupModalResult) {
    const editingGroup = groupModal?.group;
    setGroupModal(null);
    setBaselineBusy(true);
    const supabase = createClient();

    const { error } = editingGroup
      ? await supabase
          .from('bkk_groups')
          .update({ name: result.name })
          .eq('id', editingGroup.id)
      : await supabase.from('bkk_groups').insert({
          project_id: projectId,
          digit: result.digit,
          name: result.name,
          sort: groups.length,
        });

    setBaselineBusy(false);
    if (error) {
      showToast(texts.bkk.groups.errorToast, 'error');
    } else {
      showToast(
        editingGroup
          ? texts.bkk.groups.updatedToast
          : texts.bkk.groups.createdToast,
      );
      window.location.reload();
    }
  }

  async function removeGroup(group: BkkGroup) {
    if (positions.some((p) => p.group_id === group.id)) return;
    if (!window.confirm(texts.bkk.groups.confirmDelete)) return;
    setBaselineBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('bkk_groups')
      .delete()
      .eq('id', group.id);
    setBaselineBusy(false);
    if (error) {
      showToast(texts.bkk.groups.errorToast, 'error');
    } else {
      showToast(texts.bkk.groups.deletedToast);
      window.location.reload();
    }
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // -------------------------------------------------------------------------
  // Rendering

  function entryList(position: BkkPosition, kind: BkkEntryType) {
    const list = entriesOf(position.id, kind);
    const headClass =
      kind === 'vertrag' ? 'text-bkk-vert-ink' : 'text-bkk-zahl-ink';
    return (
      <div>
        <h4
          className={`display-title mb-2 text-[11px] font-medium tracking-[0.18em] ${headClass}`}
        >
          {kind === 'vertrag' ? texts.bkk.detailVertraege : texts.bkk.detailZahlungen}
        </h4>
        {list.length === 0 && (
          <p className="text-xs text-primary">{texts.bkk.emptyEntries}</p>
        )}
        <ul>
          {list.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-3 border-b border-line py-1.5 text-xs"
            >
              <span className="w-[74px] shrink-0 text-primary tabular-nums">
                {entry.datum ? formatDate(entry.datum) : '–'}
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold text-ink">
                  {entry.unternehmer ?? '–'}
                </span>
                {entry.notiz && (
                  <span className="text-primary-dark"> · {entry.notiz}</span>
                )}
              </span>
              <span
                className={`shrink-0 text-ink tabular-nums ${kind === 'vertrag' ? 'font-semibold' : ''}`}
              >
                {formatRappen(displayRp(entry.betrag_rp, opts))}
              </span>
              {editing && (
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    title={texts.common.edit}
                    onClick={() =>
                      setEntryModal({ positionId: position.id, kind, entry })
                    }
                    className="border border-line bg-white px-1.5 py-0.5 text-[11px] text-primary-dark hover:border-primary"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    title={texts.common.delete}
                    onClick={() => removeEntry(entry)}
                    className="border border-line bg-white px-1.5 py-0.5 text-[11px] text-primary-dark hover:border-error hover:text-error"
                  >
                    ✕
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
        {editing && (
          <button
            type="button"
            onClick={() => setEntryModal({ positionId: position.id, kind })}
            className="mt-2 w-full border border-dashed border-line px-3 py-1 text-xs text-primary hover:border-primary hover:text-primary-dark"
          >
            {kind === 'vertrag' ? texts.bkk.addVertrag : texts.bkk.addZahlung}
          </button>
        )}
      </div>
    );
  }

  function positionRow(position: BkkPosition) {
    const calcRow = toCalcRow(position);
    const inBaseline = calcRow.position.kvBaselineRp !== null;
    const base = baselineRp(calcRow.position, opts);
    const kvm = effectiveKvMutRp(calcRow.position, opts);
    const sums = entrySums(calcRow.entries, opts);
    const status = positionStatus(calcRow.position, calcRow.entries, opts);
    const dPct = position.kv_mut_rp !== null ? deltaPct(kvm, base) : null;
    const isOpen = expanded.has(position.id);

    return (
      <Fragment key={position.id}>
        {/* Zeile klickbar (Details); interaktive Elemente stoppen den Klick */}
        <tr
          onClick={() => toggleExpanded(position.id)}
          className={`cursor-pointer ${position.hidden ? 'opacity-50' : ''}`}
        >
          <td className="sticky left-0 z-10 min-w-44 border-r border-b border-line bg-white px-3 py-2 sm:min-w-56 sm:px-4 sm:py-2.5">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ink">
                  <span className="font-bold tabular-nums">{position.bkp}</span>{' '}
                  <span className="font-medium">{position.name}</span>
                  {position.is_custom && (
                    <span className="ml-1 text-[10px] text-accent-dark">
                      {texts.bkk.customBadge}
                    </span>
                  )}
                  {position.hidden && (
                    <span className="ml-1 text-[10px] text-primary">
                      {texts.bkk.hiddenBadge}
                    </span>
                  )}
                </span>
                {position.notiz && (
                  <span className="mt-0.5 block truncate text-[11px] text-primary">
                    {position.notiz}
                  </span>
                )}
              </span>
              {editing && (
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    title={texts.common.edit}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPositionModal({ position });
                    }}
                    className="border border-line bg-white px-1.5 py-0.5 text-[11px] text-primary-dark hover:border-primary"
                  >
                    ✎
                  </button>
                  {position.is_custom && (
                    <button
                      type="button"
                      title={texts.common.delete}
                      onClick={(e) => {
                        e.stopPropagation();
                        removePosition(position);
                      }}
                      className="border border-line bg-white px-1.5 py-0.5 text-[11px] text-primary-dark hover:border-error hover:text-error"
                    >
                      ✕
                    </button>
                  )}
                </span>
              )}
            </div>
          </td>
          <td className="border-b border-l border-line border-l-bkk-orig-bord bg-bkk-orig-tint px-3.5 py-2.5 text-right text-[12.5px] text-primary-dark tabular-nums">
            {inBaseline ? (
              formatRappen(base)
            ) : (
              <span>
                –
                <span className="block text-[10px] leading-tight text-bkk-orig-ink">
                  {texts.bkk.notInBaseline}
                </span>
              </span>
            )}
          </td>
          <td className="border-b border-l border-line border-l-bkk-mut-bord bg-bkk-mut-tint px-3.5 py-2.5 text-right">
            {editing ? (
              <KvMutInput
                key={`${position.id}:${position.kv_mut_rp ?? ''}`}
                valueRp={position.kv_mut_rp}
                placeholderRp={baselineValueOf(position)}
                onCommit={(rp) => updatePosition(position.id, { kv_mut_rp: rp })}
              />
            ) : (
              <span className="text-[12.5px] font-semibold text-ink tabular-nums">
                {formatRappen(kvm)}
              </span>
            )}
            {dPct !== null && (
              <span
                className={`block text-[10px] font-semibold tabular-nums ${TONE_TEXT[deltaTone(dPct)]}`}
              >
                {formatPctSigned(dPct)}
              </span>
            )}
          </td>
          <td className="border-b border-l border-line border-l-bkk-vert-bord bg-bkk-vert-tint px-3.5 py-2.5 text-right text-[12.5px] text-ink tabular-nums">
            {sums.vertragRp !== 0 ? formatRappen(sums.vertragRp) : '–'}
          </td>
          <td className="border-r border-b border-l border-line border-r-bkk-zahl-bord border-l-bkk-zahl-bord bg-bkk-zahl-tint px-3.5 py-2.5 text-right text-[12.5px] text-primary-dark tabular-nums">
            {sums.zahlungRp !== 0 ? formatRappen(sums.zahlungRp) : '–'}
          </td>
          <td className="border-b border-line bg-white px-3 py-2.5 align-top">
            <span className={`${PILL_BASE} ${STATUS_PILL[status]}`}>
              {texts.bkk.status[status]}
            </span>
          </td>
          <td className="border-b border-line bg-white px-2 py-2.5 text-center text-[11px] text-primary">
            {isOpen ? '▴' : '▾'}
          </td>
        </tr>
        {isOpen && (
          <tr>
            <td
              colSpan={COLS}
              className="border-b border-line bg-bg px-4 py-3.5 sm:px-8"
            >
              <div className="grid gap-5 sm:grid-cols-2 sm:gap-8">
                {entryList(position, 'vertrag')}
                {entryList(position, 'zahlung')}
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  }

  function subtotalRow(group: BkkGroup) {
    // Zwischentotal mit identischer Zählregel wie das Gesamttotal
    // (Fachblick-Korrektur): Baseline-Spalte inkl. ausgeblendeter
    // Positionen, übrige Spalten nur sichtbare. Δ% nur, wenn die Gruppe
    // mindestens eine sichtbare Position hat.
    const calcRows = positionsOf(group.id).map(toCalcRow);
    const sub = groupSubtotals(calcRows, opts);
    const dPct = groupDeltaPct(calcRows, opts);
    return (
      <tr key={`${group.id}-subtotal`}>
        <td className="sticky left-0 z-10 border-r border-b border-line bg-white px-3 py-2 text-xs font-semibold text-primary-dark sm:px-4">
          {texts.bkk.groupTotal} {group.digit} {group.name}
        </td>
        <td className="border-b border-l border-line border-l-bkk-orig-bord bg-bkk-orig-head px-3.5 py-2 text-right text-[12.5px] font-semibold text-ink tabular-nums">
          {formatRappen(sub.kvBaselineRp)}
        </td>
        <td className="border-b border-l border-line border-l-bkk-mut-bord bg-bkk-mut-head px-3.5 py-2 text-right">
          <span className="text-[12.5px] font-semibold text-ink tabular-nums">
            {formatRappen(sub.kvMutRp)}
          </span>
          {dPct !== null && (
            <span
              className={`block text-[10px] font-semibold tabular-nums ${TONE_TEXT[deltaTone(dPct)]}`}
            >
              {formatPctSigned(dPct)}
            </span>
          )}
        </td>
        <td className="border-b border-l border-line border-l-bkk-vert-bord bg-bkk-vert-head px-3.5 py-2 text-right text-[12.5px] font-semibold text-ink tabular-nums">
          {formatRappen(sub.vertragRp)}
        </td>
        <td className="border-r border-b border-l border-line border-r-bkk-zahl-bord border-l-bkk-zahl-bord bg-bkk-zahl-head px-3.5 py-2 text-right text-[12.5px] font-semibold text-ink tabular-nums">
          {formatRappen(sub.zahlungRp)}
        </td>
        <td className="border-b border-line bg-white" />
        <td className="border-b border-line bg-white" />
      </tr>
    );
  }

  const kpiMut = kvMutKpi(grandTotals);
  const vPct =
    grandTotals.kvMutRp > 0
      ? (grandTotals.vertragRp / grandTotals.kvMutRp) * 100
      : 0;
  const zPct =
    grandTotals.vertragRp > 0
      ? (grandTotals.zahlungRp / grandTotals.vertragRp) * 100
      : 0;

  const takenBkps = positions
    .filter((p) => p.id !== positionModal?.position?.id)
    .map((p) => p.bkp);

  const sortedBaselines = [...baselines].sort((a, b) =>
    a.datum.localeCompare(b.datum),
  );

  return (
    <div className="flex min-h-screen flex-col">
      {/* Sticky Toolbar (Design-Referenz, analog Hub) mit «← Dokumente» */}
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
              monogram && (
                <span className="display-title flex h-7 w-7 shrink-0 items-center justify-center border border-ink text-sm font-semibold text-ink">
                  {monogram}
                </span>
              )
            )}
            <span className="display-title hidden truncate text-[15px] font-medium tracking-[0.14em] text-ink lg:block">
              {managementName}
            </span>
            <span className="hidden h-5 w-px shrink-0 bg-line sm:block" />
            <Link
              href="/hub"
              className="shrink-0 text-xs text-primary transition-colors hover:text-ink"
            >
              ← {texts.hub.title}
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 sm:gap-5">
            {editing && (
              <>
                <span
                  className={`text-[11px] font-semibold sm:text-xs ${dirty ? 'text-warn' : 'text-accent'}`}
                >
                  {dirty ? texts.common.unsaved : texts.common.saved}
                </span>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  className="display-title bg-accent px-3.5 py-2 text-[11px] font-medium tracking-[0.12em] text-white transition-opacity hover:opacity-90 disabled:opacity-50 sm:px-5 sm:text-[13px] sm:tracking-[0.14em]"
                >
                  {texts.common.save}
                </button>
              </>
            )}
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Modul-Kopfzeile: MODUL-Badge + Titel, Projektzeile darunter */}
      <div className="border-b border-line">
        <div className="mx-auto w-full max-w-7xl px-5 py-5 sm:px-14 sm:py-7">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <span className="display-title bg-ink px-2 py-1 text-[9px] font-medium tracking-[0.22em] text-white sm:px-2.5 sm:text-[10px] sm:tracking-[0.24em]">
              {texts.modules.badge}
            </span>
            <h1 className="display-title text-lg leading-tight font-medium tracking-[0.05em] text-ink sm:text-[26px] sm:tracking-[0.06em]">
              {texts.modules.baukostenkontrolle.label}
            </h1>
          </div>
          <p className="display-title mt-1.5 truncate text-[10px] tracking-[0.2em] text-primary sm:text-xs sm:tracking-[0.26em]">
            {projectName}
            {projectNo && ` · ${texts.landing.projectNoPrefix} ${projectNo}`}
          </p>
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-6 sm:px-14 sm:py-8">
        {/* Banner: Read-only-Ansicht einer nicht aktiven Baseline */}
        {!isActiveBaselineView && viewedBaseline && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border border-warn bg-white px-4 py-2">
            <p className="text-sm text-warn">
              {texts.bkk.baselines.viewingBanner}{' '}
              «{baselineLabel(viewedBaseline)}» –{' '}
              {texts.bkk.baselines.viewingReadOnly}
            </p>
            <Link
              href="/module/baukostenkontrolle"
              className="border border-line bg-white px-3 py-1 text-xs text-primary-dark hover:border-primary"
            >
              {texts.bkk.baselines.backToActive}
            </Link>
          </div>
        )}

        {/* KPI-Karten: Familienränder mit Akzent-Oberkante (Design-Referenz),
            KV-mutiert-Ampel als Punkt in der Subline; mobil horizontal
            scrollbar */}
        <section className="-mx-5 flex gap-2.5 overflow-x-auto px-5 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0 lg:grid-cols-5">
          <div className="w-40 shrink-0 border border-bkk-orig-bord border-t-[3px] border-t-bkk-orig-ink bg-white p-3.5 sm:w-auto sm:p-4">
            <p className="display-title text-[10px] font-medium tracking-[0.16em] text-primary-dark sm:text-[11px] sm:tracking-[0.18em]">
              {viewedBaseline?.bezeichnung ?? texts.bkk.colOrig}
            </p>
            <p className="mt-1.5 text-sm font-semibold text-ink tabular-nums sm:mt-2 sm:text-[19px]">
              {formatRappen(grandTotals.kvBaselineRp)}
            </p>
            {viewedBaseline && (
              <p className="mt-1 truncate text-[9px] text-primary sm:mt-1.5 sm:text-[10px]">
                {texts.bkk.baselinePrefix} «{viewedBaseline.bezeichnung}» ·{' '}
                {formatDate(viewedBaseline.datum)}
              </p>
            )}
          </div>
          <div className="w-40 shrink-0 border border-bkk-mut-bord border-t-[3px] border-t-bkk-mut-ink bg-white p-3.5 sm:w-auto sm:p-4">
            <p className="display-title text-[10px] font-medium tracking-[0.16em] text-primary-dark sm:text-[11px] sm:tracking-[0.18em]">
              {texts.bkk.kpiMut}
            </p>
            <p className="mt-1.5 text-sm font-semibold text-ink tabular-nums sm:mt-2 sm:text-[19px]">
              {formatRappen(grandTotals.kvMutRp)}
            </p>
            <p
              className={`mt-1 flex items-center gap-1.5 text-[9px] font-semibold sm:mt-1.5 sm:text-[10px] ${AMPEL_TEXT[kpiMut.ampel]}`}
            >
              {kpiMut.ampel !== 'neutral' && (
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${AMPEL_DOT[kpiMut.ampel]}`}
                />
              )}
              <span className="truncate">
                {kpiMut.ampel === 'neutral'
                  ? texts.bkk.deltaNeutral
                  : `Δ ${formatPctSigned(kpiMut.deltaPct)} ${texts.bkk.deltaVsOrig}${kpiMut.einsparung ? ` · ${texts.bkk.einsparung}` : ''}`}
              </span>
            </p>
          </div>
          <div className="w-40 shrink-0 border border-bkk-vert-bord border-t-[3px] border-t-bkk-vert-ink bg-white p-3.5 sm:w-auto sm:p-4">
            <p className="display-title text-[10px] font-medium tracking-[0.16em] text-primary-dark sm:text-[11px] sm:tracking-[0.18em]">
              {texts.bkk.kpiVertrag}
            </p>
            <p className="mt-1.5 text-sm font-semibold text-ink tabular-nums sm:mt-2 sm:text-[19px]">
              {formatRappen(grandTotals.vertragRp)}
            </p>
            <p className="mt-1 truncate text-[9px] text-primary sm:mt-1.5 sm:text-[10px]">
              {grandTotals.vertragRp > 0
                ? `${vPct.toFixed(1)} ${texts.bkk.vertragPctSuffix}`
                : texts.bkk.noVertraege}
            </p>
          </div>
          <div className="w-40 shrink-0 border border-bkk-zahl-bord border-t-[3px] border-t-bkk-zahl-ink bg-white p-3.5 sm:w-auto sm:p-4">
            <p className="display-title text-[10px] font-medium tracking-[0.16em] text-primary-dark sm:text-[11px] sm:tracking-[0.18em]">
              {texts.bkk.kpiZahlung}
            </p>
            <p className="mt-1.5 text-sm font-semibold text-ink tabular-nums sm:mt-2 sm:text-[19px]">
              {formatRappen(grandTotals.zahlungRp)}
            </p>
            <p className="mt-1 truncate text-[9px] text-primary sm:mt-1.5 sm:text-[10px]">
              {grandTotals.vertragRp > 0
                ? `${zPct.toFixed(1)} ${texts.bkk.zahlungPctSuffix}`
                : texts.bkk.noVertraegeYet}
            </p>
          </div>
          <div className="w-40 shrink-0 border border-line border-t-[3px] border-t-primary-dark bg-white p-3.5 sm:w-auto sm:p-4">
            <p className="display-title text-[10px] font-medium tracking-[0.16em] text-primary-dark sm:text-[11px] sm:tracking-[0.18em]">
              {texts.bkk.kpiOffen}
            </p>
            <p className="mt-1.5 text-sm font-semibold text-ink tabular-nums sm:mt-2 sm:text-[19px]">
              {formatRappen(offenRp(grandTotals))}
            </p>
            <p className="mt-1 truncate text-[9px] text-primary sm:mt-1.5 sm:text-[10px]">
              {texts.bkk.offenSubline}
            </p>
          </div>
        </section>

        {/* Tabelle: horizontal scrollbar, Positionsspalte fixiert */}
        <section className="mt-6 border border-line bg-white">
          {positions.length === 0 ? (
            <p className="px-4 py-6 text-sm text-primary">
              {texts.bkk.emptyModule}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] border-collapse text-sm">
                <thead>
                  <tr className="display-title text-[10px] font-medium sm:text-xs">
                    <th className="sticky left-0 z-10 min-w-44 border-r border-b border-line bg-white px-3 py-3 text-left tracking-[0.14em] text-primary-dark sm:min-w-56 sm:px-4 sm:tracking-[0.16em]">
                      {texts.bkk.colPosition}
                    </th>
                    <th className="border-b border-l border-line border-l-bkk-orig-bord bg-bkk-orig-head px-3.5 py-3 text-right tracking-[0.12em] text-primary-dark sm:tracking-[0.14em]">
                      {viewedBaseline?.bezeichnung ?? texts.bkk.colOrig}
                    </th>
                    <th className="border-b border-l border-line border-l-bkk-mut-bord bg-bkk-mut-head px-3.5 py-3 text-right tracking-[0.12em] text-primary-dark sm:tracking-[0.14em]">
                      {texts.bkk.colMut}
                    </th>
                    <th className="border-b border-l border-line border-l-bkk-vert-bord bg-bkk-vert-head px-3.5 py-3 text-right tracking-[0.12em] text-primary-dark sm:tracking-[0.14em]">
                      {texts.bkk.colVertrag}
                    </th>
                    <th className="border-r border-b border-l border-line border-r-bkk-zahl-bord border-l-bkk-zahl-bord bg-bkk-zahl-head px-3.5 py-3 text-right tracking-[0.12em] text-primary-dark sm:tracking-[0.14em]">
                      {texts.bkk.colZahlung}
                    </th>
                    <th className="border-b border-line bg-white px-3 py-3 text-left tracking-[0.12em] text-primary-dark sm:tracking-[0.14em]">
                      {texts.bkk.colStatus}
                    </th>
                    <th className="w-9 border-b border-line bg-white" />
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => {
                    // Gruppen mit Positionen immer rendern (auch wenn für die
                    // Sehen-Rolle alle ausgeblendet sind) – das Zwischentotal
                    // der Baseline-Spalte zählt sie, die Summenprobe muss in
                    // jeder Rolle aufgehen.
                    if (positionsOf(group.id).length === 0) return null;
                    const groupPositions = positionsOf(group.id).filter(
                      (p) => editing || !p.hidden,
                    );
                    return (
                      <Fragment key={group.id}>
                        <tr>
                          <td className="display-title sticky left-0 z-10 border-r border-b border-line bg-bg px-3 pt-3 pb-2 text-[11px] font-medium tracking-[0.14em] text-primary sm:px-4 sm:text-[13px] sm:tracking-[0.16em]">
                            {group.digit} · {group.name}
                          </td>
                          <td
                            colSpan={COLS - 1}
                            className="border-b border-line bg-bg"
                          />
                        </tr>
                        {groupPositions.map((position) => positionRow(position))}
                        {subtotalRow(group)}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-t-ink">
                    <td className="display-title sticky left-0 z-10 border-r border-line bg-white px-3 py-3 text-xs font-semibold tracking-[0.14em] text-ink sm:px-4 sm:text-sm sm:tracking-[0.16em]">
                      {texts.bkk.grandTotal}
                    </td>
                    <td className="border-l border-l-bkk-orig-bord bg-bkk-orig-head px-3.5 py-3 text-right text-[13px] font-bold text-ink tabular-nums">
                      {formatRappen(grandTotals.kvBaselineRp)}
                    </td>
                    <td className="border-l border-l-bkk-mut-bord bg-bkk-mut-head px-3.5 py-3 text-right">
                      <span className="text-[13px] font-bold text-ink tabular-nums">
                        {formatRappen(grandTotals.kvMutRp)}
                      </span>
                      {grandTotals.kvBaselineRp > 0 && (
                        <span
                          className={`block text-[10px] font-bold tabular-nums ${AMPEL_TEXT[kpiMut.ampel]}`}
                        >
                          {formatPctSigned(kpiMut.deltaPct)}
                        </span>
                      )}
                    </td>
                    <td className="border-l border-l-bkk-vert-bord bg-bkk-vert-head px-3.5 py-3 text-right text-[13px] font-bold text-ink tabular-nums">
                      {formatRappen(grandTotals.vertragRp)}
                    </td>
                    <td className="border-r border-l border-r-bkk-zahl-bord border-l-bkk-zahl-bord bg-bkk-zahl-head px-3.5 py-3 text-right text-[13px] font-bold text-ink tabular-nums">
                      {formatRappen(grandTotals.zahlungRp)}
                    </td>
                    <td className="bg-white" />
                    <td className="bg-white" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        {/* Status-Legende (fixe Pillenfarben) */}
        <div className="mt-4 flex flex-wrap items-center gap-3 sm:gap-4">
          <span className="display-title text-[11px] font-medium tracking-[0.16em] text-primary-dark">
            {texts.bkk.colStatus}
          </span>
          {(['offen', 'vertrag', 'teilbezahlt', 'bezahlt', 'ueber_kv'] as const).map(
            (status) => (
              <span key={status} className={`${PILL_BASE} ${STATUS_PILL[status]}`}>
                {texts.bkk.status[status]}
              </span>
            ),
          )}
        </div>

        {editing && (
          <button
            type="button"
            onClick={() => setPositionModal({})}
            className="mt-5 inline-flex items-center gap-2.5 border border-dashed border-line px-5 py-3 text-primary transition-colors hover:border-primary hover:text-primary-dark"
          >
            <span className="text-base font-light">+</span>
            <span className="display-title text-[11px] font-medium tracking-[0.14em] sm:text-xs sm:tracking-[0.16em]">
              {texts.bkk.addPosition.replace(/^\+\s*/, '')}
            </span>
          </button>
        )}

        {/* Gruppenpflege (nur Bearbeiten-Rolle): anlegen, umbenennen,
            löschen nur ohne zugeordnete Positionen. */}
        {canEdit && isActiveBaselineView && (
          <section className="mt-8 border border-line bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <h2 className="display-title text-xs text-ink">
                {texts.bkk.groups.title}
              </h2>
              <button
                type="button"
                onClick={() => setGroupModal({})}
                disabled={baselineBusy}
                className="border border-dashed border-line px-3 py-1 text-xs text-primary hover:border-accent hover:text-accent disabled:opacity-50"
              >
                {texts.bkk.groups.add}
              </button>
            </div>
            <ul>
              {groups.map((group) => {
                const count = positions.filter(
                  (p) => p.group_id === group.id,
                ).length;
                return (
                  <li
                    key={group.id}
                    className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 text-sm text-ink">
                      <span className="font-medium">{group.digit}</span> —{' '}
                      {group.name}{' '}
                      <span className="text-xs text-primary">
                        ({count} {texts.bkk.groups.positionsCount})
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        title={texts.common.edit}
                        onClick={() => setGroupModal({ group })}
                        disabled={baselineBusy}
                        className="border border-line bg-white px-2 py-0.5 text-[11px] text-primary-dark hover:border-primary disabled:opacity-50"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        title={
                          count > 0
                            ? texts.bkk.groups.deleteBlocked
                            : texts.common.delete
                        }
                        onClick={() => removeGroup(group)}
                        disabled={count > 0 || baselineBusy}
                        className="border border-line bg-white px-2 py-0.5 text-[11px] text-primary-dark hover:border-error hover:text-error disabled:opacity-40"
                      >
                        ✕
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Baseline-Verwaltung (nur Bearbeiten-Rolle, nur in der aktiven
            Ansicht). Baseline-Vergleich (zwei nebeneinander) ist Ausbaupunkt. */}
        {canEdit && isActiveBaselineView && (
          <section className="mt-8 border border-line bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <h2 className="display-title text-xs text-ink">
                {texts.bkk.baselines.title}
              </h2>
              <button
                type="button"
                onClick={() => setBaselineModal(true)}
                disabled={dirty || baselineBusy}
                title={dirty ? texts.bkk.baselines.saveFirst : undefined}
                className="border border-dashed border-line px-3 py-1 text-xs text-primary hover:border-accent hover:text-accent disabled:opacity-50"
              >
                {texts.bkk.baselines.add}
              </button>
            </div>
            <p className="border-b border-line px-4 py-2 text-xs text-primary">
              {texts.bkk.baselines.intro}
            </p>
            {sortedBaselines.length === 0 ? (
              <p className="px-4 py-3 text-sm text-primary">
                {texts.bkk.baselines.empty}
              </p>
            ) : (
              <ul>
                {sortedBaselines.map((baseline) => (
                  <li
                    key={baseline.id}
                    className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 text-sm text-ink">
                      <span className="font-medium">{baseline.bezeichnung}</span>{' '}
                      <span className="text-xs text-primary">
                        {formatDate(baseline.datum)}
                      </span>
                    </span>
                    {baseline.is_active ? (
                      <span className="border border-bkk-mut-bord px-2 py-0.5 text-[11px] text-bkk-mut-ink">
                        {texts.bkk.baselines.activeBadge}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Link
                          href={`/module/baukostenkontrolle?baseline=${baseline.id}`}
                          className="border border-line bg-white px-2 py-0.5 text-[11px] text-primary-dark hover:border-primary"
                        >
                          {texts.bkk.baselines.view}
                        </Link>
                        <button
                          type="button"
                          onClick={() => activateBaseline(baseline)}
                          disabled={dirty || baselineBusy}
                          title={dirty ? texts.bkk.baselines.saveFirst : undefined}
                          className="border border-line bg-white px-2 py-0.5 text-[11px] text-primary-dark hover:border-warn hover:text-warn disabled:opacity-50"
                        >
                          {texts.bkk.baselines.setActive}
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>

      {/* Footer mit Projekt-Nr. und ©-Zeile (Design-Referenz) */}
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

      {positionModal && (
        <PositionModal
          groups={groups}
          initial={positionModal.position}
          takenBkps={takenBkps}
          onApply={applyPositionModal}
          onClose={() => setPositionModal(null)}
        />
      )}
      {entryModal && (
        <EntryModal
          kind={entryModal.kind}
          initial={entryModal.entry ?? undefined}
          onApply={applyEntryModal}
          onClose={() => setEntryModal(null)}
        />
      )}
      {baselineModal && (
        <BaselineModal
          onApply={createBaseline}
          onClose={() => setBaselineModal(false)}
        />
      )}
      {groupModal && (
        <GroupModal
          initial={groupModal.group}
          takenDigits={groups.map((g) => g.digit)}
          onApply={applyGroupModal}
          onClose={() => setGroupModal(null)}
        />
      )}
      <ToastContainer toasts={toasts} />
    </div>
  );
}

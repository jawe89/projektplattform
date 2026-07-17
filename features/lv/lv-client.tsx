'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { ToastContainer, useToasts } from '@/components/ui/toast';
import { LogoutButton } from '@/features/auth/logout-button';
import { CellModal } from '@/features/lv/cell-modal';
import {
  UnitModal,
  type UnitModalResult,
  type WerkvertragOption,
} from '@/features/lv/unit-modal';
import { formatDateShort } from '@/lib/format';
import {
  LV_DONE_MARKER,
  LV_STEP_KEYS,
  type LvStepKey,
  type LvStepValue,
  type LvUnitStepMap,
  isFilled,
  isNaValue,
  lastFilledStep,
  unitKpis,
  unitStatus,
} from '@/lib/lv-logic';
import { createClient } from '@/lib/supabase/client';
import { texts } from '@/lib/texts';
import type { LvUnit, LvUnitStep } from '@/lib/types';

export interface WerkvertragDoc extends WerkvertragOption {
  /** Öffnen-Link (Signed-URL-Handler oder externe URL) */
  href: string;
}

interface LvClientProps {
  projectId: string;
  projectName: string;
  /** Projekt-Nr. für Kopfzeile und Footer (Design-Referenz) */
  projectNo: string | null;
  managementName: string | null;
  managementLogoUrl: string | null;
  /** Bearbeitung (Rollen-Freigabe «Bearbeiten» oder Projekt-Admin) */
  canEdit: boolean;
  initialUnits: LvUnit[];
  initialSteps: LvUnitStep[];
  /** Hub-Dokumente der Kategorie Werkverträge */
  werkvertragDocs: WerkvertragDoc[];
}

/* Status-Pillen mit den fixen Statusfarben der Design-Referenz */
const PILL_BASE =
  'inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.04em]';

function stepsToMap(rows: LvUnitStep[]): Record<string, LvUnitStepMap> {
  const map: Record<string, LvUnitStepMap> = {};
  for (const row of rows) {
    const unitSteps = map[row.unit_id] ?? {};
    unitSteps[row.step_key as LvStepKey] = {
      datum: row.datum,
      freitext: row.freitext,
    };
    map[row.unit_id] = unitSteps;
  }
  return map;
}

/**
 * Modul Verkehr-Leistungsverzeichnis (P2-M3): Tabellenansicht
 * Vergabeeinheiten × Workflow-Schritte mit dem Erledigt-Fortschritt des
 * Alt-Tools (lib/lv-logic.ts), Zellen per Klick editierbar (Datum oder
 * Freitext inkl. Standard-Marker), Einheiten über Modals, Werkvertrags-
 * Verknüpfung aus dem Hub, Speicherstatus/Toasts analog Hub/BKK.
 * Sehen-Rolle: reine Ansicht ohne Bearbeitungselemente.
 * Zellfarben: bewusst die fixen BKK-Töne (grün = erledigt), damit die
 * Ampellogik in jedem Tenant-Branding lesbar bleibt.
 */
export function LvClient({
  projectId,
  projectName,
  projectNo,
  managementName,
  managementLogoUrl,
  canEdit,
  initialUnits,
  initialSteps,
  werkvertragDocs,
}: LvClientProps) {
  const [units, setUnits] = useState<LvUnit[]>(initialUnits);
  const [stepsByUnit, setStepsByUnit] = useState<Record<string, LvUnitStepMap>>(
    () => stepsToMap(initialSteps),
  );
  const [deletedUnitIds, setDeletedUnitIds] = useState<string[]>([]);
  const [deletedCells, setDeletedCells] = useState<
    { unit_id: string; step_key: LvStepKey }[]
  >([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unitModal, setUnitModal] = useState<{ unit?: LvUnit } | null>(null);
  const [cellModal, setCellModal] = useState<{
    unit: LvUnit;
    stepKey: LvStepKey;
  } | null>(null);
  const { toasts, showToast } = useToasts();

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

  /** Einheiten natürlich nach BKP sortiert (211.4 vor 212) */
  const sortedUnits = useMemo(
    () =>
      [...units].sort((a, b) =>
        a.bkp.localeCompare(b.bkp, 'de-CH', { numeric: true, sensitivity: 'base' }),
      ),
    [units],
  );
  const visibleUnits = sortedUnits.filter((u) => canEdit || !u.hidden);

  // KPIs über die sichtbaren (nicht ausgeblendeten) Einheiten – wie Alt-Tool
  const kpis = unitKpis(
    sortedUnits.filter((u) => !u.hidden).map((u) => stepsByUnit[u.id] ?? {}),
  );
  // Erledigt-Zähler je Workflow-Schritt für die Matrix-Kopfzeile
  const stepCounts = Object.fromEntries(
    LV_STEP_KEYS.map((key) => [
      key,
      sortedUnits
        .filter((u) => !u.hidden)
        .filter((u) => isFilled((stepsByUnit[u.id] ?? {})[key])).length,
    ]),
  ) as Record<LvStepKey, number>;
  const monogram = managementName?.trim().charAt(0).toUpperCase();

  // -------------------------------------------------------------------------
  // Mutationen (nur canEdit)

  function applyUnitModal(result: UnitModalResult) {
    if (!unitModal) return;
    if (unitModal.unit) {
      const id = unitModal.unit.id;
      setUnits((current) =>
        current.map((u) => (u.id === id ? { ...u, ...result } : u)),
      );
      showToast(texts.hub.updatedToast);
    } else {
      setUnits((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          project_id: projectId,
          is_custom: true,
          sort: current.length,
          ...result,
        },
      ]);
      showToast(texts.hub.addedToast);
    }
    setDirty(true);
    setUnitModal(null);
  }

  function removeUnit(unit: LvUnit) {
    if (!window.confirm(texts.lv.confirmDeleteUnit)) return;
    setUnits((current) => current.filter((u) => u.id !== unit.id));
    setStepsByUnit((current) => {
      const next = { ...current };
      delete next[unit.id];
      return next;
    });
    // Schritt-Zeilen löscht die DB per Cascade beim Einheiten-Delete
    setDeletedCells((current) => current.filter((c) => c.unit_id !== unit.id));
    setDeletedUnitIds((current) => [...current, unit.id]);
    setDirty(true);
    showToast(texts.hub.deletedToast);
  }

  function applyCell(value: LvStepValue | null) {
    if (!cellModal) return;
    const { unit, stepKey } = cellModal;
    setStepsByUnit((current) => {
      const unitSteps = { ...(current[unit.id] ?? {}) };
      if (value === null) delete unitSteps[stepKey];
      else unitSteps[stepKey] = value;
      return { ...current, [unit.id]: unitSteps };
    });
    setDeletedCells((current) => {
      const rest = current.filter(
        (c) => !(c.unit_id === unit.id && c.step_key === stepKey),
      );
      return value === null
        ? [...rest, { unit_id: unit.id, step_key: stepKey }]
        : rest;
    });
    setDirty(true);
    showToast(texts.hub.updatedToast);
    setCellModal(null);
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();

    // Sortierung aus der angezeigten (natürlichen) Reihenfolge
    const unitRows = sortedUnits.map((u, index) => ({ ...u, sort: index }));
    const stepRows = units.flatMap((unit) =>
      Object.entries(stepsByUnit[unit.id] ?? {}).map(([stepKey, value]) => ({
        unit_id: unit.id,
        step_key: stepKey,
        datum: value.datum,
        freitext: value.freitext,
      })),
    );

    let failed = false;
    if (unitRows.length > 0) {
      const { error } = await supabase.from('lv_units').upsert(unitRows);
      if (error) failed = true;
    }
    if (!failed && stepRows.length > 0) {
      const { error } = await supabase.from('lv_unit_steps').upsert(stepRows);
      if (error) failed = true;
    }
    if (!failed) {
      for (const cell of deletedCells) {
        const { error } = await supabase
          .from('lv_unit_steps')
          .delete()
          .eq('unit_id', cell.unit_id)
          .eq('step_key', cell.step_key);
        if (error) {
          failed = true;
          break;
        }
      }
    }
    if (!failed && deletedUnitIds.length > 0) {
      const { error } = await supabase
        .from('lv_units')
        .delete()
        .in('id', deletedUnitIds);
      if (error) failed = true;
    }

    setSaving(false);
    if (failed) {
      showToast(texts.hub.saveErrorToast, 'error');
    } else {
      setDeletedCells([]);
      setDeletedUnitIds([]);
      setDirty(false);
      showToast(texts.hub.savedToast);
    }
  }

  // -------------------------------------------------------------------------
  // Rendering

  function kpiCard(
    title: string,
    value: number,
    topBorder: string,
    topBg: string,
    showPct: boolean,
  ) {
    const pct = kpis.total > 0 ? (value / kpis.total) * 100 : 0;
    return (
      <div
        className={`w-32 shrink-0 border border-line border-t-[3px] bg-white p-3 sm:w-auto sm:p-4 ${topBorder}`}
      >
        <p className="display-title text-[9px] font-medium tracking-[0.14em] text-primary-dark sm:text-[11px] sm:tracking-[0.18em]">
          {title}
        </p>
        <p className="mt-1.5 flex items-baseline gap-1.5 sm:mt-2">
          <span className="text-lg font-semibold text-ink tabular-nums sm:text-2xl">
            {value}
          </span>
          {showPct && kpis.total > 0 && (
            <span className="text-[10px] font-semibold text-primary sm:text-xs">
              {pct.toFixed(0)} %
            </span>
          )}
        </p>
        {showPct && (
          <div className="mt-2 h-[3px] bg-bg sm:mt-2.5">
            <div
              className={`h-[3px] ${topBg}`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  /**
   * Matrix-Zelle (Design-Referenz): «·» offen, «⊘» nach Aufwand, «✓» ohne
   * Datum erledigt; der letzte erledigte Schritt einer laufenden Einheit
   * ist fett auf grünem Tint, frühere Schritte treten grau zurück.
   */
  function cellNode(
    unit: LvUnit,
    stepKey: LvStepKey,
    lastKey: LvStepKey | null,
    completed: boolean,
  ) {
    const value = (stepsByUnit[unit.id] ?? {})[stepKey];
    const filled = isFilled(value);
    const na = isNaValue(value);
    const doneMarker =
      !na && !value?.datum && value?.freitext?.trim() === LV_DONE_MARKER;
    const isLast = filled && stepKey === lastKey && !completed;

    let content: React.ReactNode;
    if (!filled) {
      content = <span className="text-line">·</span>;
    } else if (na) {
      content = <span className="text-primary/60">⊘</span>;
    } else if (doneMarker) {
      content = <span className="font-bold text-status-bezahlt">✓</span>;
    } else {
      content = (
        <span
          className={
            isLast ? 'font-bold text-ink' : 'text-primary'
          }
        >
          {value!.datum && (
            <span className="block">{formatDateShort(value!.datum)}</span>
          )}
          {value!.freitext && <span className="block">{value!.freitext}</span>}
        </span>
      );
    }

    const tint = isLast ? 'bg-bkk-mut-tint' : !filled || na ? 'bg-bg/60' : '';
    if (!canEdit) {
      return (
        <td
          key={stepKey}
          className={`border-b border-l border-line px-1.5 py-2 text-center text-[11px] tabular-nums ${tint}`}
        >
          {content}
        </td>
      );
    }
    return (
      <td
        key={stepKey}
        className={`border-b border-l border-line p-0 text-center text-[11px] tabular-nums ${tint}`}
      >
        <button
          type="button"
          onClick={() => setCellModal({ unit, stepKey })}
          className="block h-full min-h-9 w-full px-1.5 py-2 hover:outline hover:outline-1 hover:outline-accent"
        >
          {content}
        </button>
      </td>
    );
  }

  function statusPill(unit: LvUnit) {
    const status = unitStatus(stepsByUnit[unit.id] ?? {});
    if (status.kind === 'offen') {
      return (
        <span className={`${PILL_BASE} border-primary text-primary`}>
          {texts.lv.status.offen}
        </span>
      );
    }
    if (status.kind === 'nach_aufwand') {
      return (
        <span className={`${PILL_BASE} border-primary text-primary`}>
          {texts.lv.status.nach_aufwand}
        </span>
      );
    }
    if (status.kind === 'abgeschlossen') {
      return (
        <span
          className={`${PILL_BASE} border-status-bezahlt text-status-bezahlt`}
        >
          {texts.lv.status.abgeschlossen}
        </span>
      );
    }
    return (
      <span
        className={`${PILL_BASE} border-status-vertrag text-status-vertrag`}
      >
        {texts.lv.steps[status.lastStep].short}
      </span>
    );
  }

  function unitRow(unit: LvUnit) {
    const werkvertrag = unit.werkvertrag_document_id
      ? werkvertragDocs.find((d) => d.id === unit.werkvertrag_document_id)
      : undefined;
    const stepMap = stepsByUnit[unit.id] ?? {};
    const lastKey = lastFilledStep(stepMap);
    const completed = unitStatus(stepMap).kind === 'abgeschlossen';
    // Abgeschlossene (und ausgeblendete) Zeilen treten gedimmt zurück
    const dimmed = completed || unit.hidden;
    return (
      <tr key={unit.id} className={dimmed ? 'opacity-50' : ''}>
        <td className="sticky left-0 z-10 min-w-36 border-r border-b border-line bg-white px-3 py-2 sm:min-w-56 sm:px-4">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-ink sm:text-[12.5px]">
                <span className="font-bold tabular-nums">{unit.bkp}</span>{' '}
                <span className="font-medium">{unit.name}</span>
                {unit.is_custom && (
                  <span className="ml-1 text-[10px] text-accent-dark">
                    {texts.lv.customBadge}
                  </span>
                )}
                {unit.hidden && (
                  <span className="ml-1 text-[10px] text-primary">
                    {texts.lv.hiddenBadge}
                  </span>
                )}
              </span>
              {werkvertrag &&
                (werkvertrag.href ? (
                  <a
                    href={werkvertrag.href}
                    target="_blank"
                    rel="noreferrer"
                    title={werkvertrag.label}
                    className="block truncate text-[10px] font-semibold text-accent underline-offset-2 hover:text-accent-dark hover:underline"
                  >
                    {texts.lv.werkvertragOpen} →
                  </a>
                ) : (
                  <span className="block truncate text-[10px] text-primary">
                    {werkvertrag.label}
                  </span>
                ))}
            </span>
            {canEdit && (
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  title={texts.common.edit}
                  onClick={() => setUnitModal({ unit })}
                  className="border border-line bg-white px-1.5 py-0.5 text-[11px] text-primary-dark hover:border-primary"
                >
                  ✎
                </button>
                {unit.is_custom && (
                  <button
                    type="button"
                    title={texts.common.delete}
                    onClick={() => removeUnit(unit)}
                    className="border border-line bg-white px-1.5 py-0.5 text-[11px] text-primary-dark hover:border-error hover:text-error"
                  >
                    ✕
                  </button>
                )}
              </span>
            )}
          </div>
        </td>
        {LV_STEP_KEYS.map((stepKey) =>
          cellNode(unit, stepKey, lastKey, completed),
        )}
        <td className="border-b border-l border-line bg-white px-2.5 py-2 sm:px-3">
          {statusPill(unit)}
        </td>
      </tr>
    );
  }

  const takenBkps = units
    .filter((u) => u.id !== unitModal?.unit?.id)
    .map((u) => u.bkp);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Sticky Toolbar (Design-Referenz, analog Hub/BKK) */}
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="mx-auto flex h-13 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:h-14 sm:px-14">
          <div className="flex min-w-0 items-center gap-3">
            {/* Logo ODER Firmenname (Alt-Text bleibt der Firmenname) */}
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
          <div className="flex shrink-0 items-center gap-2.5 sm:gap-5">
            {canEdit && (
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
              {texts.modules.leistungsverzeichnis.label}
            </h1>
          </div>
          <p className="display-title mt-1.5 truncate text-[10px] tracking-[0.2em] text-primary sm:text-xs sm:tracking-[0.26em]">
            {projectName}
            {projectNo && ` · ${texts.landing.projectNoPrefix} ${projectNo}`}
          </p>
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-6 sm:px-14 sm:py-8">
        {/* KPI-Karten mit Akzent-Oberkante und Fortschrittsbalken;
            mobil horizontal scrollbar */}
        <section className="-mx-5 flex gap-2.5 overflow-x-auto px-5 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0 lg:grid-cols-5">
          {kpiCard(
            texts.lv.kpiTotal,
            kpis.total,
            'border-t-primary-dark',
            'bg-primary-dark',
            false,
          )}
          {kpiCard(
            texts.lv.kpiLv,
            kpis.lvErstellt,
            'border-t-bkk-mut-ink',
            'bg-bkk-mut-ink',
            true,
          )}
          {kpiCard(
            texts.lv.kpiOff,
            kpis.offErhalten,
            'border-t-bkk-mut-ink',
            'bg-bkk-mut-ink',
            true,
          )}
          {kpiCard(
            texts.lv.kpiWv,
            kpis.wvZurueck,
            'border-t-bkk-zahl-ink',
            'bg-bkk-zahl-ink',
            true,
          )}
          {kpiCard(
            texts.lv.kpiOpen,
            kpis.offen,
            'border-t-bkk-orig-ink',
            'bg-bkk-orig-ink',
            true,
          )}
        </section>

        {/* Workflow-Matrix: horizontal scrollbar, Einheiten-Spalte fixiert */}
        <section className="mt-6 border border-line bg-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3 sm:px-4.5">
            <div className="flex items-baseline gap-3">
              <h2 className="display-title text-[13px] font-medium tracking-[0.14em] text-ink sm:text-sm sm:tracking-[0.16em]">
                {texts.lv.matrixTitle}
              </h2>
              <span className="text-[11px] text-primary sm:text-xs">
                {kpis.total} {texts.lv.unitCountSuffix}
              </span>
            </div>
            <span className="text-[10px] text-primary sm:hidden">
              {texts.lv.scrollHint}
            </span>
          </div>
          {units.length === 0 ? (
            <p className="px-4 py-6 text-sm text-primary">
              {texts.lv.emptyModule}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] border-collapse">
                <thead>
                  <tr className="bg-bg/60">
                    <th className="display-title sticky left-0 z-10 min-w-36 border-r border-b border-line bg-bg px-3 py-2.5 text-left text-[10px] font-medium tracking-[0.14em] text-primary-dark sm:min-w-56 sm:px-4 sm:text-[11px] sm:tracking-[0.16em]">
                      {texts.lv.colUnit}
                    </th>
                    {LV_STEP_KEYS.map((stepKey) => {
                      const count = stepCounts[stepKey];
                      const barPct =
                        kpis.total > 0 ? (count / kpis.total) * 100 : 0;
                      return (
                        <th
                          key={stepKey}
                          title={texts.lv.steps[stepKey].label}
                          className="border-b border-l border-line px-1.5 pt-2.5 pb-2 align-top"
                        >
                          <span className="display-title block text-center text-[9px] font-medium tracking-[0.08em] text-primary-dark sm:text-[10px] sm:tracking-[0.1em]">
                            {texts.lv.steps[stepKey].short}
                          </span>
                          <span className="mt-0.5 block text-center text-[9px] font-normal text-primary/70 tabular-nums">
                            {count}/{kpis.total}
                          </span>
                          <span className="mt-1.5 block h-[2px] bg-bg">
                            <span
                              className="block h-[2px] bg-bkk-mut-ink"
                              style={{ width: `${Math.min(100, barPct)}%` }}
                            />
                          </span>
                        </th>
                      );
                    })}
                    <th className="display-title border-b border-l border-line px-2.5 py-2.5 text-left text-[10px] font-medium tracking-[0.14em] text-primary-dark sm:px-3 sm:text-[11px] sm:tracking-[0.16em]">
                      {texts.lv.colStatus}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUnits.map((unit) => (
                    <Fragment key={unit.id}>{unitRow(unit)}</Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Lesart-Legende (Design-Referenz) */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-primary">
          <span className="display-title text-[11px] font-medium tracking-[0.16em] text-primary-dark">
            {texts.lv.legend.title}
          </span>
          <span>
            <span className="font-bold text-ink">01.06.26</span>{' '}
            {texts.lv.legend.last}
          </span>
          <span>
            <span className="text-primary">01.06.26</span>{' '}
            {texts.lv.legend.done}
          </span>
          <span>
            <span className="font-bold text-status-bezahlt">✓</span>{' '}
            {texts.lv.legend.doneMarker}
          </span>
          <span>
            <span className="text-primary/60">⊘</span> {texts.lv.legend.na}
          </span>
          <span>
            <span className="text-line">·</span> {texts.lv.legend.open}
          </span>
          <span className="sm:ml-auto">{texts.lv.legend.dimmed}</span>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={() => setUnitModal({})}
            className="mt-5 inline-flex items-center gap-2.5 border border-dashed border-line px-5 py-3 text-primary transition-colors hover:border-primary hover:text-primary-dark"
          >
            <span className="text-base font-light">+</span>
            <span className="display-title text-[11px] font-medium tracking-[0.14em] sm:text-xs sm:tracking-[0.16em]">
              {texts.lv.addUnit.replace(/^\+\s*/, '')}
            </span>
          </button>
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

      {unitModal && (
        <UnitModal
          initial={unitModal.unit}
          takenBkps={takenBkps}
          werkvertragDocs={werkvertragDocs}
          onApply={applyUnitModal}
          onClose={() => setUnitModal(null)}
        />
      )}
      {cellModal && (
        <CellModal
          unitLabel={`BKP ${cellModal.unit.bkp} — ${cellModal.unit.name}`}
          stepKey={cellModal.stepKey}
          initial={(stepsByUnit[cellModal.unit.id] ?? {})[cellModal.stepKey]}
          onApply={applyCell}
          onClose={() => setCellModal(null)}
        />
      )}
      <ToastContainer toasts={toasts} />
    </div>
  );
}

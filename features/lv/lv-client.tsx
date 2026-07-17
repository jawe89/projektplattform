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
import { formatDate } from '@/lib/format';
import {
  LV_STEP_KEYS,
  type LvStepKey,
  type LvStepValue,
  type LvUnitStepMap,
  isNaValue,
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
  /** Bearbeitung (Rollen-Freigabe «Bearbeiten» oder Projekt-Admin) */
  canEdit: boolean;
  initialUnits: LvUnit[];
  initialSteps: LvUnitStep[];
  /** Hub-Dokumente der Kategorie Werkverträge */
  werkvertragDocs: WerkvertragDoc[];
}

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

  function kpiCard(title: string, value: number, showPct: boolean) {
    return (
      <div className="border border-line bg-white p-4">
        <p className="display-title text-xs text-primary">{title}</p>
        <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
        {showPct && (
          <p className="mt-0.5 text-[11px] text-primary-dark">
            {kpis.total > 0
              ? `${((value / kpis.total) * 100).toFixed(0)} % ${texts.lv.pctOf} ${kpis.total}`
              : '–'}
          </p>
        )}
      </div>
    );
  }

  function cellNode(unit: LvUnit, stepKey: LvStepKey) {
    const value = (stepsByUnit[unit.id] ?? {})[stepKey];
    const na = isNaValue(value);
    const filled = Boolean(value && (value.datum || value.freitext));
    const content = filled ? (
      <span
        className={`block text-xs ${na ? 'text-warn' : 'text-bkk-mut-ink'}`}
      >
        {value!.datum && <span className="block">{formatDate(value!.datum)}</span>}
        {value!.freitext && <span className="block">{value!.freitext}</span>}
      </span>
    ) : (
      <span className="block text-xs text-primary opacity-50">
        {texts.lv.cellOpen}
      </span>
    );

    const tint = filled ? (na ? 'bg-bg' : 'bg-bkk-mut-tint') : 'bg-white';
    if (!canEdit) {
      return (
        <td key={stepKey} className={`border-b border-line px-2 py-2 text-center ${tint}`}>
          {content}
        </td>
      );
    }
    return (
      <td key={stepKey} className={`border-b border-line p-0 text-center ${tint}`}>
        <button
          type="button"
          onClick={() => setCellModal({ unit, stepKey })}
          className="block h-full w-full px-2 py-2 hover:outline hover:outline-1 hover:outline-accent"
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
        <span className="inline-block border border-line bg-white px-2 py-0.5 text-[11px] text-primary">
          {texts.lv.status.offen}
        </span>
      );
    }
    if (status.kind === 'nach_aufwand') {
      return (
        <span className="inline-block border border-warn bg-white px-2 py-0.5 text-[11px] text-warn">
          {texts.lv.status.nach_aufwand}
        </span>
      );
    }
    if (status.kind === 'abgeschlossen') {
      return (
        <span className="inline-block border border-bkk-mut-bord bg-bkk-mut-bord px-2 py-0.5 text-[11px] text-white">
          {texts.lv.status.abgeschlossen}
        </span>
      );
    }
    return (
      <span className="inline-block border border-bkk-mut-bord bg-white px-2 py-0.5 text-[11px] text-bkk-mut-ink">
        {texts.lv.steps[status.lastStep].short}
      </span>
    );
  }

  function unitRow(unit: LvUnit) {
    const werkvertrag = unit.werkvertrag_document_id
      ? werkvertragDocs.find((d) => d.id === unit.werkvertrag_document_id)
      : undefined;
    return (
      <tr key={unit.id} className={unit.hidden ? 'opacity-50' : ''}>
        <td className="sticky left-0 z-10 min-w-56 border-b border-line bg-white px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink">
                <span className="font-medium">{unit.bkp}</span> {unit.name}
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
                    title={texts.lv.werkvertragOpen}
                    className="block truncate text-[11px] text-accent-dark underline-offset-2 hover:underline"
                  >
                    {werkvertrag.label} ↗
                  </a>
                ) : (
                  <span className="block truncate text-[11px] text-primary">
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
        {LV_STEP_KEYS.map((stepKey) => cellNode(unit, stepKey))}
        <td className="border-b border-l-2 border-line border-l-primary bg-white px-3 py-2 text-center">
          {statusPill(unit)}
        </td>
      </tr>
    );
  }

  const takenBkps = units
    .filter((u) => u.id !== unitModal?.unit?.id)
    .map((u) => u.bkp);

  return (
    <div className="min-h-screen">
      {/* Sticky Toolbar mit Speicherstatus (analog Hub/BKK) */}
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/hub"
              className="shrink-0 border border-line bg-white px-3 py-1.5 text-xs text-primary-dark hover:border-primary"
            >
              ← {texts.hub.title}
            </Link>
            <span className="display-title truncate text-sm text-ink">
              {texts.modules.leistungsverzeichnis.label}
            </span>
            <span className="hidden truncate text-xs text-primary sm:block">
              {projectName}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {canEdit && (
              <>
                <span
                  className={`text-xs font-medium ${dirty ? 'text-warn' : 'text-accent'}`}
                >
                  {dirty ? texts.common.unsaved : texts.common.saved}
                </span>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  className="bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
                >
                  {texts.common.save}
                </button>
              </>
            )}
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {/* KPI-Karten (Zählung wie Alt-Tool) */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {kpiCard(texts.lv.kpiTotal, kpis.total, false)}
          {kpiCard(texts.lv.kpiLv, kpis.lvErstellt, true)}
          {kpiCard(texts.lv.kpiOff, kpis.offErhalten, true)}
          {kpiCard(texts.lv.kpiWv, kpis.wvZurueck, true)}
          {kpiCard(texts.lv.kpiOpen, kpis.offen, true)}
        </section>

        {/* Tabelle: horizontal scrollbar, Einheiten-Spalte fixiert */}
        <section className="mt-6 border border-line bg-white">
          {units.length === 0 ? (
            <p className="px-4 py-6 text-sm text-primary">
              {texts.lv.emptyModule}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[72rem] border-collapse text-sm">
                <thead>
                  <tr className="display-title text-[11px]">
                    <th className="sticky left-0 z-10 min-w-56 border-b border-line bg-white px-3 py-2 text-left text-primary-dark">
                      {texts.lv.colUnit}
                    </th>
                    {LV_STEP_KEYS.map((stepKey) => (
                      <th
                        key={stepKey}
                        title={texts.lv.steps[stepKey].label}
                        className="border-b border-line bg-bg px-2 py-2 text-center text-primary-dark"
                      >
                        {texts.lv.steps[stepKey].short}
                      </th>
                    ))}
                    <th className="border-b border-l-2 border-line border-l-primary bg-white px-3 py-2 text-center text-primary-dark">
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

        {canEdit && (
          <button
            type="button"
            onClick={() => setUnitModal({})}
            className="mt-4 w-full border border-dashed border-line px-4 py-2.5 text-sm text-primary hover:border-accent hover:text-accent"
          >
            {texts.lv.addUnit}
          </button>
        )}
      </main>

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

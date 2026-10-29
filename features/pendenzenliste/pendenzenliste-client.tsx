'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ToastContainer, useToasts } from '@/components/ui/toast';
import { LogoutButton } from '@/features/auth/logout-button';
import { formatDate } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import { texts } from '@/lib/texts';
import type { PlItem } from '@/lib/types';

interface Props {
  projectId: string;
  projectName: string;
  managementName: string | null;
  managementLogoUrl: string | null;
  /** Bearbeitung (Rollen-Freigabe «Bearbeiten» oder Projekt-Admin) */
  canEdit: boolean;
  initialItems: PlItem[];
}

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** ISO-Datum (yyyy-mm-dd) aufsteigend; leere ans Ende. */
function byDateAsc(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

/**
 * Modul «Pendenzenliste» (0017). Zwei Kategorien «Offen» / «Erledigt», aus dem
 * Feld «Erledigt am» abgeleitet: sobald es gesetzt ist, wandert die Pendenz
 * automatisch nach «Erledigt». Tabellenansicht mit Zeilen-Bearbeitung (Stift);
 * Bedienung wie die übrigen Module (alles lokal, «Speichern» persistiert).
 * Sehen-Rolle: reine Tabellen ohne Bearbeitung.
 */
export function PendenzenlisteClient({
  projectId,
  projectName,
  managementName,
  managementLogoUrl,
  canEdit,
  initialItems,
}: Props) {
  const t = texts.pendenzenliste;
  const [items, setItems] = useState<PlItem[]>(initialItems);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toasts, showToast } = useToasts();

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = texts.hub.leaveWarning;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const monogram = managementName?.trim().charAt(0).toUpperCase();

  // Offen: nach Fälligkeit; Erledigt: zuletzt erledigte zuerst.
  const open = useMemo(
    () =>
      items
        .filter((i) => !i.erledigt_datum)
        .sort((a, b) => byDateAsc(a.faellig_datum, b.faellig_datum)),
    [items],
  );
  const done = useMemo(
    () =>
      items
        .filter((i) => i.erledigt_datum)
        .sort((a, b) => byDateAsc(b.erledigt_datum, a.erledigt_datum)),
    [items],
  );

  const isEditing = (id: string) => editing.has(id);
  const startEdit = (id: string) => setEditing((s) => new Set(s).add(id));
  const stopEdit = (id: string) =>
    setEditing((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });

  function addItem() {
    const id = crypto.randomUUID();
    setItems((c) => [
      ...c,
      {
        id,
        project_id: projectId,
        aufnahme_datum: todayIso(),
        beschrieb: '',
        verantwortlich: '',
        faellig_datum: null,
        erledigt_datum: null,
        sort: c.length,
      },
    ]);
    startEdit(id);
    setDirty(true);
  }
  function updateItem(id: string, patch: Partial<PlItem>) {
    setItems((c) => c.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    setDirty(true);
  }
  function removeItem(id: string) {
    if (!window.confirm(t.confirmDelete)) return;
    setItems((c) => c.filter((x) => x.id !== id));
    setDeletedIds((d) => [...d, id]);
    stopEdit(id);
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const rows = items.map((i, index) => ({
      id: i.id,
      project_id: projectId,
      aufnahme_datum: i.aufnahme_datum,
      beschrieb: i.beschrieb,
      verantwortlich: i.verantwortlich,
      faellig_datum: i.faellig_datum,
      erledigt_datum: i.erledigt_datum,
      sort: index,
    }));

    let failed = false;
    if (rows.length) {
      const { error } = await supabase.from('pl_items').upsert(rows);
      if (error) failed = true;
    }
    if (!failed && deletedIds.length) {
      const { error } = await supabase
        .from('pl_items')
        .delete()
        .in('id', deletedIds);
      if (error) failed = true;
    }

    setSaving(false);
    if (failed) {
      showToast(texts.hub.saveErrorToast, 'error');
    } else {
      setDeletedIds([]);
      setDirty(false);
      showToast(texts.hub.savedToast);
    }
  }

  // --- Stil-Bausteine --------------------------------------------------------
  const sectionTitle =
    'display-title text-[15px] font-medium tracking-[0.14em] text-ink sm:text-lg sm:tracking-[0.16em]';
  const addBtn =
    'display-title inline-flex items-center gap-2 border border-dashed border-line px-4 py-2 text-[11px] font-medium tracking-[0.14em] text-primary transition-colors hover:border-primary hover:text-primary-dark';
  const th =
    'display-title px-3 py-2.5 text-left text-[10px] font-medium tracking-[0.14em] text-primary-dark';
  const td = 'px-3 py-2.5 align-top text-[13px] text-ink';
  const inputClass =
    'border border-line bg-white px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent';
  const iconBtn =
    'border border-line bg-white px-2 py-1 text-xs text-primary-dark transition-colors hover:border-primary';

  const fmt = (d: string | null) => (d ? formatDate(d) : '—');
  const labelCls =
    'display-title text-[9px] font-medium tracking-[0.12em] text-primary';

  function editRow(item: PlItem, colSpan: number) {
    return (
      <tr key={item.id} className="border-b border-line last:border-b-0">
        <td colSpan={colSpan} className="bg-bg/40 p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className={labelCls}>{t.aufnahme}</span>
              <input
                type="date"
                value={item.aufnahme_datum ?? ''}
                onChange={(e) =>
                  updateItem(item.id, { aufnahme_datum: e.target.value || null })
                }
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>{t.verantwortlich}</span>
              <input
                type="text"
                value={item.verantwortlich}
                onChange={(e) =>
                  updateItem(item.id, { verantwortlich: e.target.value })
                }
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>{t.faellig}</span>
              <input
                type="date"
                value={item.faellig_datum ?? ''}
                onChange={(e) =>
                  updateItem(item.id, { faellig_datum: e.target.value || null })
                }
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className={labelCls}>{t.beschrieb}</span>
              <textarea
                rows={2}
                value={item.beschrieb}
                onChange={(e) =>
                  updateItem(item.id, { beschrieb: e.target.value })
                }
                className={`${inputClass} resize-y`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>{t.erledigt}</span>
              <input
                type="date"
                value={item.erledigt_datum ?? ''}
                onChange={(e) =>
                  updateItem(item.id, { erledigt_datum: e.target.value || null })
                }
                className={inputClass}
              />
              <span className="text-[10px] text-primary">{t.erledigtHint}</span>
            </label>
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
            <button
              type="button"
              onClick={() => stopEdit(item.id)}
              className="display-title bg-accent px-3.5 py-1.5 text-[11px] font-medium tracking-[0.12em] text-white transition-opacity hover:opacity-90"
            >
              {t.done}
            </button>
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              className="ml-auto border border-line bg-white px-3 py-1.5 text-[11px] text-primary-dark transition-colors hover:border-error hover:text-error"
            >
              {t.remove}
            </button>
          </div>
        </td>
      </tr>
    );
  }

  function displayRow(item: PlItem, withErledigt: boolean) {
    return (
      <tr
        key={item.id}
        className="border-b border-line transition-colors last:border-b-0 hover:bg-bg"
      >
        <td className={`${td} whitespace-nowrap`}>{fmt(item.aufnahme_datum)}</td>
        <td className={`${td} min-w-[16rem] whitespace-pre-wrap`}>
          {item.beschrieb || '—'}
        </td>
        <td className={td}>{item.verantwortlich || '—'}</td>
        <td className={`${td} whitespace-nowrap`}>{fmt(item.faellig_datum)}</td>
        {withErledigt && (
          <td className={`${td} whitespace-nowrap`}>{fmt(item.erledigt_datum)}</td>
        )}
        {canEdit && (
          <td className="px-3 py-2.5 text-right">
            <button
              type="button"
              title={texts.common.edit}
              onClick={() => startEdit(item.id)}
              className={iconBtn}
            >
              ✎
            </button>
          </td>
        )}
      </tr>
    );
  }

  function table(list: PlItem[], withErledigt: boolean, emptyText: string) {
    const colSpan = 4 + (withErledigt ? 1 : 0) + (canEdit ? 1 : 0);
    if (list.length === 0) {
      return <p className="text-sm text-primary">{emptyText}</p>;
    }
    return (
      <div className="overflow-x-auto border border-line bg-white">
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b border-line bg-bg">
              <th className={th}>{t.aufnahme}</th>
              <th className={th}>{t.beschrieb}</th>
              <th className={th}>{t.verantwortlich}</th>
              <th className={th}>{t.faellig}</th>
              {withErledigt && <th className={th}>{t.erledigt}</th>}
              {canEdit && <th className="w-12" />}
            </tr>
          </thead>
          <tbody>
            {list.map((item) =>
              canEdit && isEditing(item.id)
                ? editRow(item, colSpan)
                : displayRow(item, withErledigt),
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Sticky Toolbar */}
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

      {/* Kopfzeile */}
      <div className="border-b border-line">
        <div className="mx-auto w-full max-w-7xl px-5 py-5 sm:px-14 sm:py-7">
          <h1 className="display-title text-xl leading-tight font-medium tracking-[0.06em] text-ink sm:text-[26px]">
            {texts.modules.pendenzenliste.label}
          </h1>
          <p className="display-title mt-1 truncate text-[10px] tracking-[0.22em] text-primary sm:text-xs sm:tracking-[0.26em]">
            {projectName}
          </p>
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl flex-1 px-5 pt-7 pb-14 sm:px-14 sm:pt-10">
        {/* Offen */}
        <section className="mb-10 sm:mb-12">
          <div className="mb-4 flex items-baseline gap-3">
            <h2 className={sectionTitle}>{t.openTitle}</h2>
            <span className="text-[11px] text-primary sm:text-xs">
              {open.length}
            </span>
          </div>
          {table(open, false, t.noOpen)}
          {canEdit && (
            <button type="button" onClick={addItem} className={`${addBtn} mt-4`}>
              <span className="text-base font-light">+</span>
              {t.add.replace(/^\+\s*/, '')}
            </button>
          )}
        </section>

        {/* Erledigt */}
        <section>
          <div className="mb-4 flex items-baseline gap-3">
            <h2 className={sectionTitle}>{t.doneTitle}</h2>
            <span className="text-[11px] text-primary sm:text-xs">
              {done.length}
            </span>
          </div>
          {table(done, true, t.noDone)}
        </section>
      </main>

      <ToastContainer toasts={toasts} />
    </div>
  );
}

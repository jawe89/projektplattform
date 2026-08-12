'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ToastContainer, useToasts } from '@/components/ui/toast';
import { LogoutButton } from '@/features/auth/logout-button';
import { createClient } from '@/lib/supabase/client';
import { texts } from '@/lib/texts';
import type { UlBauherrContact, UlContractor, UlEntry } from '@/lib/types';

interface Props {
  projectId: string;
  projectName: string;
  managementName: string | null;
  managementLogoUrl: string | null;
  /** Bearbeitung (Rollen-Freigabe «Bearbeiten» oder Projekt-Admin) */
  canEdit: boolean;
  initialBauherr: UlBauherrContact[];
  initialEntries: UlEntry[];
  initialContractors: UlContractor[];
}

/** Beschriftetes Feld: im Bearbeiten-Modus Eingabe, sonst reine Anzeige. */
function Field({
  label,
  value,
  onChange,
  readOnly,
  placeholder,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="display-title text-[9px] font-medium tracking-[0.12em] text-primary">
        {label}
      </span>
      {readOnly ? (
        <span className="min-h-[1.25rem] text-[13px] text-ink">
          {value || '—'}
        </span>
      ) : (
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="border border-line bg-white px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent"
        />
      )}
    </label>
  );
}

/**
 * Modul «Unternehmerliste» (0016): projektweites Kontaktverzeichnis.
 * Oben die zuständigen Personen der Bauherrschaft (mehrere), darunter je
 * BKP-Eintrag (BKP-Nr. + Arbeitsgattung) die beteiligten Unternehmer.
 * Bedienkonzept wie Hub/BKK/LV: alles wirkt lokal, «Speichern» persistiert
 * gesammelt; die Sehen-Rolle sieht eine reine Ansicht ohne Bearbeitung.
 */
export function UnternehmerlisteClient({
  projectId,
  projectName,
  managementName,
  managementLogoUrl,
  canEdit,
  initialBauherr,
  initialEntries,
  initialContractors,
}: Props) {
  const t = texts.unternehmerliste;
  const [bauherr, setBauherr] = useState<UlBauherrContact[]>(initialBauherr);
  const [entries, setEntries] = useState<UlEntry[]>(initialEntries);
  const [contractors, setContractors] =
    useState<UlContractor[]>(initialContractors);
  const [deletedContactIds, setDeletedContactIds] = useState<string[]>([]);
  const [deletedEntryIds, setDeletedEntryIds] = useState<string[]>([]);
  const [deletedContractorIds, setDeletedContractorIds] = useState<string[]>([]);
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

  function contractorsOf(entryId: string): UlContractor[] {
    return contractors.filter((c) => c.entry_id === entryId);
  }

  // --- Bauherrschaft ---------------------------------------------------------
  function addContact() {
    setBauherr((c) => [
      ...c,
      {
        id: crypto.randomUUID(),
        project_id: projectId,
        name: '',
        funktion: '',
        mail: '',
        telefon: '',
        sort: c.length,
      },
    ]);
    setDirty(true);
  }
  function updateContact(id: string, patch: Partial<UlBauherrContact>) {
    setBauherr((c) => c.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    setDirty(true);
  }
  function removeContact(id: string) {
    if (!window.confirm(t.confirmDeleteContact)) return;
    setBauherr((c) => c.filter((x) => x.id !== id));
    setDeletedContactIds((d) => [...d, id]);
    setDirty(true);
  }

  // --- BKP-Einträge ----------------------------------------------------------
  function addEntry() {
    setEntries((e) => [
      ...e,
      {
        id: crypto.randomUUID(),
        project_id: projectId,
        bkp: '',
        arbeitsgattung: '',
        sort: e.length,
      },
    ]);
    setDirty(true);
  }
  function updateEntry(id: string, patch: Partial<UlEntry>) {
    setEntries((e) => e.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    setDirty(true);
  }
  function removeEntry(id: string) {
    if (!window.confirm(t.confirmDeleteEntry)) return;
    setEntries((e) => e.filter((x) => x.id !== id));
    setContractors((c) => c.filter((x) => x.entry_id !== id));
    setDeletedEntryIds((d) => [...d, id]); // DB kaskadiert auf Unternehmer
    setDirty(true);
  }

  // --- Unternehmer -----------------------------------------------------------
  function addContractor(entryId: string) {
    setContractors((c) => [
      ...c,
      {
        id: crypto.randomUUID(),
        project_id: projectId,
        entry_id: entryId,
        firma: '',
        adresse: '',
        ort: '',
        kontakt_person: '',
        mail: '',
        telefon: '',
        sort: c.filter((x) => x.entry_id === entryId).length,
      },
    ]);
    setDirty(true);
  }
  function updateContractor(id: string, patch: Partial<UlContractor>) {
    setContractors((c) => c.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    setDirty(true);
  }
  function removeContractor(id: string) {
    if (!window.confirm(t.confirmDeleteContractor)) return;
    setContractors((c) => c.filter((x) => x.id !== id));
    setDeletedContractorIds((d) => [...d, id]);
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();

    const bauherrRows = bauherr.map((c, i) => ({
      id: c.id,
      project_id: projectId,
      name: c.name,
      funktion: c.funktion,
      mail: c.mail,
      telefon: c.telefon,
      sort: i,
    }));
    const entryRows = entries.map((e, i) => ({
      id: e.id,
      project_id: projectId,
      bkp: e.bkp,
      arbeitsgattung: e.arbeitsgattung,
      sort: i,
    }));
    const contractorRows = entries.flatMap((e) =>
      contractorsOf(e.id).map((c, i) => ({
        id: c.id,
        project_id: projectId,
        entry_id: e.id,
        firma: c.firma,
        adresse: c.adresse,
        ort: c.ort,
        kontakt_person: c.kontakt_person,
        mail: c.mail,
        telefon: c.telefon,
        sort: i,
      })),
    );

    let failed = false;
    const run = async (fn: () => PromiseLike<{ error: unknown }>) => {
      if (failed) return;
      const { error } = await fn();
      if (error) failed = true;
    };

    // Erst Einträge (FK-Ziel), dann Unternehmer; Löschungen danach.
    if (bauherrRows.length)
      await run(() => supabase.from('ul_bauherr_contacts').upsert(bauherrRows));
    if (entryRows.length)
      await run(() => supabase.from('ul_entries').upsert(entryRows));
    if (contractorRows.length)
      await run(() => supabase.from('ul_contractors').upsert(contractorRows));

    if (deletedContractorIds.length)
      await run(() =>
        supabase.from('ul_contractors').delete().in('id', deletedContractorIds),
      );
    if (deletedEntryIds.length)
      await run(() =>
        supabase.from('ul_entries').delete().in('id', deletedEntryIds),
      );
    if (deletedContactIds.length)
      await run(() =>
        supabase.from('ul_bauherr_contacts').delete().in('id', deletedContactIds),
      );

    setSaving(false);
    if (failed) {
      showToast(texts.hub.saveErrorToast, 'error');
    } else {
      setDeletedContactIds([]);
      setDeletedEntryIds([]);
      setDeletedContractorIds([]);
      setDirty(false);
      showToast(texts.hub.savedToast);
    }
  }

  const sectionTitle =
    'display-title text-[15px] font-medium tracking-[0.14em] text-ink sm:text-lg sm:tracking-[0.16em]';
  const addBtn =
    'display-title inline-flex items-center gap-2 border border-dashed border-line px-4 py-2 text-[11px] font-medium tracking-[0.14em] text-primary transition-colors hover:border-primary hover:text-primary-dark';
  const removeBtn =
    'shrink-0 border border-line bg-white px-2 py-1 text-xs text-primary-dark transition-colors hover:border-error hover:text-error';

  return (
    <div className="flex min-h-screen flex-col">
      {/* Sticky Toolbar (wie Hub/BKK/LV) */}
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
            {texts.modules.unternehmerliste.label}
          </h1>
          <p className="display-title mt-1 truncate text-[10px] tracking-[0.22em] text-primary sm:text-xs sm:tracking-[0.26em]">
            {projectName}
          </p>
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl flex-1 px-5 pt-7 pb-14 sm:px-14 sm:pt-10">
        {/* Bauherrschaft */}
        <section className="mb-10 sm:mb-12">
          <div className="mb-4 flex items-baseline gap-3">
            <h2 className={sectionTitle}>{t.bauherrTitle}</h2>
            <span className="text-[11px] text-primary sm:text-xs">
              {bauherr.length}
            </span>
          </div>

          {bauherr.length === 0 && !canEdit && (
            <p className="text-sm text-primary">{t.noBauherr}</p>
          )}

          <div className="flex flex-col gap-3">
            {bauherr.map((c) => (
              <div
                key={c.id}
                className="flex items-start gap-3 border border-line bg-white p-3 sm:p-4"
              >
                <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field
                    label={t.name}
                    value={c.name}
                    readOnly={!canEdit}
                    onChange={(v) => updateContact(c.id, { name: v })}
                  />
                  <Field
                    label={t.funktion}
                    value={c.funktion}
                    readOnly={!canEdit}
                    onChange={(v) => updateContact(c.id, { funktion: v })}
                  />
                  <Field
                    label={t.mail}
                    value={c.mail}
                    readOnly={!canEdit}
                    onChange={(v) => updateContact(c.id, { mail: v })}
                  />
                  <Field
                    label={t.telefon}
                    value={c.telefon}
                    readOnly={!canEdit}
                    onChange={(v) => updateContact(c.id, { telefon: v })}
                  />
                </div>
                {canEdit && (
                  <button
                    type="button"
                    title={t.remove}
                    onClick={() => removeContact(c.id)}
                    className={removeBtn}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          {canEdit && (
            <button type="button" onClick={addContact} className={`${addBtn} mt-4`}>
              <span className="text-base font-light">+</span>
              {t.bauherrAdd.replace(/^\+\s*/, '')}
            </button>
          )}
        </section>

        {/* BKP-Einträge mit Unternehmern */}
        <section>
          <div className="mb-4 flex items-baseline gap-3">
            <h2 className={sectionTitle}>{t.entriesTitle}</h2>
            <span className="text-[11px] text-primary sm:text-xs">
              {entries.length}
            </span>
          </div>

          {entries.length === 0 && !canEdit && (
            <p className="text-sm text-primary">{t.noEntries}</p>
          )}

          <div className="flex flex-col gap-5">
            {entries.map((entry) => {
              const list = contractorsOf(entry.id);
              return (
                <div key={entry.id} className="border border-line bg-white">
                  {/* Kopf des BKP-Eintrags */}
                  <div className="flex items-start gap-3 border-b border-line bg-bg p-3 sm:p-4">
                    <div className="grid flex-1 gap-3 sm:grid-cols-[10rem_1fr]">
                      <Field
                        label={t.bkp}
                        value={entry.bkp}
                        readOnly={!canEdit}
                        placeholder="z.B. 211"
                        onChange={(v) => updateEntry(entry.id, { bkp: v })}
                      />
                      <Field
                        label={t.arbeitsgattung}
                        value={entry.arbeitsgattung}
                        readOnly={!canEdit}
                        onChange={(v) =>
                          updateEntry(entry.id, { arbeitsgattung: v })
                        }
                      />
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        title={t.remove}
                        onClick={() => removeEntry(entry.id)}
                        className={removeBtn}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Unternehmer */}
                  <div className="p-3 sm:p-4">
                    <div className="mb-2 flex items-baseline gap-2">
                      <span className="display-title text-[10px] font-medium tracking-[0.16em] text-primary-dark">
                        {t.contractorsCount}
                      </span>
                      <span className="text-[10px] text-primary">
                        {list.length}
                      </span>
                    </div>

                    {list.length === 0 && !canEdit && (
                      <p className="text-xs text-primary">{t.noContractors}</p>
                    )}

                    <div className="flex flex-col gap-2.5">
                      {list.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-start gap-3 border border-line p-3"
                        >
                          <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <Field
                              label={t.firma}
                              value={c.firma}
                              readOnly={!canEdit}
                              className="sm:col-span-2 lg:col-span-1"
                              onChange={(v) =>
                                updateContractor(c.id, { firma: v })
                              }
                            />
                            <Field
                              label={t.adresse}
                              value={c.adresse}
                              readOnly={!canEdit}
                              onChange={(v) =>
                                updateContractor(c.id, { adresse: v })
                              }
                            />
                            <Field
                              label={t.ort}
                              value={c.ort}
                              readOnly={!canEdit}
                              onChange={(v) => updateContractor(c.id, { ort: v })}
                            />
                            <Field
                              label={t.kontaktPerson}
                              value={c.kontakt_person}
                              readOnly={!canEdit}
                              onChange={(v) =>
                                updateContractor(c.id, { kontakt_person: v })
                              }
                            />
                            <Field
                              label={t.mail}
                              value={c.mail}
                              readOnly={!canEdit}
                              onChange={(v) =>
                                updateContractor(c.id, { mail: v })
                              }
                            />
                            <Field
                              label={t.telefon}
                              value={c.telefon}
                              readOnly={!canEdit}
                              onChange={(v) =>
                                updateContractor(c.id, { telefon: v })
                              }
                            />
                          </div>
                          {canEdit && (
                            <button
                              type="button"
                              title={t.remove}
                              onClick={() => removeContractor(c.id)}
                              className={removeBtn}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => addContractor(entry.id)}
                        className={`${addBtn} mt-3`}
                      >
                        <span className="text-base font-light">+</span>
                        {t.contractorAdd.replace(/^\+\s*/, '')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {canEdit && (
            <button type="button" onClick={addEntry} className={`${addBtn} mt-5`}>
              <span className="text-base font-light">+</span>
              {t.entryAdd.replace(/^\+\s*/, '')}
            </button>
          )}
        </section>
      </main>

      <ToastContainer toasts={toasts} />
    </div>
  );
}

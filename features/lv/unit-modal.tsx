'use client';

import { useState } from 'react';
import { texts } from '@/lib/texts';
import type { LvUnit } from '@/lib/types';

export interface WerkvertragOption {
  id: string;
  label: string;
}

export interface UnitModalResult {
  bkp: string;
  name: string;
  hidden: boolean;
  werkvertrag_document_id: string | null;
}

interface UnitModalProps {
  /** Bestehende Einheit (Bearbeiten) oder undefined (Neu = Custom) */
  initial?: LvUnit;
  /** BKP-Nummern der übrigen Einheiten (Duplikat-Prüfung) */
  takenBkps: string[];
  /** Hub-Dokumente der Kategorie Werkverträge (Auswahl für die Verknüpfung) */
  werkvertragDocs: WerkvertragOption[];
  onApply: (result: UnitModalResult) => void;
  onClose: () => void;
}

/**
 * Modal «Neue Vergabeeinheit / Vergabeeinheit bearbeiten» (analog Hub).
 * Die Werkvertrags-Verknüpfung wählt aus den Hub-Dokumenten der Kategorie
 * Werkverträge (werkvertrag_document_id).
 */
export function UnitModal({
  initial,
  takenBkps,
  werkvertragDocs,
  onApply,
  onClose,
}: UnitModalProps) {
  const [bkp, setBkp] = useState(initial?.bkp ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [hidden, setHidden] = useState(initial?.hidden ?? false);
  const [werkvertragId, setWerkvertragId] = useState(
    initial?.werkvertrag_document_id ?? '',
  );
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedBkp = bkp.trim();
    const trimmedName = name.trim();
    if (!trimmedBkp || !trimmedName) {
      setError(texts.modal.requiredMissing);
      return;
    }
    if (takenBkps.includes(trimmedBkp)) {
      setError(texts.lv.duplicateBkp);
      return;
    }
    onApply({
      bkp: trimmedBkp,
      name: trimmedName,
      hidden,
      werkvertrag_document_id: werkvertragId || null,
    });
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="display-title text-sm text-ink">
            {initial ? texts.lv.unitModalEdit : texts.lv.unitModalNew}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={texts.modal.cancel}
            className="text-primary hover:text-ink"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-primary-dark">
              {texts.lv.fieldBkp} *
            </span>
            <input
              type="text"
              value={bkp}
              onChange={(e) => setBkp(e.target.value)}
              className="border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-primary-dark">
              {texts.lv.fieldName} *
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-primary-dark">
              {texts.lv.fieldWerkvertrag}
            </span>
            <select
              value={werkvertragId}
              onChange={(e) => setWerkvertragId(e.target.value)}
              className="border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            >
              <option value="">{texts.lv.werkvertragNone}</option>
              {werkvertragDocs.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={hidden}
              onChange={(e) => setHidden(e.target.checked)}
            />
            {texts.lv.fieldHidden}
          </label>

          {error && (
            <p role="alert" className="text-xs text-error">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={onClose}
              className="border border-line bg-white px-4 py-2 text-sm text-primary-dark hover:border-primary"
            >
              {texts.modal.cancel}
            </button>
            <button
              type="submit"
              className="bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark"
            >
              {texts.modal.apply}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

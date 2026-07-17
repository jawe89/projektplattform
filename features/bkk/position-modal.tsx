'use client';

import { useState } from 'react';
import { formatRappen, parseChfToRappen } from '@/lib/format';
import { texts } from '@/lib/texts';
import type { BkkGroup, BkkPosition } from '@/lib/types';

export interface PositionModalResult {
  bkp: string;
  name: string;
  kv_mut_rp: number | null;
  group_id: string;
  hidden: boolean;
  notiz: string | null;
}

interface PositionModalProps {
  groups: BkkGroup[];
  /** Bestehende Position (Bearbeiten) oder undefined (Neu = Custom-Position) */
  initial?: BkkPosition;
  /** BKP-Nummern der übrigen Positionen (Duplikat-Prüfung) */
  takenBkps: string[];
  onApply: (result: PositionModalResult) => void;
  onClose: () => void;
}

/**
 * Modal «Neue Position / Position bearbeiten» (analog Hub-Modal).
 * Die Gruppe wird beim Tippen der BKP-Nr. mit der ersten Ziffer vorbelegt
 * und bleibt pro Position übersteuerbar (Entscheid 2). Baseline-Werte sind
 * Snapshots und hier nie editierbar – das Budget neuer Positionen läuft
 * über «KV mutiert» (leer = Wert der aktiven Baseline).
 */
export function PositionModal({
  groups,
  initial,
  takenBkps,
  onApply,
  onClose,
}: PositionModalProps) {
  const [bkp, setBkp] = useState(initial?.bkp ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [kvMut, setKvMut] = useState(
    initial?.kv_mut_rp != null ? formatRappen(initial.kv_mut_rp) : '',
  );
  const [groupId, setGroupId] = useState(initial?.group_id ?? '');
  const [groupTouched, setGroupTouched] = useState(Boolean(initial));
  const [hidden, setHidden] = useState(initial?.hidden ?? false);
  const [notiz, setNotiz] = useState(initial?.notiz ?? '');
  const [error, setError] = useState<string | null>(null);

  /** Gruppe aus der ersten BKP-Ziffer vorbelegen, solange nicht übersteuert */
  function handleBkpChange(value: string) {
    setBkp(value);
    if (groupTouched) return;
    const match = groups.find((g) => g.digit === value.trim().charAt(0));
    if (match) setGroupId(match.id);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedBkp = bkp.trim();
    const trimmedName = name.trim();
    if (!trimmedBkp || !trimmedName || !groupId) {
      setError(texts.modal.requiredMissing);
      return;
    }
    if (takenBkps.includes(trimmedBkp)) {
      setError(texts.bkk.duplicateBkp);
      return;
    }
    let kvMutRp: number | null = null;
    if (kvMut.trim() !== '') {
      kvMutRp = parseChfToRappen(kvMut);
      if (kvMutRp === null) {
        setError(texts.bkk.invalidAmount);
        return;
      }
    }
    onApply({
      bkp: trimmedBkp,
      name: trimmedName,
      kv_mut_rp: kvMutRp,
      group_id: groupId,
      hidden,
      notiz: notiz.trim() || null,
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
            {initial ? texts.bkk.positionModalEdit : texts.bkk.positionModalNew}
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
              {texts.bkk.fieldBkp} *
            </span>
            <input
              type="text"
              value={bkp}
              onChange={(e) => handleBkpChange(e.target.value)}
              className="border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-primary-dark">
              {texts.bkk.fieldName} *
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
              {texts.bkk.fieldKvMut}
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={kvMut}
              onChange={(e) => setKvMut(e.target.value)}
              className="border border-line bg-white px-3 py-2 text-right text-sm text-ink outline-none focus:border-accent"
            />
            <span className="text-xs text-primary">{texts.bkk.kvMutHint}</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-primary-dark">
              {texts.bkk.fieldGroup} *
            </span>
            <select
              value={groupId}
              onChange={(e) => {
                setGroupId(e.target.value);
                setGroupTouched(true);
              }}
              className="border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            >
              <option value="" />
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.digit} — {group.name}
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
            {texts.bkk.fieldHidden}
            <span className="text-xs text-primary">{texts.bkk.hiddenHint}</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-primary-dark">
              {texts.bkk.fieldNotiz}
            </span>
            <textarea
              value={notiz}
              rows={2}
              placeholder={texts.bkk.notizPlaceholder}
              onChange={(e) => setNotiz(e.target.value)}
              className="border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
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

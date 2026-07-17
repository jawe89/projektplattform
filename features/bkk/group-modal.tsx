'use client';

import { useState } from 'react';
import { texts } from '@/lib/texts';
import type { BkkGroup } from '@/lib/types';

export interface GroupModalResult {
  digit: string;
  name: string;
}

interface GroupModalProps {
  /** Bestehende Gruppe (Umbenennen; Ziffer fix) oder undefined (Neu) */
  initial?: BkkGroup;
  /** Bereits belegte Ziffern (Duplikat-Prüfung beim Anlegen) */
  takenDigits: string[];
  onApply: (result: GroupModalResult) => void;
  onClose: () => void;
}

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Modal «Neue Gruppe / Gruppe umbenennen» (schlanke Gruppenpflege, P2-M2). */
export function GroupModal({
  initial,
  takenDigits,
  onApply,
  onClose,
}: GroupModalProps) {
  const [digit, setDigit] = useState(initial?.digit ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!digit || !trimmedName) {
      setError(texts.modal.requiredMissing);
      return;
    }
    if (!initial && takenDigits.includes(digit)) {
      setError(texts.bkk.groups.digitTaken);
      return;
    }
    onApply({ digit, name: trimmedName });
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="display-title text-sm text-ink">
            {initial ? texts.bkk.groups.modalEdit : texts.bkk.groups.modalNew}
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
              {texts.bkk.groups.fieldDigit} *
            </span>
            {initial ? (
              <span className="border border-line bg-bg px-3 py-2 text-sm text-primary-dark">
                {initial.digit}
              </span>
            ) : (
              <select
                value={digit}
                onChange={(e) => setDigit(e.target.value)}
                className="border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              >
                <option value="" />
                {DIGITS.map((d) => (
                  <option key={d} value={d} disabled={takenDigits.includes(d)}>
                    {d}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-primary-dark">
              {texts.bkk.groups.fieldName} *
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
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

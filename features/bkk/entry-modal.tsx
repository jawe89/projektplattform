'use client';

import { useState } from 'react';
import { formatRappen, parseChfToRappen } from '@/lib/format';
import { texts } from '@/lib/texts';
import type { BkkEntryType } from '@/lib/types';

export interface EntryModalResult {
  betrag_rp: number;
  datum: string | null;
  unternehmer: string | null;
  notiz: string | null;
}

interface EntryModalProps {
  kind: BkkEntryType;
  /** Bestehender Eintrag (Bearbeiten) oder undefined (Neu) */
  initial?: EntryModalResult;
  onApply: (result: EntryModalResult) => void;
  onClose: () => void;
}

/**
 * Modal «Vertrag/Zahlung erfassen bzw. bearbeiten» (analog Hub-Modal).
 * Beträge werden exakt in Rappen übernommen – keine Rundung beim Speichern
 * (die 5-Rappen-Regel ist reine Anzeige-/Totalisierungsregel).
 */
export function EntryModal({ kind, initial, onApply, onClose }: EntryModalProps) {
  const [betrag, setBetrag] = useState(
    initial ? formatRappen(initial.betrag_rp) : '',
  );
  const [datum, setDatum] = useState(initial?.datum ?? '');
  const [unternehmer, setUnternehmer] = useState(initial?.unternehmer ?? '');
  const [notiz, setNotiz] = useState(initial?.notiz ?? '');
  const [error, setError] = useState<string | null>(null);

  const title = initial
    ? kind === 'vertrag'
      ? texts.bkk.entryModalEditVertrag
      : texts.bkk.entryModalEditZahlung
    : kind === 'vertrag'
      ? texts.bkk.entryModalNewVertrag
      : texts.bkk.entryModalNewZahlung;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const betragRp = parseChfToRappen(betrag);
    if (betragRp === null) {
      setError(texts.bkk.invalidAmount);
      return;
    }
    onApply({
      betrag_rp: betragRp,
      datum: datum || null,
      unternehmer: unternehmer.trim() || null,
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
          <h2 className="display-title text-sm text-ink">{title}</h2>
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
              {texts.bkk.fieldBetrag} *
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={betrag}
              onChange={(e) => setBetrag(e.target.value)}
              className="border border-line bg-white px-3 py-2 text-right text-sm text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-primary-dark">
              {texts.bkk.fieldDatum}
            </span>
            <input
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              className="border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-primary-dark">
              {texts.bkk.fieldUnternehmer}
            </span>
            <input
              type="text"
              value={unternehmer}
              onChange={(e) => setUnternehmer(e.target.value)}
              className="border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
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

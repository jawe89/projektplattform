'use client';

import { useState } from 'react';
import { ToastContainer, useToasts } from '@/components/ui/toast';
import { BKK_DEFAULT_GROUPS, MODULES } from '@/lib/modules';
import { createClient } from '@/lib/supabase/client';
import { texts } from '@/lib/texts';

/** Module pro Projekt aktivieren/deaktivieren (P2-M1). */
export function ModuleEinstellungen({
  projectId,
  enabledKeys,
}: {
  projectId: string;
  enabledKeys: string[];
}) {
  const [enabled, setEnabled] = useState<Set<string>>(new Set(enabledKeys));
  const [saving, setSaving] = useState(false);
  const { toasts, showToast } = useToasts();

  function toggle(key: string) {
    setEnabled((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const rows = MODULES.map((module) => ({
      project_id: projectId,
      module_key: module.key,
      enabled: enabled.has(module.key),
    }));
    const { error } = await supabase
      .from('project_modules')
      .upsert(rows, { onConflict: 'project_id,module_key' });

    // Beim Aktivieren der Baukostenkontrolle in einem Projekt ohne Gruppen
    // die Schweizer BKP-Hauptgruppen als Standard anlegen – damit ist ein
    // frisches Projekt sofort arbeitsfähig. Importe (P2-M4) bringen eigene
    // Gruppen mit und gleichen über die Ziffer ab.
    if (!error && enabled.has('baukostenkontrolle')) {
      const { count } = await supabase
        .from('bkk_groups')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId);
      if (count === 0) {
        await supabase.from('bkk_groups').insert(
          BKK_DEFAULT_GROUPS.map((group, index) => ({
            project_id: projectId,
            digit: group.digit,
            name: group.name,
            sort: index,
          })),
        );
      }
    }

    setSaving(false);
    showToast(
      error ? texts.hub.saveErrorToast : texts.hub.savedToast,
      error ? 'error' : 'ok',
    );
  }

  return (
    <div className="max-w-2xl">
      {/* Der frühere Intro-Text steht jetzt als Beschreibung im Sektionskopf */}
      <div className="flex flex-col gap-3">
        {MODULES.map((module) => (
          <label
            key={module.key}
            className="flex cursor-pointer items-center justify-between gap-4 border border-line bg-white p-4"
          >
            <span>
              <span className="block text-sm font-medium text-ink">
                {module.label}
              </span>
              <span className="block text-xs text-primary">
                {module.description}
              </span>
            </span>
            <span className="display-title flex shrink-0 items-center gap-2 text-[10px] font-medium tracking-[0.12em] text-primary-dark">
              <input
                type="checkbox"
                checked={enabled.has(module.key)}
                onChange={() => toggle(module.key)}
                className="accent-accent"
              />
              {texts.admin.module.enabled}
            </span>
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-primary">{texts.admin.module.hint}</p>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="display-title mt-4 bg-accent px-5 py-2.5 text-[12px] font-medium tracking-[0.14em] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {texts.common.save}
      </button>
      <ToastContainer toasts={toasts} />
    </div>
  );
}

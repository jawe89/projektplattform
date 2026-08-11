'use client';

import { useMemo, useState } from 'react';
import { ToastContainer, useToasts } from '@/components/ui/toast';
import { createClient } from '@/lib/supabase/client';
import { texts } from '@/lib/texts';
import type {
  Category,
  DocumentEntry,
  DocumentRoleAccess,
  Role,
  RoleCategoryAccess,
} from '@/lib/types';

type AdminDoc = Pick<
  DocumentEntry,
  'id' | 'category_id' | 'parent_id' | 'data' | 'sort'
>;

/** Badge + Titel aus dem Feld-Schema ableiten (wie im Hub). */
function docLabel(doc: AdminDoc, category: Category): { badge: string; title: string } {
  const fields = category.field_schema.fields ?? [];
  const badgeField = fields.find((f) => f.badge);
  const titleField = fields.find((f) => !f.badge);
  return {
    badge: badgeField ? (doc.data[badgeField.key] ?? '') : '',
    title: titleField ? (doc.data[titleField.key] ?? '') : '',
  };
}

/**
 * Dokumentgenaue Sicht-Freigabe pro Kategorie (0015). «Alle» = keine
 * Einschränkung (erbt Kategorie-Sichtbarkeit); Häkchen entfernen sperrt das
 * Dokument für die Rolle. Es werden nur Rollen mit Kategorie-Sichtbarkeit als
 * Spalten gezeigt – andere Rollen sehen die Kategorie ohnehin nicht.
 */
export function DokumentfreigabenMatrix({
  roles,
  categories,
  documents,
  categoryAccess,
  documentAccess,
}: {
  roles: Role[];
  categories: Category[];
  documents: AdminDoc[];
  categoryAccess: RoleCategoryAccess[];
  documentAccess: DocumentRoleAccess[];
}) {
  const { toasts, showToast } = useToasts();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Ausgangszustand für den Abgleich beim Speichern (unveränderlich).
  const initialKeys = useMemo(
    () => new Set(documentAccess.map((r) => `${r.document_id}:${r.role_id}`)),
    [documentAccess],
  );

  // restrictions: docId → erlaubte Rollen. Fehlt der Key → «Alle» (erbt).
  const [restrictions, setRestrictions] = useState<Map<string, Set<string>>>(
    () => {
      const map = new Map<string, Set<string>>();
      for (const row of documentAccess) {
        const set = map.get(row.document_id) ?? new Set<string>();
        set.add(row.role_id);
        map.set(row.document_id, set);
      }
      return map;
    },
  );

  const categoriesWithDocs = categories.filter((c) =>
    documents.some((d) => d.category_id === c.id),
  );
  const [selectedId, setSelectedId] = useState<string>(
    () => categoriesWithDocs[0]?.id ?? categories[0]?.id ?? '',
  );
  const selected = categories.find((c) => c.id === selectedId) ?? null;

  // Spalten = Rollen mit Sehen-Recht auf der gewählten Kategorie
  const viewRoles = useMemo(() => {
    if (!selected) return [] as Role[];
    const allowed = new Set(
      categoryAccess
        .filter((a) => a.category_id === selected.id && a.can_view)
        .map((a) => a.role_id),
    );
    return roles.filter((r) => allowed.has(r.id));
  }, [selected, categoryAccess, roles]);

  const docs = useMemo(
    () => (selected ? documents.filter((d) => d.category_id === selected.id) : []),
    [selected, documents],
  );

  function isChecked(docId: string, roleId: string): boolean {
    const set = restrictions.get(docId);
    return set ? set.has(roleId) : true; // «Alle» → angehakt
  }

  function isRestricted(docId: string): boolean {
    return restrictions.has(docId);
  }

  function toggle(docId: string, roleId: string, checked: boolean) {
    setRestrictions((current) => {
      const next = new Map(current);
      // Ausgangsmenge: bestehende Einschränkung ODER «Alle Sehen-Rollen»
      const base =
        next.get(docId) ?? new Set(viewRoles.map((r) => r.id));
      const set = new Set(base);
      if (checked) set.add(roleId);
      else set.delete(roleId);

      const allChecked = viewRoles.every((r) => set.has(r.id));
      if (allChecked) {
        next.delete(docId); // wieder «Alle» (erbt Kategorie-Sichtbarkeit)
      } else {
        next.set(docId, set);
      }
      return next;
    });
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();

    // Ziel-Zeilen aus dem aktuellen Zustand (nur eingeschränkte Dokumente
    // haben Zeilen; «Alle» = keine Zeile).
    const desired: { document_id: string; role_id: string }[] = [];
    const desiredKeys = new Set<string>();
    for (const [docId, set] of restrictions) {
      for (const roleId of set) {
        desired.push({ document_id: docId, role_id: roleId });
        desiredKeys.add(`${docId}:${roleId}`);
      }
    }

    let failed = false;

    // 1. Gewünschte Zeilen anlegen (idempotent) – Zugriff wird nie zu spät
    //    eingeschränkt, weil Zeilen erst hinzukommen.
    if (desired.length > 0) {
      const { error } = await supabase
        .from('document_role_access')
        .upsert(desired, { onConflict: 'document_id,role_id' });
      if (error) failed = true;
    }

    // 2. Verwaiste Zeilen entfernen (früher gesetzt, jetzt nicht mehr gewünscht).
    if (!failed) {
      const stale = [...initialKeys].filter((k) => !desiredKeys.has(k));
      for (const key of stale) {
        const [documentId, roleId] = key.split(':');
        const { error } = await supabase
          .from('document_role_access')
          .delete()
          .eq('document_id', documentId)
          .eq('role_id', roleId);
        if (error) {
          failed = true;
          break;
        }
      }
    }

    setSaving(false);
    if (failed) {
      showToast(texts.hub.saveErrorToast, 'error');
    } else {
      setDirty(false);
      showToast(texts.hub.savedToast);
    }
  }

  const t = texts.admin.dokumentfreigaben;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-relaxed text-primary">{t.legend}</p>

      {categoriesWithDocs.length === 0 ? (
        <p className="border border-line bg-white px-4 py-6 text-sm text-primary">
          {categories.length === 0 ? t.noCategories : t.noDocuments}
        </p>
      ) : (
        <>
          {/* Kategorie-Auswahl */}
          <div className="flex flex-wrap gap-2">
            {categoriesWithDocs.map((category) => {
              const active = category.id === selectedId;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setSelectedId(category.id)}
                  className={`display-title border px-3.5 py-1.5 text-[11px] font-medium tracking-[0.12em] transition-colors ${
                    active
                      ? 'border-ink bg-ink text-white'
                      : 'border-line bg-white text-primary-dark hover:border-primary'
                  }`}
                >
                  {category.label}
                </button>
              );
            })}
          </div>

          {selected && viewRoles.length === 0 ? (
            <p className="border border-line bg-white px-4 py-6 text-sm text-primary">
              {t.noViewRoles}
            </p>
          ) : (
            <div className="overflow-x-auto border border-line bg-white">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-b border-line bg-bg">
                    <th className="display-title sticky left-0 z-10 border-r border-line bg-bg px-4 py-3 text-left text-[11px] font-medium tracking-[0.16em] text-primary-dark">
                      {t.docHeader}
                    </th>
                    {viewRoles.map((role) => (
                      <th
                        key={role.id}
                        className="display-title border-l border-line/60 px-3 py-3 text-center text-[10px] font-medium tracking-[0.12em] text-primary-dark"
                      >
                        {role.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc) => {
                    const label = selected ? docLabel(doc, selected) : { badge: '', title: '' };
                    const restricted = isRestricted(doc.id);
                    return (
                      <tr
                        key={doc.id}
                        className="border-b border-line last:border-b-0"
                      >
                        <td className="sticky left-0 z-10 border-r border-line bg-white px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {label.badge && (
                              <span className="display-title inline-block shrink-0 border border-line px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.1em] text-primary-dark">
                                {label.badge}
                              </span>
                            )}
                            <span className="truncate text-[13px] text-ink">
                              {label.title || '—'}
                            </span>
                            <span
                              title={
                                restricted ? t.restrictedHint : t.inheritHint
                              }
                              className={`ml-auto shrink-0 border px-1.5 py-0.5 text-[9px] tracking-[0.08em] ${
                                restricted
                                  ? 'border-warn/50 text-warn'
                                  : 'border-line text-primary'
                              }`}
                            >
                              {restricted ? t.restrictedBadge : t.inheritBadge}
                            </span>
                          </div>
                        </td>
                        {viewRoles.map((role) => (
                          <td
                            key={role.id}
                            className="border-l border-line/60 px-3 py-2.5 text-center"
                          >
                            <input
                              type="checkbox"
                              title={`${role.name} – ${t.access}`}
                              checked={isChecked(doc.id, role.id)}
                              onChange={(e) =>
                                toggle(doc.id, role.id, e.target.checked)
                              }
                              className="accent-accent"
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center gap-3">
            <span
              className={`text-[11px] font-semibold sm:text-xs ${
                dirty ? 'text-warn' : 'text-accent'
              }`}
            >
              {dirty ? texts.common.unsaved : texts.common.saved}
            </span>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || saving}
              className="display-title ml-auto bg-accent px-5 py-2.5 text-[12px] font-medium tracking-[0.14em] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {texts.common.save}
            </button>
          </div>
        </>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  );
}

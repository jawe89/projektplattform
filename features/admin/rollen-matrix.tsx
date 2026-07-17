'use client';

import { useState } from 'react';
import { ToastContainer, useToasts } from '@/components/ui/toast';
import { createClient } from '@/lib/supabase/client';
import { texts } from '@/lib/texts';
import type { Category, Role, RoleCategoryAccess } from '@/lib/types';

interface EditableRole {
  id: string;
  name: string;
  isNew: boolean;
}

interface AccessEntry {
  view: boolean;
  upload: boolean;
}

/** Rollen + Sichtbarkeits-/Upload-Matrix als Checkbox-Grid. */
export function RollenMatrix({
  projectId,
  roles,
  categories,
  access,
}: {
  projectId: string;
  roles: Role[];
  categories: Category[];
  access: RoleCategoryAccess[];
}) {
  const [items, setItems] = useState<EditableRole[]>(
    roles.map((r) => ({ id: r.id, name: r.name, isNew: false })),
  );
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<Map<string, AccessEntry>>(() => {
    const map = new Map<string, AccessEntry>();
    for (const row of access) {
      map.set(`${row.role_id}:${row.category_id}`, {
        view: row.can_view,
        upload: row.can_upload,
      });
    }
    return map;
  });
  const [newRoleName, setNewRoleName] = useState('');
  const [saving, setSaving] = useState(false);
  const { toasts, showToast } = useToasts();

  function entry(roleId: string, categoryId: string): AccessEntry {
    return (
      matrix.get(`${roleId}:${categoryId}`) ?? { view: false, upload: false }
    );
  }

  function setEntry(roleId: string, categoryId: string, patch: Partial<AccessEntry>) {
    setMatrix((current) => {
      const next = new Map(current);
      const existing = entry(roleId, categoryId);
      const updated = { ...existing, ...patch };
      // Hochladen ohne Sehen ergibt keinen Sinn
      if (patch.upload) updated.view = true;
      if (patch.view === false) updated.upload = false;
      next.set(`${roleId}:${categoryId}`, updated);
      return next;
    });
  }

  function addRole() {
    const name = newRoleName.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    setItems((current) => [...current, { id, name, isNew: true }]);
    // Default: alles sichtbar, kein Upload
    setMatrix((current) => {
      const next = new Map(current);
      for (const category of categories) {
        next.set(`${id}:${category.id}`, { view: true, upload: false });
      }
      return next;
    });
    setNewRoleName('');
  }

  function removeRole(role: EditableRole) {
    if (!window.confirm(texts.admin.rollen.confirmDelete)) return;
    if (!role.isNew) setDeletedIds((ids) => [...ids, role.id]);
    setItems((current) => current.filter((r) => r.id !== role.id));
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    let failed = false;
    let failMessage: string = texts.hub.saveErrorToast;

    if (deletedIds.length > 0) {
      const { error } = await supabase
        .from('roles')
        .delete()
        .in('id', deletedIds);
      if (error) {
        failed = true;
        failMessage = texts.admin.rollen.deleteError;
      }
    }

    if (!failed && items.length > 0) {
      const { error } = await supabase.from('roles').upsert(
        items.map((role) => ({
          id: role.id,
          project_id: projectId,
          name: role.name,
        })),
      );
      if (error) failed = true;
    }

    if (!failed) {
      const accessRows = items.flatMap((role) =>
        categories.map((category) => {
          const value = entry(role.id, category.id);
          return {
            role_id: role.id,
            category_id: category.id,
            can_view: value.view,
            can_upload: value.upload,
          };
        }),
      );
      if (accessRows.length > 0) {
        const { error } = await supabase
          .from('role_category_access')
          .upsert(accessRows, { onConflict: 'role_id,category_id' });
        if (error) failed = true;
      }
    }

    setSaving(false);
    if (failed) {
      showToast(failMessage, 'error');
    } else {
      setDeletedIds([]);
      setItems((current) => current.map((r) => ({ ...r, isNew: false })));
      showToast(texts.hub.savedToast);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto border border-line bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="display-title px-4 py-3 text-left text-xs font-normal text-primary">
                {texts.admin.rollen.roleName}
              </th>
              {categories.map((category) => (
                <th
                  key={category.id}
                  className="display-title px-3 py-3 text-center text-xs font-normal text-primary"
                >
                  {category.label}
                  <span className="mt-1 flex justify-center gap-3 text-[9px] normal-case">
                    <span>{texts.admin.rollen.view}</span>
                    <span>{texts.admin.rollen.upload}</span>
                  </span>
                </th>
              ))}
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {items.map((role) => (
              <tr key={role.id} className="border-b border-line last:border-b-0">
                <td className="px-4 py-2 font-medium text-ink">{role.name}</td>
                {categories.map((category) => {
                  const value = entry(role.id, category.id);
                  return (
                    <td key={category.id} className="px-3 py-2 text-center">
                      <span className="flex justify-center gap-4">
                        <input
                          type="checkbox"
                          title={texts.admin.rollen.view}
                          checked={value.view}
                          onChange={(e) =>
                            setEntry(role.id, category.id, {
                              view: e.target.checked,
                            })
                          }
                        />
                        <input
                          type="checkbox"
                          title={texts.admin.rollen.upload}
                          checked={value.upload}
                          onChange={(e) =>
                            setEntry(role.id, category.id, {
                              upload: e.target.checked,
                            })
                          }
                        />
                      </span>
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-center">
                  <button
                    type="button"
                    title={texts.common.delete}
                    onClick={() => removeRole(role)}
                    className="border border-line bg-white px-2 py-0.5 text-xs text-primary-dark hover:border-error hover:text-error"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3">
        <input
          value={newRoleName}
          onChange={(e) => setNewRoleName(e.target.value)}
          placeholder={texts.admin.rollen.roleName}
          className="border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={addRole}
          className="border border-dashed border-line px-4 py-2 text-sm text-primary hover:border-accent hover:text-accent"
        >
          {texts.admin.rollen.add}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-60"
        >
          {texts.common.save}
        </button>
      </div>

      <ToastContainer toasts={toasts} />
    </div>
  );
}

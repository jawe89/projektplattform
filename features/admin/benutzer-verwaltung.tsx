'use client';

import { useActionState, useEffect, useState } from 'react';
import { ToastContainer, useToasts } from '@/components/ui/toast';
import {
  inviteUser,
  removeMember,
  type InviteState,
} from '@/features/admin/actions';
import { texts } from '@/lib/texts';
import type { Role } from '@/lib/types';

export interface MemberRow {
  userId: string;
  email: string;
  roleName: string;
  isProjectAdmin: boolean;
}

const initialState: InviteState = {};

/** Benutzerliste + Einladung (Supabase-Invite) + Deaktivieren. */
export function BenutzerVerwaltung({
  projectId,
  roles,
  members,
}: {
  projectId: string;
  roles: Role[];
  members: MemberRow[];
}) {
  // Reload/Navigation nach dem Commit via useEffect – nie im Action-Aufruf
  // (siehe CLAUDE.md-Stolperfalle).
  const [state, formAction, pending] = useActionState(inviteUser, initialState);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const { toasts, showToast } = useToasts();

  useEffect(() => {
    // Liste neu laden (Server-Daten); bei Invite-Link bleibt die Seite stehen,
    // damit der Link kopiert werden kann.
    if ((state.success && !state.inviteLink) || removed) {
      window.location.reload();
    }
  }, [state.success, state.inviteLink, removed]);

  const inputClass =
    'border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent';

  async function handleRemove(member: MemberRow) {
    if (!window.confirm(texts.admin.benutzer.confirmDeactivate)) return;
    setRemoving(member.userId);
    const result = await removeMember(projectId, member.userId);
    setRemoving(null);
    if (result.error) {
      showToast(texts.hub.saveErrorToast, 'error');
    } else {
      setRemoved(true); // Reload im Effekt, nicht im Handler
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Mitgliederliste */}
      <div className="border border-line bg-white">
        {members.length === 0 ? (
          <p className="px-4 py-6 text-sm text-primary">
            {texts.admin.benutzer.noMembers}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="display-title px-4 py-3 text-xs font-normal text-primary">
                  {texts.admin.benutzer.email}
                </th>
                <th className="display-title px-4 py-3 text-xs font-normal text-primary">
                  {texts.admin.benutzer.role}
                </th>
                <th className="display-title px-4 py-3 text-xs font-normal text-primary">
                  {texts.admin.benutzer.projectAdmin}
                </th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr
                  key={member.userId}
                  className="border-b border-line last:border-b-0"
                >
                  <td className="px-4 py-3 text-ink">{member.email}</td>
                  <td className="px-4 py-3 text-primary-dark">
                    {member.roleName}
                  </td>
                  <td className="px-4 py-3 text-primary-dark">
                    {member.isProjectAdmin ? '✓' : '–'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={removing === member.userId}
                      onClick={() => handleRemove(member)}
                      className="border border-line bg-white px-3 py-1 text-xs text-primary-dark hover:border-error hover:text-error disabled:opacity-60"
                    >
                      {texts.admin.benutzer.deactivate}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Einladung */}
      <div className="h-fit border border-line bg-white p-5">
        <h2 className="display-title mb-4 text-sm text-ink">
          {texts.admin.benutzer.invite}
        </h2>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="projectId" value={projectId} />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-primary-dark">
              {texts.admin.benutzer.email}
            </span>
            <input type="email" name="email" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-primary-dark">
              {texts.admin.benutzer.role}
            </span>
            <select name="roleId" required className={inputClass}>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-primary-dark">
            <input type="checkbox" name="isProjectAdmin" />
            {texts.admin.benutzer.projectAdmin}
          </label>
          {state.error && (
            <p role="alert" className="text-xs text-error">
              {state.error}
            </p>
          )}
          {state.success && (
            <p className="text-xs text-accent">{state.success}</p>
          )}
          {state.warning && (
            <p role="status" className="text-xs text-warn">
              {state.warning}
            </p>
          )}
          {state.inviteLink && (
            <div className="border border-line bg-bg p-2">
              <p className="mb-1 text-xs text-primary-dark">
                {texts.admin.benutzer.inviteLinkLabel}
              </p>
              <code className="block text-[10px] break-all text-ink">
                {state.inviteLink}
              </code>
            </div>
          )}
          <button
            type="submit"
            disabled={pending}
            className="bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-60"
          >
            {pending
              ? texts.admin.benutzer.inviting
              : texts.admin.benutzer.invite}
          </button>
        </form>
      </div>

      <ToastContainer toasts={toasts} />
    </div>
  );
}

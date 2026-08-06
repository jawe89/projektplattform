'use client';

import { useActionState, useEffect, useState } from 'react';
import { ToastContainer, useToasts } from '@/components/ui/toast';
import {
  inviteUser,
  removeMember,
  resendInvite,
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
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendLink, setResendLink] = useState<{
    email: string;
    link: string;
  } | null>(null);
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

  async function handleResend(member: MemberRow) {
    setResendingId(member.userId);
    setResendLink(null);
    const result = await resendInvite(projectId, member.userId);
    setResendingId(null);
    if (result.error) {
      showToast(texts.admin.benutzer.resendError, 'error');
    } else if (result.info) {
      showToast(result.info);
    } else if (result.inviteLink) {
      setResendLink({ email: member.email, link: result.inviteLink });
    }
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      showToast(texts.admin.benutzer.copied);
    } catch {
      showToast(texts.hub.saveErrorToast, 'error');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Frischer Einladungslink (nach «erneut senden») – zum Kopieren */}
      {resendLink && (
        <div className="border border-accent border-l-[3px] border-l-accent bg-bg p-4">
          <div className="mb-1 flex items-center justify-between gap-3">
            <p className="text-xs text-primary-dark">
              {texts.admin.benutzer.resendLinkLabel}{' '}
              <span className="font-semibold text-ink">{resendLink.email}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => copyLink(resendLink.link)}
                className="display-title bg-accent px-3 py-1.5 text-[11px] font-medium tracking-[0.12em] text-white transition-opacity hover:opacity-90"
              >
                {texts.admin.benutzer.copyLink}
              </button>
              <button
                type="button"
                onClick={() => setResendLink(null)}
                className="border border-line bg-white px-2 py-1.5 text-[11px] text-primary-dark hover:border-primary"
              >
                ✕
              </button>
            </div>
          </div>
          <code className="block text-[10px] break-all text-ink">
            {resendLink.link}
          </code>
        </div>
      )}

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
              <tr className="border-b border-line bg-bg text-left">
                <th className="display-title px-4 py-3 text-[11px] font-medium tracking-[0.16em] text-primary-dark">
                  {texts.admin.benutzer.email}
                </th>
                <th className="display-title px-4 py-3 text-[11px] font-medium tracking-[0.16em] text-primary-dark">
                  {texts.admin.benutzer.role}
                </th>
                <th className="display-title px-4 py-3 text-[11px] font-medium tracking-[0.16em] text-primary-dark">
                  {texts.admin.benutzer.projectAdmin}
                </th>
                <th className="w-64" />
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
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        disabled={resendingId === member.userId}
                        onClick={() => handleResend(member)}
                        className="border border-line bg-white px-3 py-1 text-xs text-primary-dark hover:border-accent hover:text-accent disabled:opacity-60"
                      >
                        {resendingId === member.userId
                          ? texts.admin.benutzer.resending
                          : texts.admin.benutzer.resend}
                      </button>
                      <button
                        type="button"
                        disabled={removing === member.userId}
                        onClick={() => handleRemove(member)}
                        className="border border-line bg-white px-3 py-1 text-xs text-primary-dark hover:border-error hover:text-error disabled:opacity-60"
                      >
                        {texts.admin.benutzer.deactivate}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Einladung */}
      <div className="h-fit border border-line bg-white p-5">
        <h2 className="display-title mb-4 border-b border-line pb-2 text-[11px] font-medium tracking-[0.18em] text-primary-dark">
          {texts.admin.benutzer.invite}
        </h2>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="projectId" value={projectId} />
          <label className="flex flex-col gap-1">
            <span className="display-title text-[10px] font-medium tracking-[0.12em] text-primary-dark">
              {texts.admin.benutzer.email}
            </span>
            <input type="email" name="email" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="display-title text-[10px] font-medium tracking-[0.12em] text-primary-dark">
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
            <input
              type="checkbox"
              name="isProjectAdmin"
              className="accent-accent"
            />
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
            className="display-title bg-accent px-5 py-2.5 text-[12px] font-medium tracking-[0.14em] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending
              ? texts.admin.benutzer.inviting
              : texts.admin.benutzer.invite}
          </button>
        </form>
      </div>
      </div>

      <ToastContainer toasts={toasts} />
    </div>
  );
}

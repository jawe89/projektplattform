'use server';

import { sanitizeMailText } from '@/lib/mail-text';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { texts } from '@/lib/texts';
import type { AuthFormState } from '@/features/auth/actions';

/**
 * Admin-Server-Actions. Wie im Rest der App: kein redirect() in Actions
 * (Tenant-/Admin-Middleware läuft sonst nicht) – Actions liefern redirectTo
 * zurück, der Client navigiert hart.
 */

/** Prüft serverseitig, ob der eingeloggte User Plattform-Admin ist. */
async function assertPlatformAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: adminRow } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  return adminRow ? { supabase, user } : null;
}

// ---------------------------------------------------------------------------
// Login auf der Admin-Domain
// ---------------------------------------------------------------------------

export async function signInAdmin(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: texts.auth.invalidCredentials };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) return { error: texts.auth.invalidCredentials };

  const { data: adminRow } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', data.user.id)
    .maybeSingle();

  if (!adminRow) {
    await supabase.auth.signOut();
    return { error: texts.admin.noAccess };
  }

  return { redirectTo: '/' };
}

// ---------------------------------------------------------------------------
// Neues Projekt (optional aus Vorlage dupliziert)
// ---------------------------------------------------------------------------

export interface CreateProjectState {
  error?: string;
  redirectTo?: string;
}

export async function createProject(
  _prevState: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  const ctx = await assertPlatformAdmin();
  if (!ctx) return { error: texts.admin.noAccess };
  const { supabase } = ctx;

  const name = String(formData.get('name') ?? '').trim();
  const projectNo = String(formData.get('projectNo') ?? '').trim();
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase();
  const domain = String(formData.get('domain') ?? '').trim().toLowerCase();
  const templateId = String(formData.get('templateId') ?? '');

  if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    return { error: texts.admin.createError };
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      name,
      slug,
      project_no: projectNo || null,
      domain: domain || null,
      status: 'active',
      landing: { subtitle: projectNo || '', description: '', infoCells: [] },
    })
    .select('id')
    .single();
  if (projectError || !project) {
    return { error: texts.admin.createError };
  }
  const projectId = project.id as string;

  if (templateId) {
    // Vorlage: Branding, Kategorien, Rollen und Matrix übernehmen –
    // keine Dokumente, keine Mitglieder.
    const { data: templateBranding } = await supabase
      .from('project_branding')
      .select('*')
      .eq('project_id', templateId)
      .maybeSingle();
    await supabase.from('project_branding').insert({
      ...(templateBranding ?? {}),
      project_id: projectId,
      // Logo/Hero der Vorlage nicht übernehmen (fremder Storage-Pfad)
      management_logo_path: null,
      hero_path: null,
    });

    const { data: templateCategories } = await supabase
      .from('categories')
      .select('*')
      .eq('project_id', templateId)
      .order('sort');
    const categoryIdMap = new Map<string, string>();
    for (const category of templateCategories ?? []) {
      const { data: created } = await supabase
        .from('categories')
        .insert({
          project_id: projectId,
          key: category.key,
          label: category.label,
          add_label: category.add_label,
          layout: category.layout,
          sort: category.sort,
          field_schema: category.field_schema,
        })
        .select('id')
        .single();
      if (created) categoryIdMap.set(category.id, created.id);
    }

    const { data: templateRoles } = await supabase
      .from('roles')
      .select('*')
      .eq('project_id', templateId);
    const roleIdMap = new Map<string, string>();
    for (const role of templateRoles ?? []) {
      const { data: created } = await supabase
        .from('roles')
        .insert({ project_id: projectId, name: role.name })
        .select('id')
        .single();
      if (created) roleIdMap.set(role.id, created.id);
    }

    if (roleIdMap.size > 0 && categoryIdMap.size > 0) {
      const { data: templateAccess } = await supabase
        .from('role_category_access')
        .select('*')
        .in('role_id', [...roleIdMap.keys()]);
      const accessRows = (templateAccess ?? [])
        .filter((row) => categoryIdMap.has(row.category_id))
        .map((row) => ({
          role_id: roleIdMap.get(row.role_id)!,
          category_id: categoryIdMap.get(row.category_id)!,
          can_view: row.can_view,
          can_upload: row.can_upload,
        }));
      if (accessRows.length > 0) {
        await supabase.from('role_category_access').insert(accessRows);
      }
    }
  } else {
    // Leeres Branding anlegen, damit die Branding-Seite editierbar ist
    await supabase.from('project_branding').insert({ project_id: projectId });
  }

  return { redirectTo: `/projects/${projectId}/daten` };
}

// ---------------------------------------------------------------------------
// Benutzer einladen / entfernen (Service-Role nur serverseitig)
// ---------------------------------------------------------------------------

export interface InviteState {
  error?: string;
  success?: string;
  /** Aktion erfolgreich, aber mit Einschränkung (z.B. keine Mail versendet) */
  warning?: string;
  inviteLink?: string;
}

export async function inviteUser(
  _prevState: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const ctx = await assertPlatformAdmin();
  if (!ctx) return { error: texts.admin.noAccess };

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const projectId = String(formData.get('projectId') ?? '');
  const roleId = String(formData.get('roleId') ?? '');
  const isProjectAdmin = formData.get('isProjectAdmin') === 'on';
  if (!email || !projectId || !roleId) {
    return { error: texts.admin.benutzer.inviteError };
  }

  const admin = createAdminClient();
  let userId: string | null = null;
  let inviteLink: string | undefined;
  let existingUser = false;

  // Projektbezug für die Invite-Mail (Metadaten → Mailvorlage, siehe
  // docs/SUPABASE-MAILVORLAGEN.md) und den Fallback-Link
  const { data: project } = await ctx.supabase
    .from('projects')
    .select('name, slug, domain')
    .eq('id', projectId)
    .single();
  const { data: branding } = await ctx.supabase
    .from('project_branding')
    .select('management_name')
    .eq('project_id', projectId)
    .maybeSingle();
  // Namen für die Mail bereinigen (Supabase HTML-maskiert auch den Betreff –
  // siehe lib/mail-text.ts); die Originalnamen in der DB bleiben unverändert.
  const inviteData = {
    project_name: sanitizeMailText(project?.name ?? ''),
    management_name: sanitizeMailText(branding?.management_name ?? ''),
    project_domain: project?.domain ?? '',
  };

  // 1. Versuch: Supabase-Invite-Mail (mit Projekt-Metadaten)
  const { data: invited, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, { data: inviteData });
  if (!inviteError) {
    userId = invited.user.id;
  } else {
    // 2. Versuch: Invite-Link generieren (kein Mailversand nötig) –
    // deckt fehlendes SMTP ab.
    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { data: inviteData },
      });
    if (!linkError && linkData.user) {
      userId = linkData.user.id;
      const origin = project?.domain
        ? `https://${project.domain}`
        : `http://${project?.slug}.localhost:3000`;
      inviteLink = `${origin}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=invite&next=/passwort-neu`;
    } else {
      // Konto existiert bereits → nur Mitgliedschaft anlegen. Supabase
      // verschickt in diesem Fall KEINE Mail – das wird dem Admin unten
      // explizit zurückgemeldet (kein stilles Verhalten).
      const { data: list } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      const existing = list?.users.find(
        (u) => u.email?.toLowerCase() === email,
      );
      if (!existing) return { error: texts.admin.benutzer.inviteError };
      userId = existing.id;
      existingUser = true;
    }
  }

  const { error: memberError } = await admin.from('project_members').upsert(
    {
      user_id: userId,
      project_id: projectId,
      role_id: roleId,
      is_project_admin: isProjectAdmin,
    },
    { onConflict: 'user_id,project_id' },
  );
  if (memberError) return { error: texts.admin.benutzer.inviteError };

  if (existingUser) {
    return { warning: texts.admin.benutzer.inviteExisting };
  }
  return { success: texts.admin.benutzer.inviteSuccess, inviteLink };
}

export async function removeMember(
  projectId: string,
  userId: string,
): Promise<{ error?: string }> {
  const ctx = await assertPlatformAdmin();
  if (!ctx) return { error: texts.admin.noAccess };

  const { error } = await ctx.supabase
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId);
  return error ? { error: error.message } : {};
}

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { LogoutButton } from '@/features/auth/logout-button';
import { BkkClient } from '@/features/bkk/bkk-client';
import { formatDate } from '@/lib/format';
import { isModuleKey, MODULES } from '@/lib/modules';
import { createClient } from '@/lib/supabase/server';
import { getTenantData } from '@/lib/tenant';
import { texts } from '@/lib/texts';
import type {
  BkkEntry,
  BkkGroup,
  BkkPosition,
  ProjectModule,
  RoleModuleAccess,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Modul-Seite. Serverseitige Prüfkette: Login → Projektmitgliedschaft →
 * Modul aktiviert → Rollen-Freigabe (can_view) bzw. Projekt-Admin. Nicht
 * freigegebene oder deaktivierte Module sind schlicht «nicht gefunden».
 * Baukostenkontrolle rendert die BKK-Oberfläche (P2-M2), das
 * Leistungsverzeichnis bleibt bis P2-M3 ein Platzhalter.
 */
export default async function ModulePage({
  params,
}: {
  params: Promise<{ projectId: string; moduleKey: string }>;
}) {
  const { projectId, moduleKey } = await params;
  if (!isModuleKey(moduleKey)) notFound();
  const moduleInfo = MODULES.find((m) => m.key === moduleKey)!;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('project_members')
    .select('role_id, is_project_admin')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle<{ role_id: string; is_project_admin: boolean }>();
  if (!membership) {
    await supabase.auth.signOut();
    redirect('/login');
  }

  // Modul muss aktiviert sein …
  const { data: projectModule } = await supabase
    .from('project_modules')
    .select('*')
    .eq('project_id', projectId)
    .eq('module_key', moduleKey)
    .eq('enabled', true)
    .maybeSingle<ProjectModule>();
  if (!projectModule) notFound();

  // … und die Rolle freigegeben (Projekt-Admins immer)
  let canView = membership.is_project_admin;
  let canEdit = membership.is_project_admin;
  if (!canView) {
    const { data: access } = await supabase
      .from('role_module_access')
      .select('*')
      .eq('role_id', membership.role_id)
      .eq('module_key', moduleKey)
      .maybeSingle<RoleModuleAccess>();
    canView = Boolean(access?.can_view);
    canEdit = Boolean(access?.can_edit);
  }
  if (!canView) notFound();

  const tenant = await getTenantData(projectId);

  if (moduleKey === 'baukostenkontrolle') {
    // RLS filtert zusätzlich (can_view_module); Reihenfolge: Gruppen nach
    // sort/digit, Positionen nach sort (Anzeige sortiert natürlich nach BKP),
    // Einträge nach Datum (ohne Datum zuletzt) und Erfassungszeit.
    const [{ data: groups }, { data: positions }, { data: entries }] =
      await Promise.all([
        supabase
          .from('bkk_groups')
          .select('*')
          .eq('project_id', projectId)
          .order('sort')
          .order('digit')
          .returns<BkkGroup[]>(),
        supabase
          .from('bkk_positions')
          .select('*')
          .eq('project_id', projectId)
          .order('sort')
          .returns<BkkPosition[]>(),
        supabase
          .from('bkk_entries')
          .select('*')
          .eq('project_id', projectId)
          .order('datum', { ascending: true, nullsFirst: false })
          .order('created_at')
          .returns<BkkEntry[]>(),
      ]);

    const settings = projectModule.settings ?? {};
    const kvOrigDatum =
      typeof settings.kv_orig_datum === 'string' && settings.kv_orig_datum
        ? formatDate(settings.kv_orig_datum)
        : null;
    // 5-Rappen-Regel: Default aktiv (Alt-Tool-Verhalten), abschaltbar über
    // project_modules.settings.round5_totals = false
    const round5 = settings.round5_totals !== false;

    return (
      <BkkClient
        projectId={projectId}
        projectName={tenant?.project.name ?? ''}
        canEdit={canEdit}
        kvOrigDatum={kvOrigDatum}
        round5={round5}
        groups={groups ?? []}
        initialPositions={positions ?? []}
        initialEntries={entries ?? []}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6">
      <header className="flex items-center justify-between border-b border-line py-6">
        <div>
          <p className="display-title text-xs tracking-[0.2em] text-primary">
            {tenant?.project.name}
          </p>
          <h1 className="display-title text-2xl text-ink">
            {moduleInfo.label}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/hub"
            className="border border-line bg-white px-4 py-2 text-sm text-primary-dark transition-colors hover:border-primary"
          >
            {texts.hub.title}
          </Link>
          <LogoutButton />
        </div>
      </header>

      <main className="flex flex-1 flex-col justify-center gap-3">
        <p className="text-sm text-primary-dark">{moduleInfo.description}</p>
        <div className="h-px w-16 bg-accent" />
        <p className="text-sm text-primary">{texts.modules.comingSoon}</p>
        {canEdit && (
          <p className="text-xs text-primary">
            {texts.hub.loggedInAs} {user.email} · {texts.admin.rollen_module.edit}: ✓
          </p>
        )}
      </main>
    </div>
  );
}

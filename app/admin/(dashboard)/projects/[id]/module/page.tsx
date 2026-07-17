import { ModuleEinstellungen } from '@/features/admin/module-einstellungen';
import { requirePlatformAdmin } from '@/features/admin/require-admin';
import type { ProjectModule } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ProjectModulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requirePlatformAdmin();

  // Fehler hart machen: Eine stumm fehlgeschlagene Abfrage würde alle
  // Checkboxen als «deaktiviert» rendern – ein anschliessendes Speichern
  // schriebe diesen falschen Zustand in die DB.
  const { data: modules, error } = await supabase
    .from('project_modules')
    .select('*')
    .eq('project_id', id)
    .returns<ProjectModule[]>();
  if (error) throw error;

  const enabledKeys = (modules ?? [])
    .filter((m) => m.enabled)
    .map((m) => m.module_key);

  return <ModuleEinstellungen projectId={id} enabledKeys={enabledKeys} />;
}

/**
 * RLS-Test (Abnahme M1): weist nach, dass ein User aus Projekt A via API
 * keine Daten aus Projekt B lesen kann – und dass die Rollen-Matrix
 * (Sichtbarkeit, Upload-Recht) serverseitig greift.
 *
 * Läuft mit dem ANON-Key (wie ein echter Client); die Testbenutzer stammen
 * aus dem Seed-Skript. Aufruf: npm run test:rls
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadScriptEnv } from './env';

// P2-M0: test:rls läuft ausschliesslich gegen die Dev-Umgebung –
// der Test erstellt/löscht Daten und braucht die Seed-Testbenutzer.
const target = loadScriptEnv();
if (target === 'prod') {
  console.error('ABBRUCH: test:rls läuft nur gegen die Dev-Umgebung (nie TARGET=prod).');
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  console.error('Fehlende Umgebungsvariablen in .env.local.');
  process.exit(1);
}

const WATTWIL_SLUG = 'mcd-wattwil';
const DEMO_SLUG = 'demo-buerohaus';

const USERS = {
  wattwilUnternehmer: {
    email: 'unternehmer.wattwil@example.com',
    password: 'UnternehmerWattwil2026!',
  },
  wattwilBauleitung: {
    email: 'bauleitung.wattwil@example.com',
    password: 'BauleitungWattwil2026!',
  },
  demoBauherr: {
    email: 'bauherr.demo@example.com',
    password: 'BauherrDemo2026!',
  },
  platformAdmin: {
    email: 'admin.plattform@example.com',
    password: 'PlattformAdmin2026!',
  },
};

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function signedInClient(user: {
  email: string;
  password: string;
}): Promise<SupabaseClient> {
  const client = createClient(supabaseUrl!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword(user);
  if (error) {
    throw new Error(`Login fehlgeschlagen für ${user.email}: ${error.message}`);
  }
  return client;
}

async function main() {
  // Projekt-IDs über Service-Role ermitteln (nur für die Testvorbereitung)
  const admin = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: projects, error: projectsError } = await admin
    .from('projects')
    .select('id, slug')
    .in('slug', [WATTWIL_SLUG, DEMO_SLUG]);
  if (projectsError) throw projectsError;

  const wattwilId = projects?.find((p) => p.slug === WATTWIL_SLUG)?.id;
  const demoId = projects?.find((p) => p.slug === DEMO_SLUG)?.id;
  if (!wattwilId || !demoId) {
    throw new Error('Seed-Projekte nicht gefunden – zuerst `npm run seed` ausführen.');
  }

  // Kategorie «Pläne» in Wattwil (für den Schreibtest)
  const { data: wattwilPlaene } = await admin
    .from('categories')
    .select('id')
    .eq('project_id', wattwilId)
    .eq('key', 'plaene')
    .single();

  // -------------------------------------------------------------------------
  console.log('\n1) Wattwil-Unternehmer darf NICHTS aus dem Demo-Projekt lesen');
  const unternehmer = await signedInClient(USERS.wattwilUnternehmer);

  for (const table of ['categories', 'documents', 'roles', 'project_members']) {
    const { data } = await unternehmer
      .from(table)
      .select('*')
      .eq('project_id', demoId);
    check(
      `${table} (Demo-Projekt): 0 Zeilen`,
      (data ?? []).length === 0,
      `erhielt ${(data ?? []).length} Zeilen`,
    );
  }

  console.log('\n2) Rollen-Matrix: Unternehmer sieht in Wattwil NUR Pläne + Ausschreibungen');
  const { data: unternehmerCats } = await unternehmer
    .from('categories')
    .select('key')
    .eq('project_id', wattwilId)
    .order('key');
  const catKeys = (unternehmerCats ?? []).map((c) => c.key).sort();
  check(
    `categories (Wattwil): genau [ausschreibungen, plaene]`,
    JSON.stringify(catKeys) === JSON.stringify(['ausschreibungen', 'plaene']),
    `erhielt [${catKeys.join(', ')}]`,
  );

  console.log('\n3) Upload-Recht greift serverseitig (nicht nur im UI)');
  const { error: insertError } = await unternehmer.from('documents').insert({
    project_id: wattwilId,
    category_id: wattwilPlaene!.id,
    data: { icon: 'X', title: 'RLS-Test (darf nicht existieren)' },
  });
  check(
    'documents-Insert als Unternehmer (kein can_upload): abgelehnt',
    insertError !== null,
    'Insert wurde NICHT abgelehnt!',
  );

  console.log('\n4) Demo-Bauherr darf NICHTS aus Wattwil lesen');
  const demoBauherr = await signedInClient(USERS.demoBauherr);
  for (const table of ['categories', 'documents', 'roles', 'project_members']) {
    const { data } = await demoBauherr
      .from(table)
      .select('*')
      .eq('project_id', wattwilId);
    check(
      `${table} (Wattwil): 0 Zeilen`,
      (data ?? []).length === 0,
      `erhielt ${(data ?? []).length} Zeilen`,
    );
  }

  console.log('\n5) Positivkontrollen (kein falsch-grüner Test)');
  const { data: demoCats } = await demoBauherr
    .from('categories')
    .select('key')
    .eq('project_id', demoId);
  check(
    'Demo-Bauherr sieht alle 5 Demo-Kategorien',
    (demoCats ?? []).length === 5,
    `erhielt ${(demoCats ?? []).length}`,
  );

  const bauleitung = await signedInClient(USERS.wattwilBauleitung);
  const { data: blCats } = await bauleitung
    .from('categories')
    .select('key')
    .eq('project_id', wattwilId);
  check(
    'Bauleitung sieht alle 5 Wattwil-Kategorien',
    (blCats ?? []).length === 5,
    `erhielt ${(blCats ?? []).length}`,
  );

  const { data: inserted, error: blInsertError } = await bauleitung
    .from('documents')
    .insert({
      project_id: wattwilId,
      category_id: wattwilPlaene!.id,
      data: { icon: 'T1', title: 'RLS-Testdokument (wird gleich gelöscht)' },
    })
    .select('id')
    .single();
  check(
    'documents-Insert als Bauleitung (can_upload): erlaubt',
    blInsertError === null && Boolean(inserted?.id),
    blInsertError?.message ?? '',
  );
  if (inserted?.id) {
    await bauleitung.from('documents').delete().eq('id', inserted.id);
  }

  // -------------------------------------------------------------------------
  console.log('\n6) Signed URLs: nur für sichtbare Kategorien (M2)');

  // Testdateien als Bauleitung hochladen (uebersichtsdokumente + plaene)
  const testFiles = {
    hidden: `${wattwilId}/uebersichtsdokumente/rls-test-hidden.txt`,
    visible: `${wattwilId}/plaene/rls-test-visible.txt`,
  };
  for (const path of Object.values(testFiles)) {
    const { error } = await bauleitung.storage
      .from('project-files')
      .upload(path, new Blob(['rls-test']), {
        contentType: 'text/plain',
        upsert: true,
      });
    if (error) throw new Error(`Testdatei-Upload fehlgeschlagen: ${error.message}`);
  }

  const { data: hiddenSigned, error: hiddenError } = await unternehmer.storage
    .from('project-files')
    .createSignedUrl(testFiles.hidden, 60);
  check(
    'Signed URL für unsichtbare Kategorie (Übersichtsdokumente): abgelehnt',
    hiddenError !== null && !hiddenSigned,
    'Unternehmer erhielt eine Signed URL für eine unsichtbare Kategorie!',
  );

  const { data: visibleSigned, error: visibleError } = await unternehmer.storage
    .from('project-files')
    .createSignedUrl(testFiles.visible, 60);
  check(
    'Signed URL für sichtbare Kategorie (Pläne): erlaubt',
    visibleError === null && Boolean(visibleSigned?.signedUrl),
    visibleError?.message ?? '',
  );

  // Storage-Upload-Recht: Unternehmer darf nicht hochladen (kein can_upload)
  const { error: unternehmerUploadError } = await unternehmer.storage
    .from('project-files')
    .upload(`${wattwilId}/plaene/rls-test-illegal.txt`, new Blob(['x']), {
      contentType: 'text/plain',
    });
  check(
    'Storage-Upload als Unternehmer (kein can_upload): abgelehnt',
    unternehmerUploadError !== null,
    'Upload wurde NICHT abgelehnt!',
  );

  // Aufräumen
  await bauleitung.storage
    .from('project-files')
    .remove(Object.values(testFiles));

  // -------------------------------------------------------------------------
  console.log('\n7) Konfigurationsrechte (M3)');

  // Normaler User darf keine Projekte anlegen
  const { error: unternehmerProjectError } = await unternehmer
    .from('projects')
    .insert({ slug: 'rls-illegal', name: 'RLS Illegal' });
  check(
    'projects-Insert als Unternehmer: abgelehnt',
    unternehmerProjectError !== null,
    'Insert wurde NICHT abgelehnt!',
  );

  // Normaler User darf fremde Brandings nicht ändern (RLS: 0 Zeilen betroffen)
  const { data: unternehmerBrandingRows } = await unternehmer
    .from('project_branding')
    .update({ management_name: 'Gehackt AG' })
    .eq('project_id', demoId)
    .select('project_id');
  const { data: demoBrandingCheck } = await admin
    .from('project_branding')
    .select('management_name')
    .eq('project_id', demoId)
    .single();
  check(
    'branding-Update (fremdes Projekt) als Unternehmer: wirkungslos',
    (unternehmerBrandingRows ?? []).length === 0 &&
      demoBrandingCheck?.management_name !== 'Gehackt AG',
    'Fremdes Branding wurde geändert!',
  );

  // Projekt-Admin (Bauleitung) darf sein Projekt konfigurieren …
  const { data: renamedRows, error: renameError } = await bauleitung
    .from('projects')
    .update({ name: "McDonald's Neubau Wattwil (RLS-Test)" })
    .eq('id', wattwilId)
    .select('id');
  check(
    'projects-Update (eigenes Projekt) als Projekt-Admin: erlaubt',
    renameError === null && (renamedRows ?? []).length === 1,
    renameError?.message ?? 'kein Treffer',
  );
  await bauleitung
    .from('projects')
    .update({ name: "McDonald's Neubau Wattwil" })
    .eq('id', wattwilId);

  // … aber Domain/Slug nicht ändern (Schutz-Trigger aus M0)
  const { error: slugError } = await bauleitung
    .from('projects')
    .update({ slug: 'gehackter-slug' })
    .eq('id', wattwilId);
  check(
    'projects-Slug-Änderung als Projekt-Admin: abgelehnt (Trigger)',
    slugError !== null,
    'Slug-Änderung wurde NICHT abgelehnt!',
  );
  const { error: domainError } = await bauleitung
    .from('projects')
    .update({ domain: 'gehackte-domain.ch' })
    .eq('id', wattwilId);
  check(
    'projects-Domain-Änderung als Projekt-Admin: abgelehnt (Trigger)',
    domainError !== null,
    'Domain-Änderung wurde NICHT abgelehnt!',
  );

  // Projekt-Admin darf fremde Brandings nicht ändern
  const { data: bauleitungForeignRows } = await bauleitung
    .from('project_branding')
    .update({ management_name: 'Gehackt AG' })
    .eq('project_id', demoId)
    .select('project_id');
  check(
    'branding-Update (fremdes Projekt) als Projekt-Admin: wirkungslos',
    (bauleitungForeignRows ?? []).length === 0,
    'Fremdes Branding wurde geändert!',
  );

  // Plattform-Admin darf Projekte anlegen (und wieder löschen)
  const platformAdmin = await signedInClient(USERS.platformAdmin);
  const { data: createdProject, error: platformCreateError } =
    await platformAdmin
      .from('projects')
      .insert({ slug: 'rls-tmp-projekt', name: 'RLS Temp' })
      .select('id')
      .single();
  check(
    'projects-Insert als Plattform-Admin: erlaubt',
    platformCreateError === null && Boolean(createdProject?.id),
    platformCreateError?.message ?? '',
  );
  if (createdProject?.id) {
    await platformAdmin.from('projects').delete().eq('id', createdProject.id);
  }

  // -------------------------------------------------------------------------
  console.log('\n8) Modul-Framework (P2-M1)');

  // Normaler User darf Module weder aktivieren noch sich selbst freigeben
  const { error: moduleEnableError } = await unternehmer
    .from('project_modules')
    .insert({ project_id: wattwilId, module_key: 'baukostenkontrolle', enabled: true });
  check(
    'project_modules-Insert als Unternehmer: abgelehnt',
    moduleEnableError !== null,
    'Modul-Aktivierung wurde NICHT abgelehnt!',
  );

  const { data: unternehmerRole } = await admin
    .from('roles')
    .select('id')
    .eq('project_id', wattwilId)
    .eq('name', 'Unternehmer')
    .single();
  const { error: selfGrantError } = await unternehmer
    .from('role_module_access')
    .insert({
      role_id: unternehmerRole!.id,
      module_key: 'baukostenkontrolle',
      can_view: true,
      can_edit: true,
    });
  check(
    'role_module_access-Insert (Selbst-Freigabe) als Unternehmer: abgelehnt',
    selfGrantError !== null,
    'Selbst-Freigabe wurde NICHT abgelehnt!',
  );

  // Projekt-Admin darf Module seines Projekts aktivieren
  const { error: adminEnableError } = await bauleitung
    .from('project_modules')
    .upsert(
      { project_id: wattwilId, module_key: 'baukostenkontrolle', enabled: true },
      { onConflict: 'project_id,module_key' },
    );
  check(
    'project_modules-Upsert als Projekt-Admin: erlaubt',
    adminEnableError === null,
    adminEnableError?.message ?? '',
  );

  // Mitglied liest die Modul-Aktivierung des eigenen Projekts …
  const { data: memberModules } = await unternehmer
    .from('project_modules')
    .select('module_key')
    .eq('project_id', wattwilId);
  check(
    'project_modules-Select (eigenes Projekt) als Mitglied: erlaubt',
    (memberModules ?? []).length >= 1,
    'Mitglied sieht die Modul-Aktivierung nicht',
  );

  // … aber nicht die eines fremden Projekts
  const { data: foreignModules } = await demoBauherr
    .from('project_modules')
    .select('module_key')
    .eq('project_id', wattwilId);
  check(
    'project_modules-Select (fremdes Projekt): 0 Zeilen',
    (foreignModules ?? []).length === 0,
    `erhielt ${(foreignModules ?? []).length} Zeilen`,
  );

  // Aufräumen: Modul-Aktivierung aus dem Test entfernen
  await admin
    .from('project_modules')
    .delete()
    .eq('project_id', wattwilId)
    .eq('module_key', 'baukostenkontrolle');

  // -------------------------------------------------------------------------
  console.log(`\nErgebnis: ${passed} bestanden, ${failed} fehlgeschlagen.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('RLS-Test abgebrochen:', err);
  process.exit(1);
});

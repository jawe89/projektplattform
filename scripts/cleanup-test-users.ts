/**
 * Entfernt alle Seed-Testbenutzer (example.com-Adressen inkl.
 * admin.plattform@example.com) vor dem Go-Live. Löscht die Auth-Konten;
 * project_members- und platform_admins-Einträge fallen per Cascade weg.
 *
 * SICHERUNG: Das Skript verweigert die Ausführung, solange kein anderer
 * Plattform-Admin (mit Nicht-example.com-Adresse) existiert – sonst würde
 * man sich aus dem Adminbereich aussperren. Zuerst `npm run create:admin`
 * ausführen und den Login auf der Admin-Adresse testen.
 *
 * Aufruf: npm run cleanup:testusers          (fragt nach Bestätigung)
 *         npm run cleanup:testusers -- --yes (ohne Rückfrage)
 */
import { createInterface } from 'node:readline/promises';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen in .env.local.');
  process.exit(1);
}

const TEST_DOMAIN = '@example.com';
const skipConfirm = process.argv.includes('--yes');

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data: userList, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw listError;
  const users = userList.users;

  // -------------------------------------------------------------------------
  // Sicherung: mindestens ein echter Plattform-Admin muss existieren
  // -------------------------------------------------------------------------
  const { data: adminRows, error: adminError } = await supabase
    .from('platform_admins')
    .select('user_id');
  if (adminError) throw adminError;

  const adminIds = new Set((adminRows ?? []).map((r) => r.user_id as string));
  const realAdmins = users.filter(
    (u) =>
      adminIds.has(u.id) &&
      u.email &&
      !u.email.toLowerCase().endsWith(TEST_DOMAIN),
  );

  if (realAdmins.length === 0) {
    console.error(
      'ABBRUCH: Es existiert kein Plattform-Admin mit echter (Nicht-example.com-)\n' +
        'Adresse. Zuerst `npm run create:admin` ausführen und den Login auf der\n' +
        'Admin-Adresse testen – sonst sperrt das Cleanup den Adminbereich aus.',
    );
    process.exit(1);
  }
  console.log(
    `Sicherung ok – echte(r) Plattform-Admin(s): ${realAdmins.map((u) => u.email).join(', ')}`,
  );

  // -------------------------------------------------------------------------
  const testUsers = users.filter((u) =>
    u.email?.toLowerCase().endsWith(TEST_DOMAIN),
  );
  if (testUsers.length === 0) {
    console.log('Keine Testbenutzer (example.com) vorhanden – nichts zu tun.');
    return;
  }

  console.log(`\nZu löschende Testbenutzer (${testUsers.length}):`);
  for (const user of testUsers) {
    console.log(`  ${user.email}${adminIds.has(user.id) ? '  (Plattform-Admin)' : ''}`);
  }
  console.log(
    '\nGelöscht werden Auth-Konto, Projektmitgliedschaften und Admin-Einträge.',
  );

  if (!skipConfirm) {
    if (!process.stdin.isTTY) {
      console.error('Keine interaktive Konsole – mit `-- --yes` bestätigen.');
      process.exit(1);
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question('Fortfahren? (ja/nein): ')).trim().toLowerCase();
    rl.close();
    if (answer !== 'ja') {
      console.log('Abgebrochen – nichts gelöscht.');
      return;
    }
  }

  let deleted = 0;
  const errors: string[] = [];
  for (const user of testUsers) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) errors.push(`${user.email}: ${error.message}`);
    else {
      deleted += 1;
      console.log(`  ✓ gelöscht: ${user.email}`);
    }
  }

  console.log(`\nErgebnis: ${deleted} von ${testUsers.length} Testbenutzern gelöscht.`);
  if (errors.length > 0) {
    console.error('Fehler:');
    for (const line of errors) console.error(`  ✗ ${line}`);
    process.exit(1);
  }
  console.log(
    'Hinweis: `npm run test:rls` braucht die Seed-Testbenutzer und funktioniert\n' +
      'erst wieder nach `SEED_ALLOW_PROD=1 npm run seed` (nicht in Produktion!).',
  );
}

main().catch((err) => {
  console.error('Cleanup fehlgeschlagen:', err);
  process.exit(1);
});

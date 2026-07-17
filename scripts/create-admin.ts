/**
 * Legt einen echten Plattform-Admin an (vor dem Go-Live; ersetzt die
 * Seed-Testadmins). Zwei Varianten:
 *
 *   npm run create:admin -- --email jan@firma.ch --password 'SicheresPasswort!'
 *   npm run create:admin -- --email jan@firma.ch --invite
 *
 * Ohne Argumente fragt das Skript interaktiv nach. --invite verschickt eine
 * Supabase-Invite-Mail über den konfigurierten SMTP-Versand (Passwort setzt
 * der Admin selbst über den Link); sonst wird das Passwort direkt gesetzt.
 * Der Benutzer wird in platform_admins eingetragen.
 */
import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';
import { loadScriptEnv } from './env';

// P2-M0: Standardziel Dev; echter Plattform-Admin auf Produktion mit TARGET=prod.
loadScriptEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen.');
  process.exit(1);
}

const USAGE =
  "Aufruf: npm run create:admin -- --email jan@firma.ch [--password '…' | --invite]";
const MIN_PASSWORD_LENGTH = 12;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function parseArgs(): { email?: string; password?: string; invite: boolean } {
  const args = process.argv.slice(2);
  const valueOf = (name: string): string | undefined => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };
  return {
    email: valueOf('email'),
    password: valueOf('password'),
    invite: args.includes('--invite'),
  };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw error;
  return (
    data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ??
    null
  );
}

async function main() {
  const parsed = parseArgs();
  let { email, password } = parsed;
  let invite = parsed.invite;

  // Interaktiv nachfragen, falls Argumente fehlen
  if (!email || (!password && !invite)) {
    if (!process.stdin.isTTY) {
      console.error(`Fehlende Argumente.\n${USAGE}`);
      process.exit(1);
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    if (!email) {
      email = (await rl.question('E-Mail-Adresse des Plattform-Admins: ')).trim();
    }
    if (!password && !invite) {
      console.log(
        'Hinweis: Eingabe ist sichtbar. Leer lassen, um stattdessen eine ' +
          'Invite-Mail zu verschicken (SMTP muss konfiguriert sein).',
      );
      const answer = (
        await rl.question(`Passwort (min. ${MIN_PASSWORD_LENGTH} Zeichen) oder leer für Invite: `)
      ).trim();
      if (answer) password = answer;
      else invite = true;
    }
    rl.close();
  }

  if (!email || !isValidEmail(email)) {
    console.error(`Ungültige E-Mail-Adresse.\n${USAGE}`);
    process.exit(1);
  }
  if (email.toLowerCase().endsWith('@example.com')) {
    console.error('example.com-Adressen sind Testbenutzern vorbehalten – bitte die echte Adresse verwenden.');
    process.exit(1);
  }
  if (!invite && (!password || password.length < MIN_PASSWORD_LENGTH)) {
    console.error(`Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`);
    process.exit(1);
  }

  let userId: string;
  if (invite) {
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email);
    if (!error) {
      userId = data.user.id;
      console.log(`Invite-Mail an ${email} verschickt (Passwort setzt der Admin über den Link).`);
    } else {
      const existing = await findUserIdByEmail(email);
      if (!existing) {
        console.error(`Einladung fehlgeschlagen: ${error.message}`);
        console.error('Ist der SMTP-Versand in Supabase konfiguriert? Alternativ --password verwenden.');
        process.exit(1);
      }
      userId = existing;
      console.log(`Konto ${email} existiert bereits – es wird nur als Plattform-Admin eingetragen.`);
    }
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: password!,
      email_confirm: true,
    });
    if (!error) {
      userId = data.user.id;
      console.log(`Konto ${email} angelegt.`);
    } else {
      const existing = await findUserIdByEmail(email);
      if (!existing) {
        console.error(`Anlegen fehlgeschlagen: ${error.message}`);
        process.exit(1);
      }
      userId = existing;
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        userId,
        { password: password! },
      );
      if (updateError) {
        console.error(`Passwort-Update fehlgeschlagen: ${updateError.message}`);
        process.exit(1);
      }
      console.log(`Konto ${email} existiert bereits – Passwort aktualisiert.`);
    }
  }

  const { error: adminError } = await supabase
    .from('platform_admins')
    .upsert({ user_id: userId }, { onConflict: 'user_id' });
  if (adminError) {
    console.error(`platform_admins-Eintrag fehlgeschlagen: ${adminError.message}`);
    process.exit(1);
  }

  const adminUrl = process.env.ADMIN_DOMAIN
    ? `https://${process.env.ADMIN_DOMAIN}`
    : 'http://admin.localhost:3000';
  console.log(`\n${email} ist jetzt Plattform-Admin.`);
  console.log(`Nächste Schritte:`);
  console.log(`  1. Login testen: ${adminUrl} (lokal: http://admin.localhost:3000)`);
  console.log(`  2. Danach Testbenutzer entfernen: npm run cleanup:testusers`);
}

main().catch((err) => {
  console.error('Fehlgeschlagen:', err);
  process.exit(1);
});

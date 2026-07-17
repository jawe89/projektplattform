/**
 * Seed-Skript (M0+M1): legt das Projekt «McDonald's Neubau Wattwil» mit den
 * 5 Standardkategorien und den Rollen Bauherr/Bauleitung/Architekt/Unternehmer
 * an, plus ein Demo-Projekt mit abweichendem Branding. Zusätzlich (M1):
 * Logo-/Hero-Platzhalter im Branding-Bucket und Testbenutzer mit
 * Projektmitgliedschaften.
 *
 * Aufruf: npm run seed   (braucht SUPABASE_SERVICE_ROLE_KEY in .env.local)
 * Idempotent: mehrfaches Ausführen aktualisiert statt dupliziert.
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Fehlende Umgebungsvariablen: NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY in .env.local setzen.',
  );
  process.exit(1);
}

// Produktivschutz (seit Go-Live-Vorbereitung): Das Seed überschreibt Projekte,
// Branding, Kategorien und legt example.com-Testbenutzer an – gegen die
// Produktiv-Datenbank darf es nur noch ausdrücklich laufen.
if (process.env.SEED_ALLOW_PROD !== '1') {
  console.error(
    'ABBRUCH: Das Seed-Skript überschreibt Produktivdaten (Projekte, Branding,\n' +
      'Kategorien, Rollen-Matrix) und legt example.com-Testbenutzer an.\n' +
      'Ausführung nur ausdrücklich mit:  SEED_ALLOW_PROD=1 npm run seed',
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Standardkategorien (bilden die heutige SECTION_META der Projektübersicht ab)
// ---------------------------------------------------------------------------

interface SeedCategory {
  key: string;
  label: string;
  add_label: string;
  layout: 'big' | 'list';
  sort: number;
  field_schema: {
    fields: {
      key: string;
      label: string;
      placeholder?: string;
      required?: boolean;
      badge?: boolean;
    }[];
    allowChildren: boolean;
  };
}

const standardCategories: SeedCategory[] = [
  {
    key: 'uebersichtsdokumente',
    label: 'Übersichtsdokumente',
    add_label: '+ Neues Dokument',
    layout: 'big',
    sort: 0,
    field_schema: {
      fields: [
        { key: 'icon', label: 'Typ', placeholder: 'HTML oder PDF', required: true, badge: true },
        { key: 'title', label: 'Titel', required: true },
        { key: 'sub', label: 'Untertitel (optional)' },
      ],
      allowChildren: false,
    },
  },
  {
    key: 'plaene',
    label: 'Pläne',
    add_label: '+ Neuer Plan',
    layout: 'list',
    sort: 1,
    field_schema: {
      fields: [
        { key: 'icon', label: 'Plan-Nr.', placeholder: 'z.B. BE10', required: true, badge: true },
        { key: 'title', label: 'Titel', required: true },
        { key: 'sub', label: 'Untertitel (optional)' },
      ],
      allowChildren: false,
    },
  },
  {
    key: 'ausschreibungen',
    label: 'Ausschreibungen',
    add_label: '+ Neue Ausschreibung',
    layout: 'big',
    sort: 2,
    field_schema: {
      fields: [
        { key: 'icon', label: 'BKP-Nr.', placeholder: 'z.B. 250', required: true, badge: true },
        { key: 'title', label: 'Titel', required: true },
        { key: 'sub', label: 'Untertitel (optional)' },
      ],
      allowChildren: true,
    },
  },
  {
    key: 'offerten',
    label: 'Offerten',
    add_label: '+ Neue Offerte',
    layout: 'list',
    sort: 3,
    field_schema: {
      fields: [
        { key: 'icon', label: 'BKP-Nr.', placeholder: 'z.B. 250', required: true, badge: true },
        { key: 'title', label: 'Titel', required: true },
        { key: 'sub', label: 'Untertitel (optional)' },
      ],
      allowChildren: false,
    },
  },
  {
    key: 'werkvertraege',
    label: 'Werkverträge',
    add_label: '+ Neuer Werkvertrag',
    layout: 'list',
    sort: 4,
    field_schema: {
      fields: [
        { key: 'icon', label: 'BKP-Nr.', placeholder: 'z.B. 250', required: true, badge: true },
        { key: 'title', label: 'Titel', required: true },
        { key: 'sub', label: 'Untertitel (optional)' },
      ],
      allowChildren: false,
    },
  },
];

// ---------------------------------------------------------------------------
// Rollen + Sichtbarkeits-/Upload-Matrix (Standard: nur ansehen; Hochladen
// Bauleitung; Unternehmer sieht nur Pläne und Ausschreibungen)
// ---------------------------------------------------------------------------

const roleNames = ['Bauherr', 'Bauleitung', 'Architekt', 'Unternehmer'] as const;

const accessMatrix: Record<
  (typeof roleNames)[number],
  Record<string, { view: boolean; upload: boolean }>
> = {
  Bauherr: {
    uebersichtsdokumente: { view: true, upload: false },
    plaene: { view: true, upload: false },
    ausschreibungen: { view: true, upload: false },
    offerten: { view: true, upload: false },
    werkvertraege: { view: true, upload: false },
  },
  Bauleitung: {
    uebersichtsdokumente: { view: true, upload: true },
    plaene: { view: true, upload: true },
    ausschreibungen: { view: true, upload: true },
    offerten: { view: true, upload: true },
    werkvertraege: { view: true, upload: true },
  },
  Architekt: {
    uebersichtsdokumente: { view: true, upload: false },
    plaene: { view: true, upload: true },
    ausschreibungen: { view: true, upload: false },
    offerten: { view: true, upload: false },
    werkvertraege: { view: true, upload: false },
  },
  Unternehmer: {
    uebersichtsdokumente: { view: false, upload: false },
    plaene: { view: true, upload: false },
    ausschreibungen: { view: true, upload: false },
    offerten: { view: false, upload: false },
    werkvertraege: { view: false, upload: false },
  },
};

// ---------------------------------------------------------------------------
// Seed-Projekte
// ---------------------------------------------------------------------------

interface SeedProject {
  slug: string;
  name: string;
  project_no: string;
  domain: string | null;
  landing: object;
  /** Abweichende Kategorien; Default: standardCategories */
  categories?: SeedCategory[];
  branding: {
    management_name: string;
    management_suffix: string | null;
    font_display: string;
    font_body: string;
    colors: Record<string, string>;
  };
}

// ---------------------------------------------------------------------------
// Abweichendes Schema für das Demo-Projekt (Schema-Test Kapitel 7):
// «Pläne» mit umbenanntem Nummernfeld (Platzhalter «z.B. P-101») und
// zusätzlichem optionalem Feld «Format» – Modal und Karte müssen das
// ohne Codeänderung abbilden.
// ---------------------------------------------------------------------------

const demoCategories: SeedCategory[] = standardCategories.map((category) =>
  category.key === 'plaene'
    ? {
        ...category,
        field_schema: {
          fields: [
            { key: 'icon', label: 'Plan-Nr.', placeholder: 'z.B. P-101', required: true, badge: true },
            { key: 'title', label: 'Titel', required: true },
            { key: 'sub', label: 'Untertitel (optional)' },
            { key: 'format', label: 'Format', placeholder: 'A0/A1' },
          ],
          allowChildren: false,
        },
      }
    : category,
);

const seedProjects: SeedProject[] = [
  {
    slug: 'mcd-wattwil',
    name: "McDonald's Neubau Wattwil",
    project_no: 'MCD_239',
    domain: 'bauinnovation-mcdonalds-wattwil.ch',
    landing: {
      subtitle: 'Neubau · MCD_239',
      description:
        "Neubau des McDonald's Restaurants in Wattwil. Diese Plattform bündelt alle Projektdokumente – Pläne, Ausschreibungen, Offerten und Werkverträge – für die Projektbeteiligten.",
      infoCells: [
        {
          label: 'Bauherrschaft',
          value: "McDonald's Suisse Restaurants Sàrl",
        },
        { label: 'Baumanagement', value: 'Bau Innovation GmbH, Frauenfeld' },
        { label: 'Standort', value: '9630 Wattwil' },
        {
          label: 'Termine',
          value: 'Baustart 01.06.2026 · Bezug 16.10.2026',
        },
      ],
    },
    branding: {
      management_name: 'Bau Innovation GmbH',
      management_suffix: 'Baumanagement',
      font_display: 'Antonio',
      font_body: 'Montserrat',
      colors: {
        primary: '#7c7c7c',
        primaryDark: '#5a5a5a',
        accent: '#70ad47',
        accentDark: '#5a9036',
        bg: '#f6f6f4',
        line: '#e5e5e5',
        ink: '#2b2b2b',
      },
    },
  },
  {
    // Zweites Seed-Projekt mit abweichendem Branding – Abnahme M0:
    // slug.localhost zeigt pro Seed-Projekt unterschiedliches Branding.
    slug: 'demo-buerohaus',
    name: 'Bürohaus Demo Frauenfeld',
    project_no: 'DEMO_001',
    domain: null,
    landing: {
      subtitle: 'Umbau · DEMO_001',
      description:
        'Demo-Projekt zur Prüfung des Multi-Tenant-Brandings. Gleiche App, andere Daten, anderes Branding.',
      infoCells: [
        { label: 'Bauherrschaft', value: 'Muster Immobilien AG' },
        { label: 'Baumanagement', value: 'Demo Architektur GmbH, Frauenfeld' },
        { label: 'Standort', value: '8500 Frauenfeld' },
        { label: 'Termine', value: 'Baustart 01.09.2026 · Bezug 30.04.2027' },
      ],
    },
    categories: demoCategories,
    branding: {
      management_name: 'Demo Architektur GmbH',
      management_suffix: 'Baumanagement',
      font_display: 'Archivo',
      font_body: 'Inter',
      colors: {
        primary: '#6b7a8f',
        primaryDark: '#4a5768',
        accent: '#2f6fb0',
        accentDark: '#245a91',
        bg: '#f4f6f8',
        line: '#dde3e9',
        ink: '#1f2933',
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Testbenutzer (M1): E-Mail, Passwort, Projekt, Rolle
// ---------------------------------------------------------------------------

interface SeedUser {
  email: string;
  password: string;
  projectSlug: string;
  roleName: (typeof roleNames)[number];
  isProjectAdmin: boolean;
}

const seedUsers: SeedUser[] = [
  {
    email: 'bauleitung.wattwil@example.com',
    password: 'BauleitungWattwil2026!',
    projectSlug: 'mcd-wattwil',
    roleName: 'Bauleitung',
    isProjectAdmin: true,
  },
  {
    email: 'unternehmer.wattwil@example.com',
    password: 'UnternehmerWattwil2026!',
    projectSlug: 'mcd-wattwil',
    roleName: 'Unternehmer',
    isProjectAdmin: false,
  },
  {
    email: 'bauherr.demo@example.com',
    password: 'BauherrDemo2026!',
    projectSlug: 'demo-buerohaus',
    roleName: 'Bauherr',
    isProjectAdmin: true,
  },
];

// Plattform-Admins (M3): Vollzugriff, Adminbereich über alle Projekte
const seedPlatformAdmins = [
  { email: 'admin.plattform@example.com', password: 'PlattformAdmin2026!' },
];

// ---------------------------------------------------------------------------
// Branding-Platzhalter (Logo + Hero als SVG in den Tenant-Farben)
// ---------------------------------------------------------------------------

function logoSvg(
  colors: Record<string, string>,
  managementName: string,
  managementSuffix: string | null,
): string {
  const name = managementName.toUpperCase();
  const suffix = managementSuffix?.toUpperCase() ?? '';
  // Breite grob an der Namenslänge ausrichten, damit nichts abgeschnitten wird
  const width = Math.max(300, 80 + name.length * 15);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="80" viewBox="0 0 ${width} 80">
  <rect x="1" y="1" width="${width - 2}" height="78" fill="#ffffff" stroke="${colors.line}"/>
  <rect x="16" y="24" width="32" height="32" fill="${colors.accent}"/>
  <text x="64" y="47" font-family="Arial, sans-serif" font-size="21" font-weight="bold" letter-spacing="2" fill="${colors.ink}">${name}</text>
  ${suffix ? `<text x="64" y="63" font-family="Arial, sans-serif" font-size="10" letter-spacing="3" fill="${colors.primary}">${suffix}</text>` : ''}
</svg>`;
}

function heroSvg(colors: Record<string, string>, title: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="640" viewBox="0 0 1600 640">
  <rect width="1600" height="640" fill="${colors.bg}"/>
  <rect y="480" width="1600" height="160" fill="${colors.line}"/>
  <!-- Baukran -->
  <rect x="240" y="120" width="16" height="360" fill="${colors.primaryDark}"/>
  <rect x="150" y="120" width="520" height="12" fill="${colors.primaryDark}"/>
  <line x1="248" y1="60" x2="150" y2="126" stroke="${colors.primary}" stroke-width="4"/>
  <line x1="248" y1="60" x2="670" y2="126" stroke="${colors.primary}" stroke-width="4"/>
  <rect x="244" y="56" width="8" height="70" fill="${colors.primaryDark}"/>
  <line x1="560" y1="132" x2="560" y2="260" stroke="${colors.primary}" stroke-width="3"/>
  <rect x="536" y="260" width="48" height="40" fill="${colors.accent}"/>
  <!-- Rohbau -->
  <rect x="880" y="280" width="480" height="200" fill="#ffffff" stroke="${colors.primary}" stroke-width="3"/>
  <line x1="880" y1="380" x2="1360" y2="380" stroke="${colors.primary}" stroke-width="2"/>
  <line x1="1040" y1="280" x2="1040" y2="480" stroke="${colors.primary}" stroke-width="2"/>
  <line x1="1200" y1="280" x2="1200" y2="480" stroke="${colors.primary}" stroke-width="2"/>
  <rect x="880" y="252" width="480" height="28" fill="${colors.accent}"/>
  <text x="800" y="590" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" letter-spacing="6" fill="${colors.primaryDark}">${title.toUpperCase()}</text>
</svg>`;
}

async function seedBrandingAssets(
  projectId: string,
  seed: SeedProject,
): Promise<void> {
  const assets = [
    {
      path: `${projectId}/logo.svg`,
      svg: logoSvg(
        seed.branding.colors,
        seed.branding.management_name,
        seed.branding.management_suffix,
      ),
    },
    { path: `${projectId}/hero.svg`, svg: heroSvg(seed.branding.colors, seed.name) },
  ];

  for (const asset of assets) {
    const { error } = await supabase.storage
      .from('branding')
      .upload(asset.path, Buffer.from(asset.svg, 'utf8'), {
        contentType: 'image/svg+xml',
        upsert: true,
      });
    if (error) throw error;
  }

  const { error } = await supabase
    .from('project_branding')
    .update({
      management_logo_path: `${projectId}/logo.svg`,
      hero_path: `${projectId}/hero.svg`,
    })
    .eq('project_id', projectId);
  if (error) throw error;
  console.log('  branding assets: ok (logo.svg, hero.svg)');
}

// ---------------------------------------------------------------------------
// Benutzer anlegen (idempotent) und Projekt zuweisen
// ---------------------------------------------------------------------------

async function ensureUser(email: string, password: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!error) return data.user.id;

  // Existiert bereits → per E-Mail suchen und Passwort auf den Seed-Wert setzen
  const { data: list, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw listError;
  const existing = list.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (!existing) throw error;

  const { error: updateError } = await supabase.auth.admin.updateUserById(
    existing.id,
    { password },
  );
  if (updateError) throw updateError;
  return existing.id;
}

async function seedUser(user: SeedUser): Promise<void> {
  const userId = await ensureUser(user.email, user.password);

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', user.projectSlug)
    .single();
  if (projectError) throw projectError;

  const { data: role, error: roleError } = await supabase
    .from('roles')
    .select('id')
    .eq('project_id', project.id)
    .eq('name', user.roleName)
    .single();
  if (roleError) throw roleError;

  const { error: memberError } = await supabase.from('project_members').upsert(
    {
      user_id: userId,
      project_id: project.id,
      role_id: role.id,
      is_project_admin: user.isProjectAdmin,
    },
    { onConflict: 'user_id,project_id' },
  );
  if (memberError) throw memberError;

  console.log(
    `  ${user.email} → ${user.projectSlug} (${user.roleName}${user.isProjectAdmin ? ', Projekt-Admin' : ''})`,
  );
}

// ---------------------------------------------------------------------------

async function seedProject(seed: SeedProject) {
  console.log(`\n— Projekt «${seed.name}» (${seed.slug})`);

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .upsert(
      {
        slug: seed.slug,
        name: seed.name,
        project_no: seed.project_no,
        domain: seed.domain,
        status: 'active',
        landing: seed.landing,
      },
      { onConflict: 'slug' },
    )
    .select('id')
    .single();
  if (projectError) throw projectError;
  const projectId = project.id as string;
  console.log(`  projects: ok (${projectId})`);

  const { error: brandingError } = await supabase.from('project_branding').upsert(
    {
      project_id: projectId,
      management_name: seed.branding.management_name,
      management_suffix: seed.branding.management_suffix,
      font_display: seed.branding.font_display,
      font_body: seed.branding.font_body,
      colors: seed.branding.colors,
    },
    { onConflict: 'project_id' },
  );
  if (brandingError) throw brandingError;
  console.log('  project_branding: ok');

  const { data: categories, error: categoriesError } = await supabase
    .from('categories')
    .upsert(
      (seed.categories ?? standardCategories).map((c) => ({ ...c, project_id: projectId })),
      { onConflict: 'project_id,key' },
    )
    .select('id, key');
  if (categoriesError) throw categoriesError;
  console.log(`  categories: ok (${categories.length})`);

  const { data: roles, error: rolesError } = await supabase
    .from('roles')
    .upsert(
      roleNames.map((name) => ({ project_id: projectId, name })),
      { onConflict: 'project_id,name' },
    )
    .select('id, name');
  if (rolesError) throw rolesError;
  console.log(`  roles: ok (${roles.length})`);

  const accessRows = roles.flatMap((role) =>
    categories.map((category) => {
      const access = accessMatrix[role.name as (typeof roleNames)[number]][category.key];
      return {
        role_id: role.id,
        category_id: category.id,
        can_view: access?.view ?? false,
        can_upload: access?.upload ?? false,
      };
    }),
  );
  const { error: accessError } = await supabase
    .from('role_category_access')
    .upsert(accessRows, { onConflict: 'role_id,category_id' });
  if (accessError) throw accessError;
  console.log(`  role_category_access: ok (${accessRows.length})`);

  await seedBrandingAssets(projectId, seed);
}

async function main() {
  console.log('Seed startet …');
  for (const seed of seedProjects) {
    await seedProject(seed);
  }

  console.log('\n— Testbenutzer');
  for (const user of seedUsers) {
    await seedUser(user);
  }

  console.log('\n— Plattform-Admins');
  for (const adminUser of seedPlatformAdmins) {
    const userId = await ensureUser(adminUser.email, adminUser.password);
    const { error } = await supabase
      .from('platform_admins')
      .upsert({ user_id: userId }, { onConflict: 'user_id' });
    if (error) throw error;
    console.log(`  ${adminUser.email} → platform_admin`);
  }

  console.log('\nSeed abgeschlossen.');
  console.log('Tenants lokal aufrufen:');
  for (const seed of seedProjects) {
    console.log(`  http://${seed.slug}.localhost:3000`);
  }
  console.log('\nTestbenutzer (Passwörter nur für die lokale Entwicklung):');
  for (const user of seedUsers) {
    console.log(`  ${user.email} / ${user.password} (${user.projectSlug}, ${user.roleName})`);
  }
  for (const adminUser of seedPlatformAdmins) {
    console.log(`  ${adminUser.email} / ${adminUser.password} (Plattform-Admin, http://admin.localhost:3000)`);
  }
}

main().catch((err) => {
  console.error('Seed fehlgeschlagen:', err);
  process.exit(1);
});

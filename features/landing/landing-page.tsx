import Link from 'next/link';
import { LoginForm } from '@/features/auth/login-form';
import { publicBrandingUrl } from '@/lib/storage';
import type { TenantData } from '@/lib/tenant';
import { texts } from '@/lib/texts';

/**
 * Öffentliche Landingpage (M1): Header mit Titelblock links und Logo rechts,
 * Hero-Bild mit feinem Rahmen, Info-Grid aus `landing.infoCells`,
 * kompakte Login-Karte, Footer mit Projekt-Nr. und Firmenname.
 */
export function LandingPage({
  tenant,
  isLoggedIn,
}: {
  tenant: TenantData;
  isLoggedIn: boolean;
}) {
  const { project, branding } = tenant;
  const landing = project.landing ?? {};
  const infoCells = landing.infoCells ?? [];

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6">
      {/* Header: Titelblock links, Firmenlogo rechts */}
      <header className="flex items-end justify-between gap-6 border-b border-line py-8">
        <div>
          {landing.subtitle && (
            <p className="display-title mb-2 text-xs tracking-[0.2em] text-primary">
              {landing.subtitle}
            </p>
          )}
          <h1 className="display-title text-3xl text-ink sm:text-4xl">
            {project.name}
          </h1>
        </div>
        {branding?.management_logo_path ? (
          // eslint-disable-next-line @next/next/no-img-element -- externe Storage-URL, Grösse variabel
          <img
            src={publicBrandingUrl(branding.management_logo_path)}
            alt={branding.management_name ?? ''}
            className="h-10 w-auto shrink-0 sm:h-12"
          />
        ) : branding?.management_name ? (
          <div className="shrink-0 pb-1 text-right">
            <p className="display-title text-sm text-primary-dark">
              {branding.management_name}
            </p>
            {branding.management_suffix && (
              <p className="display-title text-[10px] tracking-[0.2em] text-primary">
                {branding.management_suffix}
              </p>
            )}
          </div>
        ) : null}
      </header>

      <main className="flex-1 py-8">
        {/* Hero-Bild mit feinem Rahmen */}
        {branding?.hero_path && (
          <figure className="mb-8 border border-line bg-white p-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- externe Storage-URL, Grösse variabel */}
            <img
              src={publicBrandingUrl(branding.hero_path)}
              alt={project.name}
              className="h-56 w-full object-cover sm:h-72 md:h-80"
            />
          </figure>
        )}

        {landing.description && (
          <p className="mb-8 max-w-2xl text-sm leading-relaxed text-primary-dark">
            {landing.description}
          </p>
        )}

        <div className="grid gap-6 md:grid-cols-[1fr_280px]">
          {/* Info-Grid */}
          <section className="grid h-fit grid-cols-1 gap-px border border-line bg-line sm:grid-cols-2">
            {infoCells.map((cell) => (
              <div key={cell.label} className="bg-white p-5">
                <h2 className="display-title mb-2 text-xs text-primary">
                  {cell.label}
                </h2>
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
                  {cell.value}
                </p>
              </div>
            ))}
          </section>

          {/* Kompakte Login-Karte */}
          <aside className="h-fit border border-line bg-white p-5">
            <h2 className="display-title mb-4 text-sm text-ink">
              {texts.landing.loginTitle}
            </h2>
            {isLoggedIn ? (
              <Link
                href="/hub"
                className="block w-full bg-accent px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-accent-dark"
              >
                {texts.landing.toHub}
              </Link>
            ) : (
              <LoginForm />
            )}
          </aside>
        </div>
      </main>

      {/* Footer mit Projekt-Nr. und Baumanagement-Firma */}
      <footer className="flex items-center justify-between border-t border-line py-6 text-xs text-primary">
        <span>{project.project_no}</span>
        <span>{branding?.management_name}</span>
      </footer>
    </div>
  );
}

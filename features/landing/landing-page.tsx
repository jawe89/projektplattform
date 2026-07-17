import { LoginForm } from '@/features/auth/login-form';
import { publicBrandingUrl } from '@/lib/storage';
import type { TenantData } from '@/lib/tenant';
import { texts } from '@/lib/texts';

/**
 * Öffentliche Landingpage (M1, Gestaltung gemäss Design-Referenz
 * design-referenz/Landingpage.dc.html): Header mit Titelblock links und
 * Baumanagement-Block rechts (Logo oder Monogramm), Hero mit feinem Rahmen
 * und optionaler Bildunterschrift links/rechts, Info-Grid mit Accent-Titeln,
 * Login-Karte mit optionalem Untertext, Footer mit Projekt-Nr. und
 * ©-Zeile. Mobile (390): Login-Karte vor dem Info-Stack, Info-Zellen als
 * Label/Wert-Zeilen. Farben/Schriften ausschliesslich über CSS-Variablen.
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
  const year = new Date().getFullYear();
  const managementLine = [
    branding?.management_name,
    branding?.management_suffix,
  ]
    .filter(Boolean)
    .join(' ');
  const monogram = branding?.management_name?.trim().charAt(0).toUpperCase();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 sm:px-14">
      {/* Header: Titelblock links, Baumanagement (Logo oder Monogramm) rechts */}
      <header className="flex items-center justify-between gap-4 border-b border-line py-6 sm:py-8">
        <div className="min-w-0">
          <h1 className="display-title text-xl leading-tight font-medium tracking-[0.06em] text-ink sm:text-3xl">
            {project.name}
          </h1>
          {landing.subtitle && (
            <p className="display-title mt-1.5 text-[10px] tracking-[0.24em] text-primary sm:text-sm sm:tracking-[0.28em]">
              {landing.subtitle}
            </p>
          )}
        </div>
        {branding?.management_logo_path ? (
          // eslint-disable-next-line @next/next/no-img-element -- externe Storage-URL, Grösse variabel
          <img
            src={publicBrandingUrl(branding.management_logo_path)}
            alt={branding.management_name ?? ''}
            className="h-9 w-auto shrink-0 sm:h-12"
          />
        ) : branding?.management_name ? (
          <div className="flex shrink-0 items-center gap-3.5">
            <div className="hidden text-right sm:block">
              <p className="display-title text-lg font-semibold tracking-[0.12em] text-ink">
                {branding.management_name}
              </p>
              {branding.management_suffix && (
                <p className="display-title text-[11px] tracking-[0.24em] text-primary">
                  {branding.management_suffix}
                </p>
              )}
            </div>
            <div className="display-title flex h-9 w-9 items-center justify-center border border-ink text-base font-semibold text-ink sm:h-10 sm:w-10 sm:text-lg">
              {monogram}
            </div>
          </div>
        ) : null}
      </header>

      {/* Hero mit feinem Rahmen und optionaler Bildunterschrift */}
      {branding?.hero_path && (
        <div className="pt-5 sm:pt-10">
          <figure className="border border-line bg-white p-1.5 sm:p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- externe Storage-URL, Grösse variabel */}
            <img
              src={publicBrandingUrl(branding.hero_path)}
              alt={project.name}
              className="aspect-[16/10] w-full object-cover sm:aspect-[21/9]"
            />
          </figure>
          {(landing.heroCaptionLeft || landing.heroCaptionRight) && (
            <div className="mt-2 flex justify-between gap-4 text-[10px] tracking-[0.06em] text-primary sm:mt-2.5 sm:text-[11px]">
              <span>{landing.heroCaptionLeft}</span>
              <span>{landing.heroCaptionRight}</span>
            </div>
          )}
        </div>
      )}

      {landing.description && (
        <p className="max-w-2xl pt-6 text-sm leading-relaxed text-primary-dark sm:pt-8">
          {landing.description}
        </p>
      )}

      {/* Info-Grid + Login-Karte (mobil: Login zuerst) */}
      <main className="flex flex-1 flex-col gap-6 py-6 sm:py-10 lg:flex-row lg:gap-10">
        {infoCells.length > 0 && (
          <section className="order-2 h-fit flex-1 border-t border-line sm:grid sm:grid-cols-2 sm:border-l xl:grid-cols-4 lg:order-1">
            {infoCells.map((cell) => {
              const [firstLine, ...restLines] = cell.value.split('\n');
              return (
                <div
                  key={cell.label}
                  className="flex gap-4 border-b border-line py-4 sm:block sm:border-r sm:px-5 sm:py-6"
                >
                  <h2 className="display-title w-28 shrink-0 text-xs font-medium tracking-[0.18em] text-accent sm:mb-3.5 sm:w-auto sm:text-sm sm:tracking-[0.2em]">
                    {cell.label}
                  </h2>
                  <div className="min-w-0 text-xs leading-relaxed sm:text-[13px] sm:leading-[1.7]">
                    <p className="font-semibold text-ink">{firstLine}</p>
                    {restLines.length > 0 && (
                      <p className="whitespace-pre-line text-primary-dark">
                        {restLines.join('\n')}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* Login-Karte (LoginForm bleibt auch eingeloggt gemountet) */}
        <aside className="order-1 h-fit w-full shrink-0 border border-line bg-white p-5 sm:p-7 lg:order-2 lg:w-[340px]">
          <h2 className="display-title text-[15px] font-medium tracking-[0.2em] text-ink sm:text-base">
            {texts.landing.loginTitle}
          </h2>
          {landing.loginSubtext && (
            <p className="mt-1 text-xs text-primary">{landing.loginSubtext}</p>
          )}
          <div className="mt-4">
            <LoginForm isLoggedIn={isLoggedIn} />
          </div>
        </aside>
      </main>

      {/* Footer mit Projekt-Nr. und ©-Zeile */}
      <footer className="flex flex-col items-center gap-0.5 border-t border-line py-4 text-[10px] uppercase tracking-[0.08em] text-primary sm:flex-row sm:justify-between sm:py-5 sm:text-[11px]">
        <span>
          {project.project_no &&
            `${texts.landing.projectNoPrefix} ${project.project_no}`}
        </span>
        {managementLine && (
          <span>
            © {year} {managementLine}
          </span>
        )}
      </footer>
    </div>
  );
}

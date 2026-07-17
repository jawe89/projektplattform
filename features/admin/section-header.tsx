/**
 * Sektionskopf des Adminbereichs (Design-Referenz): Antonio-Titel mit
 * grauer Beschreibungszeile. Reine Darstellung, server-tauglich.
 */
export function AdminSectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-6">
      <h1 className="display-title text-lg font-medium tracking-[0.08em] text-ink sm:text-xl">
        {title}
      </h1>
      {description && (
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-primary">
          {description}
        </p>
      )}
    </div>
  );
}

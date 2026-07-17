'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { texts } from '@/lib/texts';

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const tabs = [
    { key: 'daten', label: texts.admin.tabs.daten },
    { key: 'branding', label: texts.admin.tabs.branding },
    { key: 'kategorien', label: texts.admin.tabs.kategorien },
    { key: 'rollen', label: texts.admin.tabs.rollen },
    { key: 'benutzer', label: texts.admin.tabs.benutzer },
  ];

  return (
    <nav className="mb-6 flex gap-1 border-b border-line">
      {tabs.map((tab) => {
        const href = `/projects/${projectId}/${tab.key}`;
        const active = pathname?.endsWith(`/${tab.key}`);
        return (
          <Link
            key={tab.key}
            href={href}
            className={`display-title -mb-px border-b-2 px-4 py-2 text-xs ${
              active
                ? 'border-accent text-ink'
                : 'border-transparent text-primary hover:text-ink'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

import type { Metadata } from 'next';
import { googleFontsUrl } from '@/features/theming/theme';
import { texts } from '@/lib/texts';
import './globals.css';

export const metadata: Metadata = {
  title: texts.common.platformName,
  description: texts.common.platformName,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de-CH">
      <head>
        {/* Default-Theme-Schriften; Tenant-Layouts laden ihre eigenen dazu */}
        <link rel="stylesheet" href={googleFontsUrl(null)} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}

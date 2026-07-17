# Dev-Umgebung (P2-M0): zweites Supabase-Projekt

Seit dem Go-Live ist die bisherige Datenbank Produktivbestand. Für die
Entwicklung (Phase 2 und alles Weitere) gibt es eine getrennte
Dev-Umgebung: ein zweites Supabase-Projekt. Lokal ist **Dev der Standard**;
Skripte laufen gegen Produktion nur mit expliziter Kennzeichnung.

## 1. Dev-Projekt anlegen (einmalig, ~10 Minuten)

1. https://supabase.com → **New Project**, z.B. `projektplattform-dev`
   (gleiche Organisation, Region wie Produktion, DB-Passwort sicher ablegen –
   wird für die Skripte nicht gebraucht).
2. **SQL-Editor**: die Migrationen aus `supabase/migrations/` **in
   Reihenfolge** ausführen:
   `0001_schema.sql` → `0002_rls.sql` → `0003_storage.sql` →
   `0004_management_branding.sql` → `0005_category_sorting.sql`
   (künftige Migrationen jeweils zuerst hier, erst beim Release auf Prod).
3. **Keys** notieren: Project Settings → API →
   `URL`, `anon public`, `service_role`.
4. Auth-Konfiguration ist für Dev nicht nötig (kein SMTP, keine
   Mailvorlagen – der token_hash-Flow läuft über die eigenen Routen, und
   Testbenutzer kommen aus dem Seed).

## 2. Lokale .env-Dateien umstellen

1. Bisherige `.env.local` (Produktiv-Keys!) **umbenennen** nach
   `.env.prod.local` – `LEGACY_BASIC_AUTH` bleibt dort.
2. Neue `.env.local` nach dem Muster von `.env.example` mit den
   **Dev-Keys** aus Schritt 1 anlegen (`ADMIN_DOMAIN` unverändert).

Ab dann gilt:

| Was | Umgebung |
|---|---|
| `npm run dev` (lokaler Server) | Dev (`.env.local`) |
| `npm run seed`, `npm run test:rls` | Dev – laufen ohne Flags |
| Skripte gegen Produktion | nur mit `TARGET=prod` (lädt `.env.prod.local`) |
| Vercel-Deployment | Produktion (eigene Env-Vars in Vercel, unverändert) |

**Prod-Kennzeichnung** (PowerShell bzw. Bash):

```
$env:TARGET='prod'; npm run import:wattwil      # PowerShell
TARGET=prod npm run import:wattwil              # Bash
```

Das Seed verlangt gegen Produktion zusätzlich `SEED_ALLOW_PROD=1`
(Doppelbestätigung); `test:rls` verweigert `TARGET=prod` grundsätzlich.

## 3. Eingebaute Sicherungen (`scripts/env.ts`)

- Jedes Skript meldet beim Start die Ziel-Umgebung («Dev» bzw.
  «⚠ PRODUKTION»).
- Zeigt `.env.local` noch auf die Produktiv-DB (Projekt-Ref-Prüfung),
  brechen alle Dev-Läufe ab – die Umstellung aus Schritt 2 kann also
  nicht vergessen werden.
- `TARGET=prod` gegen eine fremde DB bricht ebenfalls ab.

## 4. Abnahme P2-M0

```
npm run seed        # gegen Dev: Projekte, Kategorien, Testbenutzer
npm run test:rls    # gegen Dev: alle 23 Checks grün
```

Damit ist die Produktiv-DB vollständig von der lokalen Entwicklung
getrennt; die RLS-Tests sind wieder Teil des normalen Arbeitsablaufs.

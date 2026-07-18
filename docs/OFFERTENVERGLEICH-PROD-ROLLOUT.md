# Modul «Offertenvergleich» – Prod-Rollout (Runbook)

Stand: 18.07.2026 · O-M1 und O-M2 abgenommen (E2E-Nachweis auf Dev, siehe
`docs/OFFERTENVERGLEICH-O-M2.md`). Die vier Schritte in dieser Reihenfolge
ausführen; (1) und (2) sind zwingend Handgriffe von Jan (SQL-Editor bzw.
Vercel-Konto), (3) und (4) laufen über den Adminbereich bzw. das Modul.

---

## (1) Migrationen einspielen  [Handgriff Jan]

**Wo:** Supabase-Dashboard des **Produktiv**-Projekts → SQL-Editor.

**Was, in dieser Reihenfolge:**

1. `supabase/migrations/0010_offertenvergleich.sql`
   (Schema O-M1: Modul-Key-Constraints, ov_-Tabellen, RLS, Storage-Zweig)
2. `supabase/migrations/0011_offertenvergleich_vollstaendigkeit.sql`
   (O-M2: ov_dok_positionen, ov_abweichungen, parse_fortschritt, RLS)

Jede Datei komplett einfügen und ausführen; beide müssen ohne Fehler
durchlaufen. 0011 setzt 0010 voraus (Fremdschlüssel auf ov_-Tabellen).
Beide Migrationen sind auf Dev seit 18.07.2026 im Einsatz.

Kurzkontrolle danach im SQL-Editor:

```sql
select count(*) from ov_vergaben;        -- läuft fehlerfrei, 0 Zeilen
select count(*) from ov_abweichungen;    -- läuft fehlerfrei, 0 Zeilen
```

## (2) ANTHROPIC_API_KEY auf Vercel  [Handgriff Jan]

**Wo:** Vercel → Projekt → Settings → Environment Variables.

- Name: `ANTHROPIC_API_KEY` · Wert: der Anthropic-Key (wie in
  `.env.local`) · Environment: **Production** (Preview optional).
- **NIEMALS als `NEXT_PUBLIC_…` anlegen.** Alles mit dem Präfix
  `NEXT_PUBLIC_` wird in das Client-Bundle eingebaut und ist im Browser
  öffentlich lesbar – der Key wäre damit publiziert und müsste sofort
  rotiert werden. Der Offertenvergleich liest den Key ausschliesslich in
  Server-Code (KI-Erkenntnisse, Vollständigkeits-Extraktion).
- Danach **Redeploy** auslösen (Deployments → ⋯ → Redeploy) – Env-Werte
  gelten erst ab dem nächsten Deployment.

Ohne Key läuft das Modul trotzdem: Analyse/Statistik/Bericht
funktionieren, die KI-Erkenntnisse werden übersprungen (mit Hinweis im
UI) und die Vollständigkeitsprüfung bricht mit klarer Meldung ab.

## (3) Modul aktivieren + Rollen-Freigabe (Wattwil-Prod)

**Wo:** Adminbereich (`admin.projektplattform.ch`) → Projekt
«McDonald's Neubau Wattwil».

1. Tab **Module**: «Offertenvergleich» aktivieren.
2. Tab **Rollen**: in der Matrix für «Offertenvergleich» setzen:

   | Rolle | Freigabe |
   |---|---|
   | Bauleitung | **Sehen + Bearbeiten** |
   | Bauherr | keine |
   | Unternehmer | keine |
   | Architekt | keine |

   **Bewusster Entscheid (18.07.2026):** Preisspiegel und Bieterdaten
   bleiben intern bei der Bauleitung, bis Jan das ändert. Ohne Freigabe
   sehen nur Projekt-/Plattform-Admins und die Bauleitung das Modul;
   für alle anderen Rollen liefert auch der Direktaufruf der URL 404.

## (4) Sichtkontrolle (Prod, ohne KI-Stufe)

Checkliste – alles ohne Kosten, die KI wird dabei nicht aufgerufen:

- [ ] **Hub als Bauleitung**: Modul-Karte «Offertenvergleich» erscheint;
      Klick öffnet die (leere) Vergabe-Übersicht.
- [ ] **Direktzugriff andere Rolle**: als Bauherr/Unternehmer/Architekt
      `…/module/offertenvergleich` direkt aufrufen → **404**.
- [ ] **Probelauf Upload/Storage**: Als Bauleitung eine Test-Vergabe
      anlegen (z.B. BKP «999», Titel «Rollout-Test»), ein beliebiges
      PDF als Beilage hochladen, wieder öffnen (Signed-URL-Download
      funktioniert = Storage-Policies greifen), Dokument entfernen und
      die Test-Vergabe löschen («Vergabe löschen» räumt Storage mit ab).
      **Keine Analyse und keine Vollständigkeitsprüfung starten** – nur
      so bleibt der Lauf ohne API-Kosten.

Serverseitige Gegenkontrolle (optional, read-only per Skript möglich):
`project_modules` enthält (`wattwil`, `offertenvergleich`),
`role_module_access` genau eine Zeile Bauleitung mit `can_view` und
`can_edit`.

---

## Erster Produktiv-Ernstfall

Die erste echte Vergabe – **geplant ab BKP 271 (Gipserarbeiten)** – ist
der Produktiv-Ernstfall des Moduls: BauPlus-Positionenvergleich
hochladen → Analyse → Kontrollsummen aus den Offerten erfassen →
Offerten hochladen und Bietern zuordnen → Vollständigkeit prüfen →
Abweichungen bewerten → PDF-Bericht. Der Bericht der letzten
Dev-Abnahme (BKP 211) dient als Referenz.

**API-Kosten:** grob **im einstelligen Frankenbereich pro Lauf**
(KI-Erkenntnisse wenige Rappen bis Franken; Vollständigkeitsprüfung je
nach Umfang/Scans der Offerten – der 211er-Komplettlauf mit drei
Offerten à ~100–140 Seiten lag bei einem tiefen zweistelligen
Frankenbetrag inkl. Wiederholung, ein normaler Lauf darunter).
Re-Analysen und erneute Prüfungen setzen auf bereits gelesenen
Dokumenten auf und kosten entsprechend wenig.

Zurückgestellt: O-M3 (Cross-BKP-Doppelverrechnung, Was-wäre-wenn,
Export-Varianten) auf Anweisung; Grenzen der Produktprüfung siehe
`docs/OFFERTENVERGLEICH-O-M2.md`.

# Ausbauliste – bewusst zurückgestellte Punkte

Konsolidierte Sammlung aller Punkte, die während der Umsetzung (M0–M5,
Phase 2, Design-Runde Juli 2026) bewusst zurückgestellt wurden. Kein
Arbeitsauftrag – die Liste hält fest, **was** zurückgestellt wurde,
**woher** der Punkt stammt und **wo** er technisch anknüpft, damit nichts
in alten Berichten verloren geht.

Stand: 17.07.2026 (Abschluss Design-Runde).

---

## 1. Hub-Suchfeld

**Status: umgesetzt (18.07.2026).** Suchfeld in der Hub-Kopfzeile,
clientseitig über Badge/Titel/Untertitel inkl. Unterpositionen,
akzent-/gross-kleinschreibungs-unabhängig; Kategorien ohne Treffer
ausgeblendet, Zähler «3 von 22», Drag während Suche deaktiviert.

**Was:** Suchfeld in der Hub-Toolbar («Dokument oder BKP-Nr. suchen…»),
das die Dokumentliste über alle Kategorien filtert.

**Herkunft:** Design-Referenz `design-referenz/Dokumenten-Hub.dc.html`
(Toolbar) – in Bereich 2 der Design-Runde bewusst nicht umgesetzt
(reines Styling-Mandat, keine neue Funktionalität).

**Anknüpfung:** `features/hub/hub-client.tsx` hält alle Dokumente im
Client-State – ein Filter über `doc.data`-Feldwerte (inkl. Badge-Feld =
BKP-Nr.) wäre rein clientseitig möglich, ohne neue Abfragen.

## 2. «Alle N anzeigen» (Hub-Kategorien einklappen)

**Was:** Listen-Kategorien zeigen initial nur die ersten Einträge, dazu
ein Link «Alle 74 Dokumente anzeigen →», der die Kategorie aufklappt.

**Herkunft:** Design-Referenz Dokumenten-Hub (Listen-Karten) – in
Bereich 2 bewusst nicht umgesetzt; der Hub zeigt weiterhin alle
Dokumente direkt (bei den aktuellen Beständen unkritisch).

**Anknüpfung:** `features/hub/hub-client.tsx` (`listCard`); reiner
Client-State pro Kategorie. Sinnvoll erst ab deutlich grösseren
Dokumentbeständen.

## 3. LV-Phasen-Filter

**Was:** Filter der Workflow-Matrix auf die «aktive Phase» («16 von 67
Vergabeeinheiten · Filter ‹aktive Phase›» mit «Alle 67 anzeigen →») –
also nur Einheiten, die weder offen noch abgeschlossen sind.

**Herkunft:** Design-Referenz `design-referenz/Leistungsverzeichnis.dc.html`
(Matrix-Kopf) – in Bereich 4 bewusst nicht umgesetzt.

**Anknüpfung:** `features/lv/lv-client.tsx`; `unitStatus()` aus
`lib/lv-logic.ts` liefert die nötige Klassifizierung (`in_arbeit`)
bereits, der Filter wäre reiner Client-State. Die Zählerzeile der
Schrittspalten (`stepCounts`) müsste definieren, ob sie gefiltert oder
gesamthaft zählt.

## 4. Baseline-Vergleich (BKK)

**Was:** Zwei KV-Baselines nebeneinander vergleichen (z.B. «KV orig.»
vs. revidierter KV) statt nur eine Baseline betrachten.

**Herkunft:** P2-M2-Entscheid «Lesart B», siehe
`docs/P2-DATENMODELL.md` (Abschnitt Baselines, «Ausbaupunkt (nicht v1)»).

**Anknüpfung:** Datenmodell ist vorbereitet – `bkk_baselines` +
`bkk_position_baseline_values` halten beliebig viele Stände; die
Ansicht einer alten Baseline (`?baseline=` read-only) existiert bereits
in `features/bkk/bkk-client.tsx`. Fehlt: eine Gegenüberstellung zweier
Baselines in einer Tabelle.

## 5. LV-Offertbeträge (`lv_offers`)

**Was:** Erfassung von Offertbeträgen je Vergabeeinheit/Unternehmer im
LV-Modul (Vergleich, Verknüpfung mit Offerten-PDF im Hub).

**Herkunft:** Spezifikation P2 nannte «Offerten je Einheit mit
Beträgen»; der Fachblick ergab, dass das Alt-Tool keine Offertbeträge
kennt – als **neues Feature** zurückgestellt, siehe
`docs/P2-DATENMODELL.md` (Befund + Migrationsentscheid 1).

**Anknüpfung:** Tabelle `lv_offers` ist mit Migration 0009 angelegt
(inkl. RLS) und leer; Typ `LvOffer` in `lib/types.ts` existiert. Fehlt:
Erfassungs-UI im LV-Modul und ggf. eine Anzeige in der Matrix.

## 6. Send-E-Mail-Hook / transaktionaler Mailversand

**Was:** Eigener Mailversand über einen transaktionalen Provider (z.B.
Resend, via Supabase Send-Email-Hook) statt des Supabase-Standardversands.
Konkreter Anlass: Beim Einladen eines **bestehenden, bestätigten**
Kontos verschickt Supabase keine Mail (`email_exists`) – eine
Hinweis-Mail («Sie wurden dem Projekt X hinzugefügt») wäre erst damit
möglich.

**Herkunft:** Benutzerverwaltung M3 / Invite-UX-Runde, siehe
`docs/SUPABASE-MAILVORLAGEN.md` (Abschnitt Re-Invite-Verhalten).

**Anknüpfung:** `features/admin/actions.ts` (`inviteUser`) meldet den
Fall bereits explizit im UI; der Hook wäre in Supabase zu konfigurieren,
der Provider-Aufruf serverseitig zu ergänzen.

## 7. Demo-Befüllungsskript

**Status: umgesetzt (18.07.2026).** `scripts/seed-demo-showcase.ts`
(`npm run seed:demo-showcase`, TARGET=prod-fähig, idempotent) – Details
und Demo-Konto in `docs/DEMO-PROJEKT.md`.

**Was:** Skript, das das Demo-Projekt (Bürohaus Demo Frauenfeld) mit
repräsentativen, konsistenten Inhalten füllt – Hub-Dokumente über alle
Kategorien, BKK mit allen Status-/Ampelfällen, LV-Matrix mit gemischten
Ständen – als vorführbarer Musterstand für Interessenten.

**Herkunft:** Design-Runde – das Demo-Projekt trägt nur den schlanken
Seed-/Testbestand (BKK-Testdatensatz der Status-Fälle, wenige
Dokumente); für Vorführungen bewusst zurückgestellt.

**Anknüpfung:** `scripts/seed.ts` (idempotentes Muster, `ensure*`-
Helfer) als Vorlage; alternativ eigenes `scripts/seed-demo.ts` nur für
das Demo-Projekt, gleiche Env-Schutzmechanik über `scripts/env.ts`.

---

**Weitere Ideen** (älter, aus dem Konzept, Phase 3 «Ausbau»):
Vercel-Domain-API-Automatisierung, Benachrichtigungen bei neuen
Dokumenten, Zugriffsprotokoll, PDF-Vorschau – siehe
`projektplattform-konzept.md`.

# Regeln für alle Agenten

Verbindliche Spezifikation: `docs/ARCHITEKTUR.md`. Abnahme: `docs/ABNAHME.md`.

## Dateigrenzen

| Wer | darf ändern |
| --- | --- |
| Koordinator | `src/core/**`, `src/shell/**`, `package.json`, alle Konfigurationsdateien |
| Worker ideas | nur `src/modules/ideas/**` |
| Worker income | nur `src/modules/income/**` |
| Worker fixed-costs | nur `src/modules/fixed-costs/**` |
| Worker debts | nur `src/modules/debts/**` |

Braucht ein Worker eine Änderung außerhalb seines Ordners (neues Paket, neues Feld, neuer Helfer in `core`), postet er sie aufs Board und ändert nichts selbst. `docs/**` ändert niemand.

## Harte Regeln

1. Kein Modul importiert aus einem anderen Modul. Nur aus `src/core`.
2. Jedes Modul schreibt nur in seine eigenen Tabellen (Tabelle „Wer schreibt, wer liest“).
3. `src/core/model.ts`, `waterfall.ts`, `db.ts` und die beiden Testdateien sind Kopien aus `docs/reference/core/`. Nicht umschreiben, nicht „verbessern“.
4. Tests nie anpassen, damit sie grün werden. Schlägt ein Test fehl, ist der Code falsch.
5. Geld immer als ganze Cent (`number`). Umrechnung in Euro nur bei Ein- und Ausgabe über `src/core/money.ts`.
6. Kein Backend, kein Login, keine Bank-API, kein Tracking, keine Netzwerkzugriffe zur Laufzeit.
7. Keine Schlüssel, Tokens oder Passwörter im Repository. Keine `.env`-Dateien committen.
8. Fremde Tabellen nur lesen, über `useLiveQuery`. Wasserfall-Eingaben nur über `loadWaterfallInput`.

## Konventionen

- Oberfläche auf Deutsch, mobile-first, Beträge als `1.234,56 €` (`Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' })`).
- IDs mit `crypto.randomUUID()`. Datum als `YYYY-MM-DD`, Monat als `YYYY-MM`.
- Archivieren statt löschen (`archivedAt`).
- Jedes Modul exportiert in `index.ts` genau ein `ModuleManifest`.
- Eingaben mit Zod prüfen, bevor sie in die Datenbank gehen.
- TypeScript strict, kein `any`.

## Befehle

```
npm run typecheck
npm run lint
npm test
npm run build
```

Alle vier müssen vor jeder Fertigmeldung fehlerfrei laufen.

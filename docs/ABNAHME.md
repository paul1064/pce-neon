# Abnahme

Der Verifier arbeitet diese Liste ab und meldet jeden Punkt mit bestanden oder nicht bestanden.

## 1. Automatisch

- [ ] `npm run typecheck && npm run lint && npm test && npm run build` laufen fehlerfrei.
- [ ] `src/core/model.ts`, `waterfall.ts`, `db.ts`, `waterfall.test.ts`, `db.test.ts` sind inhaltsgleich mit `docs/reference/core/` (`diff -r docs/reference/core src/core` zeigt nur zusätzliche Dateien).
- [ ] Kein Modul importiert aus einem anderen Modul: `grep -rnE "from '.*modules/" src/modules` findet nur Importe innerhalb des eigenen Ordners.
- [ ] Kein `fetch`, `XMLHttpRequest` oder `WebSocket` in `src/`.
- [ ] Kein `any` in `src/`.

## 2. Durchlauf im eingebauten Browser

Monat: der aktuelle.

1. Idee „Testidee“ anlegen, alle fünf Kriterien mit 4 bewerten. Erwartet: Score 75, Status validiert.
2. Idee zum Projekt machen. Erwartet: Projekt existiert, Idee zeigt den Status „befördert“.
3. Quelle „Shop“ zum Projekt und Quelle „Umfragen“ als Micro-Task anlegen.
4. 380,00 € auf „Shop“ und 240,00 € auf „Umfragen“ buchen. Erwartet: Monatssumme 620,00 €.
5. Abos anlegen: 20,00 € (Priorität 1), 12,99 € (Priorität 2), 9,99 € (Priorität 3), alle monatlich. Erwartet: 3 von 3 gedeckt, Überschuss 577,02 €.
6. Schulden anlegen: A 300,00 € zu 0 %, Mindestrate 25,00 €. B 1.800,00 € zu 12,5 %, Mindestrate 50,00 €. C 950,00 € zu 6 %, Mindestrate 30,00 €.
7. Strategie Schneeball. Erwartet: A 300,00 € (25,00 + 275,00), C 227,02 € (30,00 + 197,02), B 50,00 €.
8. Strategie Lawine. Erwartet: B 522,02 € (50,00 + 472,02), C 30,00 €, A 25,00 €.
9. Prognose. Erwartet: beide Strategien 6 Monate, Zinsen Lawine 64,86 €, Schneeball 90,27 €.
10. Monatsabschluss mit Schneeball, alle Zahlungen bestätigen. Erwartet: A getilgt, C 722,98 €, B 1.750,00 €.
11. Denselben Monat noch einmal abschließen. Erwartet: wird verhindert.
12. Eine Buchung löschen, sodass nur 25,00 € Einnahmen bleiben (in einem neuen Monat testen). Erwartet: Lücke bei den Fixkosten 17,98 €, nichts fließt in Schulden.
13. JSON exportieren, alle Daten löschen, JSON importieren. Erwartet: derselbe Stand.
14. Netz trennen und neu laden. Erwartet: App läuft, Daten sind da.

## 3. Abschlussbericht

- Was gebaut ist, je Modul.
- Was offen bleibt.
- Jede Abweichung von `docs/ARCHITEKTUR.md` mit Begründung.
- Verbrauch: Anzahl Worker, Laufzeit.

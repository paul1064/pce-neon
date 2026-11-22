# Swarm-Prompt für Antigravity

Vorbereitung:

1. Dieses Repository klonen und den Ordner in Antigravity öffnen.
2. Im Modellwähler **Gemini 4 Neon** wählen, nicht „Orchestrator (Neon)“. Denkstufe **High**.
3. Den Block unten als eine Nachricht senden.

```text
/swarm Baue die „Personal-Cashflow-Engine“ als lokale PWA in diesem Repository. Lies zuerst vollständig AGENTS.md, docs/ARCHITEKTUR.md und docs/ABNAHME.md. Sie sind verbindlich.

ZIEL
Installierbare Offline-PWA mit Shell und vier Modulen: Ideen-Sammler, Einkommens-Tracker, Abo-Gegenfinanzierer, Schuldentilger. Stack und Struktur wie in docs/ARCHITEKTUR.md. Oberfläche auf Deutsch, mobile-first.

MODELLE
Koordinator und Verifier: Gemini 4 Neon. Alle Worker: Gemini 4 Hydrogen.

ABLAUF
Phase 1, nur Koordinator, kein Worker startet vorher:
- Vite-Projekt im Repository-Stamm anlegen, Skripte typecheck, lint, test, build einrichten.
- Alle Dateien aus docs/reference/core/ unverändert nach src/core/ kopieren. Dazu money.ts und modules.ts schreiben.
- src/shell/ bauen wie im Abschnitt „Shell“ beschrieben. registry.ts enthält alle vier Module als lazy Platzhalter.
- Erst wenn typecheck, test und build grün sind, committen und Phase 2 starten.
Phase 2, parallel, genau vier Worker, einer pro Modul. Umfang: Abschnitt „Umfang je Modul“. Dateigrenzen: AGENTS.md.
Phase 3: Der Verifier arbeitet docs/ABNAHME.md Punkt für Punkt ab. Nicht bestandene Punkte gehen an den zuständigen Worker zurück, höchstens drei Runden.

NICHT ÄNDERN
- Alles unter docs/.
- Die fünf kopierten Dateien in src/core/ und ihre Testerwartungen.
- Die harten Regeln in AGENTS.md.

PRÜFUNG
Fertig ist der Lauf, wenn jeder Punkt in docs/ABNAHME.md bestanden ist. Liefere dann den Abschlussbericht aus Abschnitt 3.
```

## Wenn etwas hakt

- **Worker steht still:** Ein Mitglied ohne Kontingent pausiert und läuft nicht von selbst an. Aufs Board posten oder sein Modell wechseln.
- **Zwei Worker an derselben Datei:** Koordinator auf Denkstufe Extra High stellen und die Dateigrenzen aus AGENTS.md wiederholen.
- **Kontingent schonen:** In Phase 2 nur den Worker ideas starten lassen. Die anderen drei Module später mit demselben Prompt nachziehen.

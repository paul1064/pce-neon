import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, ArrowRight, Download, Sparkles, X } from 'lucide-react';
import {
  DEFAULT_SETTINGS,
  currentYearMonth,
  db,
  formatCents,
  formatYearMonth,
  todayISO,
  useMonth,
  useWaterfall,
} from '../core';
import { modules } from './registry';
import {
  dismissExportReminderForMonth,
  exportAllData,
  markExportedNow,
  shouldShowExportReminder,
} from './backup';
import { loadDemoData } from './demoData';

export function DashboardPage() {
  const { month } = useMonth();
  const waterfall = useWaterfall(month);
  const settings = useLiveQuery(() => db.settings.get('settings'), []);
  const hasAnyData = useLiveQuery(async () => {
    const counts = await Promise.all([
      db.ideas.count(),
      db.projects.count(),
      db.incomeSources.count(),
      db.incomeEntries.count(),
      db.fixedCosts.count(),
      db.debts.count(),
    ]);
    return counts.some((c) => c > 0);
  }, []);

  const [reminderDismissed, setReminderDismissed] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const enabledIds = settings?.enabledModules ?? DEFAULT_SETTINGS.enabledModules;
  const visibleModules = modules.filter((m) => enabledIds.includes(m.id));
  const showReminder =
    !reminderDismissed &&
    shouldShowExportReminder(currentYearMonth(), Boolean(hasAnyData));
  const isEmpty = hasAnyData === false;

  const handleLoadDemo = async () => {
    setLoadingDemo(true);
    try {
      await loadDemoData(db, month);
    } finally {
      setLoadingDemo(false);
    }
  };

  const handleQuickExport = async () => {
    const payload = await exportAllData(db);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cashflow-engine-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    markExportedNow();
    setReminderDismissed(true);
  };

  const handleDismissReminder = () => {
    dismissExportReminderForMonth(currentYearMonth());
    setReminderDismissed(true);
  };

  const result = waterfall?.result;
  const strategyLabel =
    (waterfall?.input.strategy ?? settings?.debtStrategy ?? 'avalanche') === 'snowball'
      ? 'Schneeball'
      : 'Lawine';

  return (
    <div className="space-y-6">
      {/* Export-Erinnerung */}
      {showReminder && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              Monatliche Sicherung empfohlen: Alle Daten liegen nur lokal auf diesem Gerät.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleQuickExport}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Jetzt exportieren
            </button>
            <button
              type="button"
              onClick={handleDismissReminder}
              aria-label="Erinnerung für diesen Monat ausblenden"
              className="rounded-lg p-1 text-amber-700 hover:bg-amber-100 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Schnellstart im Leerzustand */}
      {isEmpty && (
        <section
          aria-label="Schnellstart"
          className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-xs space-y-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                Willkommen · Schnellstart
              </p>
              <h2 className="mt-1 text-base font-bold text-slate-900">
                So startest du mit deiner Cashflow-Engine
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Alle Eingaben bleiben 100 % lokal auf deinem Gerät – ganz ohne Konto oder Server.
              </p>
            </div>
            <button
              type="button"
              disabled={loadingDemo}
              onClick={() => void handleLoadDemo()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {loadingDemo ? 'Lädt …' : 'Beispieldaten laden'}
            </button>
          </div>

          <ol className="grid gap-2 sm:grid-cols-2 text-xs">
            <li>
              <Link
                to="/einnahmen"
                className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200/80 bg-white px-3 py-2.5 font-medium text-slate-800 hover:border-emerald-400 transition-colors"
              >
                <span>
                  <strong className="text-emerald-700">1.</strong> Einnahmequelle &amp; Buchung anlegen
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              </Link>
            </li>
            <li>
              <Link
                to="/abos"
                className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200/80 bg-white px-3 py-2.5 font-medium text-slate-800 hover:border-emerald-400 transition-colors"
              >
                <span>
                  <strong className="text-emerald-700">2.</strong> Abos &amp; Fixkosten eintragen
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              </Link>
            </li>
            <li>
              <Link
                to="/schulden"
                className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200/80 bg-white px-3 py-2.5 font-medium text-slate-800 hover:border-emerald-400 transition-colors"
              >
                <span>
                  <strong className="text-emerald-700">3.</strong> Schulden &amp; Tilgungsplan prüfen
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              </Link>
            </li>
            <li>
              <Link
                to="/ideen"
                className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200/80 bg-white px-3 py-2.5 font-medium text-slate-800 hover:border-emerald-400 transition-colors"
              >
                <span>
                  <strong className="text-emerald-700">4.</strong> Neue Einkommensideen bewerten
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              </Link>
            </li>
          </ol>

          <p className="text-[11px] text-slate-500">
            Tipp: „Beispieldaten laden“ trägt das Rechenbeispiel (620 € Einnahmen, 3 Abos, 3 Schulden) zum Ausprobieren ein – jederzeit unter Einstellungen wieder löschbar.
          </p>
        </section>
      )}

      {/* Wasserfall-Überblick */}
      <section className="rounded-2xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Cashflow-Wasserfall · {formatYearMonth(month)}
            </p>
            <h1 className="mt-1 text-2xl font-bold tabular-nums">
              {result ? formatCents(result.totalIncome) : '…'}
            </h1>
            <p className="text-xs text-slate-400">Einnahmen im Topf · Strategie: {strategyLabel}</p>
          </div>
          <Link
            to="/einstellungen"
            className="text-xs font-medium text-emerald-300 hover:text-emerald-200 transition-colors"
          >
            Strategie & Puffer anpassen
          </Link>
        </div>

        {result && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="min-w-0 rounded-xl bg-white/8 p-3">
              <p className="text-xs text-slate-300">Fixkosten gedeckt</p>
              <p className="mt-1 text-base font-semibold tabular-nums">
                {formatCents(result.fixedCostsCovered)}
              </p>
              <p className="text-[11px] text-slate-400 tabular-nums">
                von {formatCents(result.fixedCostsDue)}
              </p>
            </div>
            <div className="min-w-0 rounded-xl bg-white/8 p-3">
              <p className="text-xs text-slate-300">Überschuss</p>
              <p
                className={`mt-1 text-base font-semibold tabular-nums ${
                  result.fixedCostGap > 0 ? 'text-amber-300' : 'text-emerald-300'
                }`}
              >
                {formatCents(result.surplus)}
              </p>
              <p className="text-[11px] text-slate-400 tabular-nums">
                {result.fixedCostGap > 0
                  ? `Lücke: ${formatCents(result.fixedCostGap)}`
                  : 'Nach Fixkosten'}
              </p>
            </div>
            <div className="min-w-0 rounded-xl bg-white/8 p-3">
              <p className="text-xs text-slate-300">In Schulden</p>
              <p className="mt-1 text-base font-semibold tabular-nums text-sky-300">
                {formatCents(result.totalToDebt)}
              </p>
              <p className="text-[11px] text-slate-400 tabular-nums">
                {result.minimumGap > 0
                  ? `Mindestraten-Lücke: ${formatCents(result.minimumGap)}`
                  : 'Mindest + Extra'}
              </p>
            </div>
            <div className="min-w-0 rounded-xl bg-white/8 p-3">
              <p className="text-xs text-slate-300">Puffer / Frei</p>
              <p className="mt-1 text-base font-semibold tabular-nums">
                {formatCents(result.bufferHeld + result.unallocated)}
              </p>
              <p className="text-[11px] text-slate-400 tabular-nums">
                Puffer {formatCents(result.bufferHeld)} · Frei {formatCents(result.unallocated)}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Modul-Kacheln */}
      <section aria-label="Module">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Module
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {visibleModules.map((mod) => {
            const Card = mod.DashboardCard;
            return (
              <div key={mod.id} className="flex min-w-0 flex-col">
                {Card ? (
                  <Card month={month} />
                ) : (
                  <Link
                    to={mod.path}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-xs hover:border-slate-300 transition-colors"
                  >
                    <span className="font-semibold text-slate-900">{mod.title}</span>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

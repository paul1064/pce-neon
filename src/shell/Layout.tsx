import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Home,
  Lightbulb,
  Repeat,
  Settings,
  TrendingUp,
  WifiOff,
} from 'lucide-react';
import {
  DEFAULT_SETTINGS,
  db,
  formatYearMonth,
  nextMonth,
  prevMonth,
  useMonth,
  type ModuleId,
} from '../core';
import { modules } from './registry';
import { useOnlineStatus } from './pwa';

const MODULE_ICONS: Record<ModuleId, typeof Lightbulb> = {
  ideas: Lightbulb,
  income: TrendingUp,
  fixedCosts: Repeat,
  debts: CreditCard,
};

export function Layout({ children }: { children: ReactNode }) {
  const { month, setMonth } = useMonth();
  const online = useOnlineStatus();
  const settings = useLiveQuery(() => db.settings.get('settings'), []);
  const enabledIds = settings?.enabledModules ?? DEFAULT_SETTINGS.enabledModules;
  const visibleModules = modules.filter((m) => enabledIds.includes(m.id));

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 flex flex-col">
      {/* Kopfzeile */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <NavLink to="/" className="flex items-center gap-2 font-semibold text-slate-900 truncate">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-emerald-400 text-xs font-bold tracking-tight">
                PCE
              </span>
              <span className="hidden sm:inline truncate">Cashflow-Engine</span>
            </NavLink>
            {!online && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                title="Offline-Modus aktiv"
              >
                <WifiOff className="h-3.5 w-3.5" />
                Offline
              </span>
            )}
          </div>

          {/* Monatsauswahl */}
          <div
            className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-0.5"
            aria-label="Monatsauswahl"
          >
            <button
              type="button"
              onClick={() => setMonth(prevMonth(month))}
              className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-slate-900 transition-colors"
              aria-label="Vorheriger Monat"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <label className="relative flex items-center px-2 py-1 text-sm font-semibold text-slate-900 cursor-pointer select-none">
              <span data-testid="active-month-label">{formatYearMonth(month)}</span>
              <input
                type="month"
                value={month}
                onChange={(e) => {
                  if (/^\d{4}-\d{2}$/.test(e.target.value)) {
                    setMonth(e.target.value);
                  }
                }}
                aria-label="Monat wählen"
                className="sr-only"
              />
            </label>
            <button
              type="button"
              onClick={() => setMonth(nextMonth(month))}
              className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-slate-900 transition-colors"
              aria-label="Nächster Monat"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Einstellungen */}
          <NavLink
            to="/einstellungen"
            aria-label="Einstellungen"
            className={({ isActive }) =>
              `inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            <Settings className="h-4 w-4" />
            <span className="hidden md:inline">Einstellungen</span>
          </NavLink>
        </div>

        {/* Desktop-Navigation */}
        <nav
          aria-label="Hauptnavigation"
          className="hidden md:block border-t border-slate-100 bg-white"
        >
          <div className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-1.5">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Home className="h-4 w-4" />
              Startseite
            </NavLink>
            {visibleModules.map((mod) => {
              const Icon = MODULE_ICONS[mod.id];
              return (
                <NavLink
                  key={mod.id}
                  to={mod.path}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  {mod.title}
                </NavLink>
              );
            })}
          </div>
        </nav>
      </header>

      {/* Hauptinhalt */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-24 md:pb-10">
        {children}
      </main>

      {/* Mobile Bottom-Navigation */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-xs md:hidden"
      >
        <div
          className="mx-auto grid max-w-lg"
          style={{ gridTemplateColumns: `repeat(${visibleModules.length + 1}, minmax(0, 1fr))` }}
        >
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                isActive ? 'text-emerald-700' : 'text-slate-500'
              }`
            }
          >
            <Home className="h-5 w-5" />
            <span>Start</span>
          </NavLink>
          {visibleModules.map((mod) => {
            const Icon = MODULE_ICONS[mod.id];
            return (
              <NavLink
                key={mod.id}
                to={mod.path}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                    isActive ? 'text-emerald-700' : 'text-slate-500'
                  }`
                }
              >
                <Icon className="h-5 w-5" />
                <span className="truncate max-w-full px-1">{mod.title}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

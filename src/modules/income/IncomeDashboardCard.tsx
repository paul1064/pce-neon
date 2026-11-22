import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, Wallet } from 'lucide-react';
import { db, formatCents, formatYearMonth, type YearMonth } from '../../core';
import { summarizeMonthIncome } from './logic';

export interface IncomeDashboardCardProps {
  month: YearMonth;
}

export function IncomeDashboardCard({ month }: IncomeDashboardCardProps) {
  const data = useLiveQuery(async () => {
    const [entries, sources] = await Promise.all([
      db.incomeEntries.where('month').equals(month).toArray(),
      db.incomeSources.toArray(),
    ]);
    const activeSources = sources.filter((s) => !s.archivedAt);
    return {
      summary: summarizeMonthIncome(entries, sources),
      activeSourceCount: activeSources.length,
    };
  }, [month]);

  const summary = data?.summary;
  const activeSourceCount = data?.activeSourceCount ?? 0;

  return (
    <Link
      to="/einnahmen"
      className="group flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-colors hover:border-emerald-300"
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Wallet className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Einnahmen diesen Monat
              </h3>
              <p className="text-xs text-slate-500">{formatYearMonth(month)}</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-600" />
        </div>

        <p className="mt-4 text-2xl font-bold text-slate-900 tabular-nums">
          {summary ? formatCents(summary.totalCents) : '…'}
        </p>

        {summary && summary.hasExcludedSources && (
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            Im Wasserfall: {formatCents(summary.waterfallCents)}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span className="tabular-nums">
          {summary
            ? `${summary.entryCount} ${summary.entryCount === 1 ? 'Buchung' : 'Buchungen'}`
            : 'Lädt …'}
        </span>
        <span>
          {activeSourceCount === 0
            ? 'Noch keine Quelle angelegt'
            : `${activeSourceCount} ${activeSourceCount === 1 ? 'aktive Quelle' : 'aktive Quellen'}`}
        </span>
      </div>
    </Link>
  );
}

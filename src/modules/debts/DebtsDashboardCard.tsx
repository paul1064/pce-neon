import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import {
  db,
  formatCents,
  formatYearMonth,
  useWaterfall,
  type YearMonth,
} from '../../core';

export function DebtsDashboardCard({ month }: { month: YearMonth }) {
  const waterfall = useWaterfall(month);
  const debts = useLiveQuery(() => db.debts.toArray(), []);
  const existingClose = useLiveQuery(
    () => db.monthCloses.where('month').equals(month).first(),
    [month],
  );

  const activeDebts = (debts ?? []).filter((d) => !d.archivedAt);
  const openDebts = activeDebts.filter((d) => d.status === 'open' && d.balance > 0);
  const paidDebtsCount = activeDebts.filter((d) => d.status === 'paid' || d.balance === 0).length;
  const totalOpenBalance = openDebts.reduce((sum, d) => sum + d.balance, 0);

  const effectiveResult = existingClose?.result ?? waterfall?.result;
  const plannedToDebt = effectiveResult?.totalToDebt ?? 0;
  const hasGap =
    effectiveResult !== undefined &&
    (effectiveResult.fixedCostGap > 0 || effectiveResult.minimumGap > 0);

  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Stufe 4 · Schuldentilger
            </p>
            <h3 className="mt-1 text-base font-semibold text-slate-900">Schulden & Tilgung</h3>
          </div>
          {existingClose ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Abgeschlossen
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              Offen
            </span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Offene Restschuld</p>
            <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums">
              {debts ? formatCents(totalOpenBalance) : '…'}
            </p>
            <p className="text-[11px] text-slate-500">
              {openDebts.length} offen · {paidDebtsCount} getilgt
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">
              {existingClose ? 'Abgeschlossen' : 'Geplant'} ({formatYearMonth(month)})
            </p>
            <p
              className={`mt-1 text-lg font-bold tabular-nums ${
                plannedToDebt > 0 ? 'text-emerald-700' : 'text-slate-700'
              }`}
            >
              {effectiveResult ? formatCents(plannedToDebt) : '…'}
            </p>
            <p className="text-[11px] text-slate-500">
              {existingClose ? 'Monatsabschluss fixiert' : 'Mindest + Extra'}
            </p>
          </div>
        </div>

        {hasGap && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
            <span>
              {effectiveResult.fixedCostGap > 0
                ? `Fixkosten-Lücke (${formatCents(effectiveResult.fixedCostGap)}) – nichts fließt in Schulden.`
                : `Mindestraten-Lücke: ${formatCents(effectiveResult.minimumGap)}.`}
            </span>
          </div>
        )}

        {!hasGap && activeDebts.length > 0 && openDebts.length === 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span>Alle erfassten Schulden sind vollständig getilgt.</span>
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3">
        <Link
          to="/schulden"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-800 transition-colors"
        >
          Zum Schuldentilger
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

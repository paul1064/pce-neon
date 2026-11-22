import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { db, formatCents, useWaterfall, type YearMonth } from '../../core';
import { summarizeFixedCostCoverage } from './logic';

interface FixedCostsDashboardCardProps {
  month: YearMonth;
}

export function FixedCostsDashboardCard({ month }: FixedCostsDashboardCardProps) {
  const waterfall = useWaterfall(month);
  const allFixedCosts = useLiveQuery(() => db.fixedCosts.toArray(), []);

  const result = waterfall?.result;
  const summary = result ? summarizeFixedCostCoverage(result, allFixedCosts ?? []) : null;
  const hasGap = (result?.fixedCostGap ?? 0) > 0;

  return (
    <section className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Abo-Gegenfinanzierer</h3>
              <p className="text-xs text-slate-500">Stufe 3 · Fixkosten-Deckung</p>
            </div>
          </div>

          {summary && summary.totalCount > 0 && (
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
                hasGap
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800'
              }`}
            >
              {summary.coveredCount} von {summary.totalCount} gedeckt
            </span>
          )}
        </div>

        {result && summary ? (
          <div className="space-y-2.5">
            {summary.totalCount === 0 ? (
              <p className="text-sm text-slate-500">
                Keine aktiven Abos in diesem Monat hinterlegt.
              </p>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5">
                  <span className="text-xs font-medium text-slate-600">
                    {hasGap ? 'Lücke bei Fixkosten' : 'Überschuss nach Fixkosten'}
                  </span>
                  <span
                    className={`text-lg font-bold tabular-nums ${
                      hasGap ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    {hasGap ? formatCents(result.fixedCostGap) : formatCents(result.surplus)}
                  </span>
                </div>

                <p className="text-xs text-slate-500 tabular-nums">
                  Gedeckt: {formatCents(result.fixedCostsCovered)} von{' '}
                  {formatCents(result.fixedCostsDue)}
                </p>

                {summary.nextUncovered ? (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                    <span>
                      Für „{summary.nextUncovered.fixedCost?.name ?? 'Abo'}“ fehlen noch{' '}
                      <strong className="font-semibold tabular-nums text-rose-700">
                        {formatCents(summary.nextUncovered.missing)}
                      </strong>
                      .
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Alle aktiven Abos vollständig gedeckt.</span>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400">Lade Deckungsdaten …</p>
        )}
      </div>

      <div className="border-t border-slate-100 pt-3">
        <Link
          to="/abos"
          className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition-colors"
        >
          Abos &amp; Deckung öffnen
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}

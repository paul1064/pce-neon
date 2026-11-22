import { useMemo } from 'react';
import { Calendar, Flame, Snowflake, TrendingDown } from 'lucide-react';
import {
  formatCents,
  formatYearMonth,
  type DebtStrategy,
  type WaterfallInput,
} from '../../core';
import { compareStrategies, type PayoffProjection } from './logic';

interface PayoffComparisonCardProps {
  input: WaterfallInput;
  selectedStrategy: DebtStrategy;
}

interface StrategyCardProps {
  title: string;
  subtitle: string;
  projection: PayoffProjection | null;
  active: boolean;
  icon: 'snowball' | 'avalanche';
}

function StrategyProjectionBox({
  title,
  subtitle,
  projection,
  active,
  icon,
}: StrategyCardProps) {
  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        active
          ? 'border-emerald-300 bg-emerald-50/40 ring-1 ring-emerald-200'
          : 'border-slate-200 bg-slate-50/60'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon === 'snowball' ? (
            <Snowflake className="h-4 w-4 text-sky-600" />
          ) : (
            <Flame className="h-4 w-4 text-amber-600" />
          )}
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            <p className="text-[11px] text-slate-500">{subtitle}</p>
          </div>
        </div>
        {active && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
            Aktiv gewählt
          </span>
        )}
      </div>

      {projection ? (
        <dl className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-white p-2.5 shadow-2xs">
            <dt className="text-[11px] text-slate-500">Dauer</dt>
            <dd className="mt-0.5 text-sm font-bold text-slate-900 tabular-nums">
              {projection.months} {projection.months === 1 ? 'Monat' : 'Monate'}
            </dd>
          </div>
          <div className="rounded-lg bg-white p-2.5 shadow-2xs">
            <dt className="text-[11px] text-slate-500">Schuldenfrei</dt>
            <dd className="mt-0.5 text-sm font-semibold text-slate-900">
              {formatYearMonth(projection.debtFreeIn)}
            </dd>
          </div>
          <div className="rounded-lg bg-white p-2.5 shadow-2xs">
            <dt className="text-[11px] text-slate-500">Gesch. Zinsen</dt>
            <dd className="mt-0.5 text-sm font-bold text-slate-900 tabular-nums">
              {formatCents(projection.interestPaid)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          Kein ausreichender Überschuss – keine Prognose möglich.
        </p>
      )}
    </div>
  );
}

export function PayoffComparisonCard({
  input,
  selectedStrategy,
}: PayoffComparisonCardProps) {
  const hasOpenDebts = input.debts.some((d) => d.balance > 0);
  const comparison = useMemo(() => compareStrategies(input), [input]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Tilgungsprognose: Schneeball vs. Lawine
          </h2>
          <p className="text-xs text-slate-500">
            Simulation bei gleichbleibendem Monatsüberschuss inkl. monatlicher Zinsberechnung.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
          <Calendar className="h-3.5 w-3.5" />
          Start: {formatYearMonth(input.month)}
        </span>
      </div>

      {!hasOpenDebts ? (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
          Keine offenen Schulden vorhanden – keine Tilgungsprognose erforderlich.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <StrategyProjectionBox
              title="Schneeball"
              subtitle="Kleinster Saldo zuerst"
              projection={comparison.snowball}
              active={selectedStrategy === 'snowball'}
              icon="snowball"
            />
            <StrategyProjectionBox
              title="Lawine"
              subtitle="Höchster Zinssatz zuerst"
              projection={comparison.avalanche}
              active={selectedStrategy === 'avalanche'}
              icon="avalanche"
            />
          </div>

          {comparison.avalancheInterestSavings !== null && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700">
              <TrendingDown className="h-4 w-4 shrink-0 text-emerald-600" />
              {comparison.avalancheInterestSavings > 0 ? (
                <span>
                  <strong className="font-semibold text-slate-900">Zinsersparnis:</strong> Mit der
                  Lawinen-Strategie sparst du voraussichtlich{' '}
                  <strong className="font-semibold text-emerald-700 tabular-nums">
                    {formatCents(comparison.avalancheInterestSavings)}
                  </strong>{' '}
                  an Zinsen gegenüber Schneeball.
                </span>
              ) : comparison.avalancheInterestSavings < 0 ? (
                <span>
                  <strong className="font-semibold text-slate-900">Zinsersparnis:</strong> Mit der
                  Schneeball-Strategie sparst du voraussichtlich{' '}
                  <strong className="font-semibold text-emerald-700 tabular-nums">
                    {formatCents(-comparison.avalancheInterestSavings)}
                  </strong>{' '}
                  an Zinsen gegenüber Lawine.
                </span>
              ) : (
                <span>
                  Beide Strategien verursachen voraussichtlich dieselben Zinskosten (
                  <span className="font-semibold tabular-nums">
                    {formatCents(comparison.avalanche?.interestPaid ?? 0)}
                  </span>
                  ).
                </span>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

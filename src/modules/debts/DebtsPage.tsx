import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  ArrowRight,
  Flame,
  Info,
  Snowflake,
} from 'lucide-react';
import {
  db,
  formatBps,
  formatCents,
  formatCentsPlain,
  formatYearMonth,
  runWaterfall,
  useMonth,
  useWaterfall,
  type Debt,
  type DebtStrategy,
  type ID,
} from '../../core';
import { DebtListSection } from './DebtListSection';
import { MonthCloseSection } from './MonthCloseSection';
import { PayoffComparisonCard } from './PayoffComparisonCard';
import { strategyLabel } from './logic';

export default function DebtsPage() {
  const { month } = useMonth();
  const waterfall = useWaterfall(month);

  const allDebts = useLiveQuery(() => db.debts.toArray(), []);
  const existingClose = useLiveQuery(
    () => db.monthCloses.where('month').equals(month).first(),
    [month],
  );
  const monthPayments = useLiveQuery(
    () => db.debtPayments.where('month').equals(month).toArray(),
    [month],
  );

  const [strategyOverride, setStrategyOverride] = useState<DebtStrategy | null>(null);

  const defaultStrategy: DebtStrategy = waterfall?.input.strategy ?? 'avalanche';
  const selectedStrategy: DebtStrategy = strategyOverride ?? defaultStrategy;

  const planResult = useMemo(() => {
    if (!waterfall) return null;
    return runWaterfall({ ...waterfall.input, strategy: selectedStrategy });
  }, [waterfall, selectedStrategy]);

  const debtsList = useMemo(() => allDebts ?? [], [allDebts]);
  const debtById = useMemo(() => {
    const map = new Map<ID, Debt>();
    for (const d of debtsList) {
      map.set(d.id, d);
    }
    return map;
  }, [debtsList]);

  const activeDebts = useMemo(() => debtsList.filter((d) => !d.archivedAt), [debtsList]);
  const openDebts = useMemo(
    () => activeDebts.filter((d) => d.status === 'open' && d.balance > 0),
    [activeDebts],
  );
  const paidDebtsCount = useMemo(
    () => activeDebts.filter((d) => d.status === 'paid' || d.balance === 0).length,
    [activeDebts],
  );
  const totalOpenBalance = useMemo(
    () => openDebts.reduce((sum, d) => sum + d.balance, 0),
    [openDebts],
  );

  const closePayments = useMemo(() => {
    if (!existingClose || !monthPayments) return [];
    return monthPayments.filter((p) => p.monthCloseId === existingClose.id);
  }, [existingClose, monthPayments]);

  const isLoading = waterfall === undefined || allDebts === undefined;

  return (
    <div className="space-y-6">
      {/* Kopfzeile & Kennzahlen */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Stufe 4 · Schuldentilger · {formatYearMonth(month)}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">Schulden & Tilgungsplan</h1>
          </div>
          <Link
            to="/einstellungen"
            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 transition-colors"
          >
            Standard in Einstellungen ändern
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Offene Restschuld</p>
            <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums">
              {allDebts ? formatCents(totalOpenBalance) : '…'}
            </p>
            <p className="text-[11px] text-slate-500">
              {openDebts.length} offen · {paidDebtsCount} getilgt
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Überschuss nach Fixkosten</p>
            <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums">
              {planResult ? formatCents(planResult.surplus) : '…'}
            </p>
            <p className="text-[11px] text-slate-500 tabular-nums">
              Einnahmen: {planResult ? formatCents(planResult.totalIncome) : '…'}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Geplante Tilgung</p>
            <p
              className={`mt-1 text-lg font-bold tabular-nums ${
                planResult && planResult.totalToDebt > 0 ? 'text-emerald-700' : 'text-slate-700'
              }`}
            >
              {planResult ? formatCents(planResult.totalToDebt) : '…'}
            </p>
            <p className="text-[11px] text-slate-500">
              {planResult && planResult.bufferHeld > 0
                ? `Puffer: ${formatCents(planResult.bufferHeld)}`
                : 'Mindestrate + Extra'}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Gewählte Strategie</p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {strategyLabel(selectedStrategy)}
            </p>
            <p className="text-[11px] text-slate-500">
              {strategyOverride && strategyOverride !== defaultStrategy
                ? `Standard: ${strategyLabel(defaultStrategy)}`
                : 'Aus Einstellungen'}
            </p>
          </div>
        </div>
      </section>

      {/* Strategie-Umschalter & Zahlungsplan */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Zahlungsplan · {formatYearMonth(month)}
            </h2>
            <p className="text-xs text-slate-500">
              Vergleiche beide Strategien live ohne deine Standard-Einstellung zu überschreiben.
            </p>
          </div>

          <div
            role="group"
            aria-label="Tilgungsstrategie wählen"
            className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1"
          >
            <button
              type="button"
              onClick={() => setStrategyOverride('snowball')}
              aria-pressed={selectedStrategy === 'snowball'}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                selectedStrategy === 'snowball'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Snowflake className="h-3.5 w-3.5" />
              Schneeball
            </button>
            <button
              type="button"
              onClick={() => setStrategyOverride('avalanche')}
              aria-pressed={selectedStrategy === 'avalanche'}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                selectedStrategy === 'avalanche'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Flame className="h-3.5 w-3.5" />
              Lawine
            </button>
          </div>
        </div>

        {existingClose && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
            <Info className="h-4 w-4 shrink-0 text-slate-500" />
            <span>
              Dieser Monat ist bereits abgeschlossen. Der eingefrorene Plan zum Bestätigen deiner
              Überweisungen steht direkt im Abschnitt „Monatsabschluss“ darunter.
            </span>
          </div>
        )}

        {isLoading || !planResult ? (
          <p className="mt-4 text-sm text-slate-500">Berechne Zahlungsplan…</p>
        ) : (
          <>
            {/* Unterdeckungs-Warnungen */}
            {planResult.fixedCostGap > 0 && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold">
                    Unterdeckung bei den Fixkosten (Lücke: {formatCents(planResult.fixedCostGap)})
                  </p>
                  <p className="mt-0.5 text-amber-800">
                    Die Einnahmen ({formatCents(planResult.totalIncome)}) decken die fälligen
                    Fixkosten ({formatCents(planResult.fixedCostsDue)}) nicht vollständig. In diesem
                    Monat fließt nichts ({formatCents(planResult.totalToDebt)}) in Schulden.
                  </p>
                </div>
              </div>
            )}

            {planResult.fixedCostGap === 0 && planResult.minimumGap > 0 && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold">
                    Mindestraten nicht voll gedeckt (Lücke: {formatCents(planResult.minimumGap)})
                  </p>
                  <p className="mt-0.5 text-amber-800">
                    Der Überschuss ({formatCents(planResult.surplus)}) reicht nicht für alle
                    Mindestraten. Es fließen {formatCents(planResult.totalToDebt)} in Schulden.
                  </p>
                </div>
              </div>
            )}

            {planResult.fixedCostGap === 0 &&
              planResult.minimumGap === 0 &&
              planResult.totalToDebt === 0 &&
              openDebts.length > 0 && (
                <div
                  role="alert"
                  className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <span>
                    Kein Überschuss für die Schuldentilgung verfügbar – in diesem Monat fließt
                    nichts (0,00 €) in Schulden.
                  </span>
                </div>
              )}

            {/* Zahlungsplan-Liste */}
            {planResult.debtPayments.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                Keine offenen Schulden für den Zahlungsplan vorhanden.
              </p>
            ) : (
              <ol className="mt-4 space-y-2.5">
                {planResult.debtPayments.map((item, index) => {
                  const debt = debtById.get(item.debtId);
                  const total = item.minimum + item.extra;
                  const isTarget = item.extra > 0;
                  const clearedThisMonth = item.balanceAfter === 0;

                  return (
                    <li
                      key={item.debtId}
                      className={`rounded-xl border p-3.5 ${
                        isTarget
                          ? 'border-emerald-200 bg-emerald-50/40'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                              isTarget
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {index + 1}
                          </span>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">
                                {debt?.name ?? item.debtId}
                              </span>
                              {debt && (
                                <span className="text-xs text-slate-500 tabular-nums">
                                  {formatBps(debt.aprBps)}
                                </span>
                              )}
                              {isTarget && (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                  Extra-Tilgung
                                </span>
                              )}
                              {clearedThisMonth && total > 0 && (
                                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                                  Danach getilgt
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                              {item.extra > 0
                                ? `Mindestrate + Extra-Tilgung: (${formatCentsPlain(item.minimum)} + ${formatCentsPlain(item.extra)})`
                                : `Mindestrate: ${formatCentsPlain(item.minimum)}`}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-base font-bold text-slate-900 tabular-nums">
                            {formatCents(total)}
                          </p>
                          <p className="text-xs text-slate-500 tabular-nums">
                            Saldo danach: {formatCents(item.balanceAfter)}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            {/* Wasserfall-Zusammenfassung */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600 tabular-nums">
              <span>
                Einnahmen: <strong className="text-slate-900">{formatCents(planResult.totalIncome)}</strong>
                {' · '}Fixkosten:{' '}
                <strong className="text-slate-900">{formatCents(planResult.fixedCostsCovered)}</strong>
                {' · '}Überschuss:{' '}
                <strong className="text-slate-900">{formatCents(planResult.surplus)}</strong>
                {planResult.bufferHeld > 0 && (
                  <>
                    {' · '}Puffer:{' '}
                    <strong className="text-slate-900">{formatCents(planResult.bufferHeld)}</strong>
                  </>
                )}
              </span>
              <span>
                Gesamt an Schulden:{' '}
                <strong className="text-emerald-700">{formatCents(planResult.totalToDebt)}</strong>
                {planResult.unallocated > 0 && (
                  <>
                    {' · '}Frei:{' '}
                    <strong className="text-slate-900">{formatCents(planResult.unallocated)}</strong>
                  </>
                )}
              </span>
            </div>
          </>
        )}
      </section>

      {/* Monatsabschluss & Zahlungen bestätigen */}
      {planResult && (
        <MonthCloseSection
          month={month}
          selectedStrategy={selectedStrategy}
          planResult={planResult}
          existingClose={existingClose}
          closePayments={closePayments}
          monthPayments={monthPayments ?? []}
          debtById={debtById}
        />
      )}

      {/* Prognose-Vergleich */}
      {waterfall && (
        <PayoffComparisonCard input={waterfall.input} selectedStrategy={selectedStrategy} />
      )}

      {/* Schulden verwalten */}
      <DebtListSection debts={debtsList} />
    </div>
  );
}

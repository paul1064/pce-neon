import { useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCheck,
  CheckCircle2,
  Lock,
  Receipt,
} from 'lucide-react';
import {
  formatCents,
  formatCentsPlain,
  formatISODate,
  formatYearMonth,
  type Debt,
  type DebtPayment,
  type DebtStrategy,
  type ID,
  type MonthClose,
  type WaterfallResult,
  type YearMonth,
} from '../../core';
import {
  closeMonth,
  confirmAllMonthClosePayments,
  confirmDebtPayment,
  getPlannedPayments,
  isDebtPaymentConfirmed,
  isDuplicateMonthCloseError,
  strategyLabel,
} from './logic';

interface MonthCloseSectionProps {
  month: YearMonth;
  selectedStrategy: DebtStrategy;
  planResult: WaterfallResult;
  existingClose: MonthClose | undefined;
  closePayments: DebtPayment[];
  monthPayments: DebtPayment[];
  debtById: Map<ID, Debt>;
}

export function MonthCloseSection({
  month,
  selectedStrategy,
  planResult,
  existingClose,
  closePayments,
  monthPayments,
  debtById,
}: MonthCloseSectionProps) {
  const [busy, setBusy] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const plannedPayments = existingClose ? getPlannedPayments(existingClose.result) : [];
  const pendingCount = existingClose
    ? plannedPayments.filter((p) => !isDebtPaymentConfirmed(p.debtId, existingClose.id, closePayments))
        .length
    : 0;

  const totalConfirmedMonth = monthPayments.reduce((sum, p) => sum + p.amount, 0);

  const handleCloseMonth = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setBusy(true);
    try {
      await closeMonth(month, planResult);
      setStatusMessage(
        `Monat ${formatYearMonth(month)} wurde mit Strategie „${strategyLabel(selectedStrategy)}“ abgeschlossen.`,
      );
    } catch (error: unknown) {
      if (isDuplicateMonthCloseError(error)) {
        setErrorMessage('Dieser Monat wurde bereits abgeschlossen.');
      } else {
        setErrorMessage(
          error instanceof Error ? error.message : 'Monatsabschluss fehlgeschlagen.',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmSingle = async (debtId: ID) => {
    if (!existingClose) return;
    setErrorMessage(null);
    setStatusMessage(null);
    setBusy(true);
    try {
      const res = await confirmDebtPayment(existingClose.id, debtId);
      const debtName = debtById.get(debtId)?.name ?? 'Schuld';
      if (res.alreadyConfirmed) {
        setStatusMessage(`Zahlung für „${debtName}“ war bereits bestätigt.`);
      } else if (res.debt?.status === 'paid') {
        setStatusMessage(`Zahlung für „${debtName}“ bestätigt – Schuld ist jetzt vollständig getilgt!`);
      } else {
        setStatusMessage(`Zahlung für „${debtName}“ bestätigt und Saldo aktualisiert.`);
      }
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Zahlung konnte nicht bestätigt werden.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmAll = async () => {
    if (!existingClose) return;
    setErrorMessage(null);
    setStatusMessage(null);
    setBusy(true);
    try {
      const res = await confirmAllMonthClosePayments(existingClose.id);
      if (res.confirmedCount === 0) {
        setStatusMessage('Alle Zahlungen dieses Monatsabschlusses sind bereits bestätigt.');
      } else {
        setStatusMessage(
          `${res.confirmedCount} ${
            res.confirmedCount === 1 ? 'Schuld-Zahlung' : 'Schuld-Zahlungen'
          } bestätigt und Salden aktualisiert.`,
        );
      }
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Zahlungen konnten nicht bestätigt werden.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">
              Monatsabschluss · {formatYearMonth(month)}
            </h2>
            {existingClose && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Monat abgeschlossen
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {existingClose
              ? `Am ${formatISODate(existingClose.createdAt)} eingefroren. Ein erneuter Abschluss desselben Monats ist gesperrt.`
              : 'Friert den aktuellen Zahlungsplan ein und erzeugt Zahlungsvorschläge zum Bestätigen nach deiner Überweisung.'}
          </p>
        </div>

        {!existingClose ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleCloseMonth()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            <Lock className="h-3.5 w-3.5" />
            Monat abschließen ({strategyLabel(selectedStrategy)})
          </button>
        ) : (
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-500"
          >
            <Lock className="h-3.5 w-3.5" />
            Monat bereits abgeschlossen
          </button>
        )}
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {statusMessage && (
        <div
          role="status"
          className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{statusMessage}</span>
        </div>
      )}

      {existingClose && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
            <span className="tabular-nums">
              Eingefrorener Schuldenbetrag:{' '}
              <strong className="font-semibold text-slate-900">
                {formatCents(existingClose.result.totalToDebt)}
              </strong>{' '}
              (Überschuss: {formatCents(existingClose.result.surplus)})
            </span>
            {pendingCount > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleConfirmAll()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Alle Zahlungen bestätigen ({pendingCount})
              </button>
            )}
          </div>

          {plannedPayments.length === 0 ? (
            <p className="text-xs text-slate-500">
              In diesem Monatsabschluss waren keine Zahlungen an Schulden vorgesehen.
            </p>
          ) : (
            <ul className="space-y-2">
              {plannedPayments.map((payment) => {
                const debt = debtById.get(payment.debtId);
                const total = payment.minimum + payment.extra;
                const confirmed = isDebtPaymentConfirmed(
                  payment.debtId,
                  existingClose.id,
                  closePayments,
                );

                return (
                  <li
                    key={payment.debtId}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                      confirmed
                        ? 'border-emerald-200 bg-emerald-50/40'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {debt?.name ?? 'Unbekannte Schuld'}
                        {debt?.creditor && (
                          <span className="ml-1.5 text-xs font-normal text-slate-500">
                            · {debt.creditor}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 tabular-nums">
                        {payment.extra > 0
                          ? `Mindestrate + Extra-Tilgung: (${formatCentsPlain(payment.minimum)} + ${formatCentsPlain(payment.extra)})`
                          : `Mindestrate: ${formatCentsPlain(payment.minimum)}`}{' '}
                        · Geplanter Saldo danach: {formatCents(payment.balanceAfter)}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-slate-900 tabular-nums">
                        {formatCents(total)}
                      </span>
                      {confirmed ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                          <Check className="h-3.5 w-3.5" />
                          Bestätigt
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleConfirmSingle(payment.debtId)}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Bestätigen
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Kompakte Historie bestätigter Zahlungen des Monats */}
      {monthPayments.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <Receipt className="h-3.5 w-3.5" />
              Bestätigte Zahlungen ({formatYearMonth(month)})
            </h3>
            <span className="text-xs font-semibold text-slate-700 tabular-nums">
              Summe: {formatCents(totalConfirmedMonth)}
            </span>
          </div>
          <ul className="mt-2.5 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/50">
            {monthPayments.map((entry) => {
              const debt = debtById.get(entry.debtId);
              return (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">
                      {debt?.name ?? 'Schuld'}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        entry.kind === 'extra'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200/80 text-slate-700'
                      }`}
                    >
                      {entry.kind === 'extra' ? 'Extra-Tilgung' : 'Mindestrate'}
                    </span>
                    <span className="text-slate-400">{formatISODate(entry.paidOn)}</span>
                  </div>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {formatCents(entry.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

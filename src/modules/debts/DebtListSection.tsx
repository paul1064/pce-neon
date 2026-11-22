import { useState, type FormEvent } from 'react';
import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  centsToInput,
  formatBps,
  formatCents,
  formatISODate,
  parseEuroToCents,
  parsePercentToBps,
  type Debt,
  type ID,
} from '../../core';
import {
  adjustBalanceSchema,
  adjustDebtBalance,
  archiveDebt,
  bpsToInput,
  createDebt,
  createDebtSchema,
  repaymentProgress,
  restoreDebt,
  updateDebt,
  updateDebtSchema,
} from './logic';

interface DebtListSectionProps {
  debts: Debt[];
}

export function DebtListSection({ debts }: DebtListSectionProps) {
  const activeDebts = debts.filter((d) => !d.archivedAt);
  const archivedDebts = debts.filter((d) => Boolean(d.archivedAt));
  const sortedActiveDebts = [...activeDebts].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return a.name.localeCompare(b.name, 'de');
  });

  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [nameInput, setNameInput] = useState<string>('');
  const [creditorInput, setCreditorInput] = useState<string>('');
  const [amountInput, setAmountInput] = useState<string>('');
  const [aprInput, setAprInput] = useState<string>('0');
  const [minPaymentInput, setMinPaymentInput] = useState<string>('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [adjustingId, setAdjustingId] = useState<ID | null>(null);
  const [adjustInput, setAdjustInput] = useState<string>('');
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<ID | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editCreditor, setEditCreditor] = useState<string>('');
  const [editApr, setEditApr] = useState<string>('');
  const [editMinPayment, setEditMinPayment] = useState<string>('');
  const [editError, setEditError] = useState<string | null>(null);

  const [showArchived, setShowArchived] = useState<boolean>(false);

  const isCreateVisible = showCreateForm || activeDebts.length === 0;

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setFeedback(null);

    const originalAmount = parseEuroToCents(amountInput);
    if (originalAmount === null) {
      setCreateError('Bitte einen gültigen Ursprungsbetrag in Euro eingeben (z. B. 300,00).');
      return;
    }

    const aprBps = parsePercentToBps(aprInput);
    if (aprBps === null) {
      setCreateError('Bitte einen gültigen Jahreszins in Prozent eingeben (z. B. 0 oder 12,5).');
      return;
    }

    const minPayment = parseEuroToCents(minPaymentInput);
    if (minPayment === null) {
      setCreateError('Bitte eine gültige Mindestrate in Euro eingeben (z. B. 25,00).');
      return;
    }

    const parsed = createDebtSchema.safeParse({
      name: nameInput,
      creditor: creditorInput.trim() ? creditorInput : undefined,
      originalAmount,
      aprBps,
      minPayment,
    });
    if (!parsed.success) {
      setCreateError(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
      return;
    }

    try {
      const created = await createDebt(parsed.data);
      setNameInput('');
      setCreditorInput('');
      setAmountInput('');
      setAprInput('0');
      setMinPaymentInput('');
      setFeedback(`Schuld „${created.name}“ (${formatCents(created.originalAmount)}) angelegt.`);
    } catch (error: unknown) {
      setCreateError(
        error instanceof Error ? error.message : 'Schuld konnte nicht gespeichert werden.',
      );
    }
  };

  const openAdjust = (debt: Debt) => {
    setEditingId(null);
    setAdjustingId(debt.id);
    setAdjustInput(centsToInput(debt.balance));
    setAdjustError(null);
  };

  const handleAdjustSubmit = async (e: FormEvent, debt: Debt) => {
    e.preventDefault();
    setAdjustError(null);
    setFeedback(null);

    const nextBalance = parseEuroToCents(adjustInput);
    if (nextBalance === null) {
      setAdjustError('Bitte einen gültigen neuen Saldo in Euro eingeben (z. B. 722,98).');
      return;
    }
    const parsed = adjustBalanceSchema.safeParse({ balance: nextBalance });
    if (!parsed.success) {
      setAdjustError(parsed.error.issues[0]?.message ?? 'Ungültiger Saldo.');
      return;
    }

    try {
      const updated = await adjustDebtBalance(debt.id, parsed.data.balance);
      setAdjustingId(null);
      setFeedback(
        `Saldo für „${updated.name}“ auf ${formatCents(updated.balance)} angepasst${
          updated.status === 'paid' ? ' (Status: Getilgt)' : ''
        }.`,
      );
    } catch (error: unknown) {
      setAdjustError(
        error instanceof Error ? error.message : 'Saldo konnte nicht aktualisiert werden.',
      );
    }
  };

  const openEdit = (debt: Debt) => {
    setAdjustingId(null);
    setEditingId(debt.id);
    setEditName(debt.name);
    setEditCreditor(debt.creditor ?? '');
    setEditApr(bpsToInput(debt.aprBps));
    setEditMinPayment(centsToInput(debt.minPayment));
    setEditError(null);
  };

  const handleEditSubmit = async (e: FormEvent, debt: Debt) => {
    e.preventDefault();
    setEditError(null);
    setFeedback(null);

    const aprBps = parsePercentToBps(editApr);
    if (aprBps === null) {
      setEditError('Bitte einen gültigen Jahreszins in Prozent eingeben (z. B. 12,5).');
      return;
    }

    const minPayment = parseEuroToCents(editMinPayment);
    if (minPayment === null) {
      setEditError('Bitte eine gültige Mindestrate in Euro eingeben (z. B. 50,00).');
      return;
    }

    const parsed = updateDebtSchema.safeParse({
      name: editName,
      creditor: editCreditor.trim() ? editCreditor : undefined,
      aprBps,
      minPayment,
    });
    if (!parsed.success) {
      setEditError(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
      return;
    }

    try {
      const updated = await updateDebt(debt.id, parsed.data);
      setEditingId(null);
      setFeedback(`Schuld „${updated.name}“ aktualisiert.`);
    } catch (error: unknown) {
      setEditError(
        error instanceof Error ? error.message : 'Änderungen konnten nicht gespeichert werden.',
      );
    }
  };

  const handleArchive = async (debt: Debt) => {
    setFeedback(null);
    await archiveDebt(debt.id);
    if (adjustingId === debt.id) setAdjustingId(null);
    if (editingId === debt.id) setEditingId(null);
    setFeedback(`Schuld „${debt.name}“ wurde archiviert.`);
  };

  const handleRestore = async (debt: Debt) => {
    setFeedback(null);
    await restoreDebt(debt.id);
    setFeedback(`Schuld „${debt.name}“ wurde wiederhergestellt.`);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Schulden verwalten</h2>
          <p className="text-xs text-slate-500">
            Zinsen werden nicht automatisch gebucht – passe den Saldo nach dem Auszug deines
            Gläubigers manuell an.
          </p>
        </div>
        {activeDebts.length > 0 && (
          <button
            type="button"
            onClick={() => setShowCreateForm((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
          >
            {showCreateForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showCreateForm ? 'Formular schließen' : 'Neue Schuld'}
          </button>
        )}
      </div>

      {feedback && (
        <div
          role="status"
          className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800"
        >
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Hinweis schließen"
            className="rounded-md p-0.5 text-emerald-700 hover:bg-emerald-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {isCreateVisible && (
        <form
          onSubmit={handleCreateSubmit}
          className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"
        >
          <h3 className="text-sm font-semibold text-slate-900">Neue Schuld anlegen</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label htmlFor="debt-name" className="block text-xs font-medium text-slate-700">
                Name *
              </label>
              <input
                id="debt-name"
                type="text"
                required
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="z. B. A oder Kreditkarte"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div>
              <label htmlFor="debt-creditor" className="block text-xs font-medium text-slate-700">
                Gläubiger (optional)
              </label>
              <input
                id="debt-creditor"
                type="text"
                value={creditorInput}
                onChange={(e) => setCreditorInput(e.target.value)}
                placeholder="z. B. Hausbank"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div>
              <label htmlFor="debt-amount" className="block text-xs font-medium text-slate-700">
                Ursprungsbetrag (€) *
              </label>
              <input
                id="debt-amount"
                type="text"
                inputMode="decimal"
                required
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="300,00"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div>
              <label htmlFor="debt-apr" className="block text-xs font-medium text-slate-700">
                Jahreszins (%) *
              </label>
              <input
                id="debt-apr"
                type="text"
                inputMode="decimal"
                required
                value={aprInput}
                onChange={(e) => setAprInput(e.target.value)}
                placeholder="12,5"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div>
              <label
                htmlFor="debt-min-payment"
                className="block text-xs font-medium text-slate-700"
              >
                Mindestrate (€) *
              </label>
              <input
                id="debt-min-payment"
                type="text"
                inputMode="decimal"
                required
                value={minPaymentInput}
                onChange={(e) => setMinPaymentInput(e.target.value)}
                placeholder="25,00"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          {createError && (
            <p role="alert" className="mt-2.5 text-xs font-medium text-rose-600">
              {createError}
            </p>
          )}

          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Schuld anlegen
            </button>
          </div>
        </form>
      )}

      {sortedActiveDebts.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          Noch keine Schulden erfasst. Lege oben deine erste Schuld an, um Zahlungsplan und
          Tilgungsprognose zu berechnen.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {sortedActiveDebts.map((debt) => {
            const { paid, percent } = repaymentProgress(debt);
            const isPaid = debt.status === 'paid';
            const isAdjusting = adjustingId === debt.id;
            const isEditing = editingId === debt.id;

            return (
              <li
                key={debt.id}
                className={`rounded-xl border p-4 transition-colors ${
                  isPaid
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">{debt.name}</h3>
                      {debt.creditor && (
                        <span className="text-xs text-slate-500">· {debt.creditor}</span>
                      )}
                      {isPaid ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Getilgt
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                          Offen
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500 tabular-nums">
                      Zins: {formatBps(debt.aprBps)} · Mindestrate: {formatCents(debt.minPayment)} ·
                      Ursprung: {formatCents(debt.originalAmount)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p
                      className={`text-lg font-bold tabular-nums ${
                        isPaid ? 'text-emerald-700' : 'text-slate-900'
                      }`}
                    >
                      {formatCents(debt.balance)}
                    </p>
                    <p className="text-[11px] text-slate-500 tabular-nums">
                      Getilgt: {formatCents(paid)} ({percent} %)
                    </p>
                  </div>
                </div>

                {/* Fortschrittsbalken */}
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isPaid ? 'bg-emerald-500' : 'bg-emerald-600'
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>

                {/* Aktionen */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => (isAdjusting ? setAdjustingId(null) : openAdjust(debt))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Saldo anpassen
                  </button>
                  <button
                    type="button"
                    onClick={() => (isEditing ? setEditingId(null) : openEdit(debt))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleArchive(debt)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 transition-colors"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archivieren
                  </button>
                </div>

                {/* Inline: Saldo anpassen */}
                {isAdjusting && (
                  <form
                    onSubmit={(e) => void handleAdjustSubmit(e, debt)}
                    className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <p className="text-xs font-semibold text-slate-800">
                      Saldo manuell korrigieren (z. B. nach Zinsabrechnung / Kontoauszug)
                    </p>
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <div className="min-w-[160px] flex-1">
                        <label
                          htmlFor={`adjust-${debt.id}`}
                          className="block text-[11px] font-medium text-slate-600"
                        >
                          Neuer Saldo (€)
                        </label>
                        <input
                          id={`adjust-${debt.id}`}
                          type="text"
                          inputMode="decimal"
                          value={adjustInput}
                          onChange={(e) => setAdjustInput(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 tabular-nums focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </div>
                      <button
                        type="submit"
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
                      >
                        Speichern
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdjustingId(null)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                      >
                        Abbrechen
                      </button>
                    </div>
                    {adjustError && (
                      <p role="alert" className="mt-2 text-xs font-medium text-rose-600">
                        {adjustError}
                      </p>
                    )}
                  </form>
                )}

                {/* Inline: Bearbeiten */}
                {isEditing && (
                  <form
                    onSubmit={(e) => void handleEditSubmit(e, debt)}
                    className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <p className="text-xs font-semibold text-slate-800">Stammdaten bearbeiten</p>
                    <div className="mt-2 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <label
                          htmlFor={`edit-name-${debt.id}`}
                          className="block text-[11px] font-medium text-slate-600"
                        >
                          Name *
                        </label>
                        <input
                          id={`edit-name-${debt.id}`}
                          type="text"
                          required
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`edit-creditor-${debt.id}`}
                          className="block text-[11px] font-medium text-slate-600"
                        >
                          Gläubiger
                        </label>
                        <input
                          id={`edit-creditor-${debt.id}`}
                          type="text"
                          value={editCreditor}
                          onChange={(e) => setEditCreditor(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`edit-apr-${debt.id}`}
                          className="block text-[11px] font-medium text-slate-600"
                        >
                          Jahreszins (%) *
                        </label>
                        <input
                          id={`edit-apr-${debt.id}`}
                          type="text"
                          inputMode="decimal"
                          required
                          value={editApr}
                          onChange={(e) => setEditApr(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 tabular-nums focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`edit-min-${debt.id}`}
                          className="block text-[11px] font-medium text-slate-600"
                        >
                          Mindestrate (€) *
                        </label>
                        <input
                          id={`edit-min-${debt.id}`}
                          type="text"
                          inputMode="decimal"
                          required
                          value={editMinPayment}
                          onChange={(e) => setEditMinPayment(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 tabular-nums focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </div>
                    </div>
                    {editError && (
                      <p role="alert" className="mt-2 text-xs font-medium text-rose-600">
                        {editError}
                      </p>
                    )}
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                      >
                        Abbrechen
                      </button>
                      <button
                        type="submit"
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
                      >
                        Änderungen speichern
                      </button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Archivierte Schulden */}
      {archivedDebts.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => setShowArchived((prev) => !prev)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            {showArchived ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Archivierte Schulden ({archivedDebts.length})
          </button>

          {showArchived && (
            <ul className="mt-3 space-y-2">
              {archivedDebts.map((debt) => (
                <li
                  key={debt.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600"
                >
                  <div>
                    <span className="font-medium text-slate-800">{debt.name}</span>
                    <span className="ml-2 tabular-nums">Saldo: {formatCents(debt.balance)}</span>
                    {debt.archivedAt && (
                      <span className="ml-2 text-slate-400">
                        · archiviert am {formatISODate(debt.archivedAt)}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRestore(debt)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Wiederherstellen
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

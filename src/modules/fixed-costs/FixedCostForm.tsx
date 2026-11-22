import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import {
  centsToInput,
  formatCents,
  parseEuroToCents,
  type BillingCycle,
  type FixedCost,
  type Project,
  type YearMonth,
} from '../../core';
import {
  BILLING_CYCLE_LABELS,
  CATEGORY_LABELS,
  fixedCostInputSchema,
  previewMonthlyEquivalent,
  type FixedCostCategory,
  type FixedCostInput,
} from './logic';

interface FixedCostFormProps {
  initial?: FixedCost | null;
  defaultMonth: YearMonth;
  defaultPriority: number;
  projects: Project[];
  onSubmit: (input: FixedCostInput) => Promise<void>;
  onCancel: () => void;
}

const CYCLES: BillingCycle[] = ['monthly', 'quarterly', 'yearly'];
const CATEGORIES: FixedCostCategory[] = ['essential', 'tool', 'comfort'];

export function FixedCostForm({
  initial,
  defaultMonth,
  defaultPriority,
  projects,
  onSubmit,
  onCancel,
}: FixedCostFormProps) {
  const [name, setName] = useState<string>(initial?.name ?? '');
  const [amountInput, setAmountInput] = useState<string>(
    initial ? centsToInput(initial.amount) : '',
  );
  const [cycle, setCycle] = useState<BillingCycle>(initial?.cycle ?? 'monthly');
  const [priorityInput, setPriorityInput] = useState<string>(
    String(initial?.priority ?? defaultPriority),
  );
  const [dueDayInput, setDueDayInput] = useState<string>(String(initial?.dueDay ?? 1));
  const [category, setCategory] = useState<FixedCostCategory>(initial?.category ?? 'tool');
  const [activeFrom, setActiveFrom] = useState<YearMonth>(initial?.activeFrom ?? defaultMonth);
  const [activeUntil, setActiveUntil] = useState<string>(initial?.activeUntil ?? '');
  const [projectId, setProjectId] = useState<string>(initial?.projectId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const parsedPreviewCents = parseEuroToCents(amountInput);
  const monthlyPreview =
    cycle !== 'monthly' && parsedPreviewCents !== null && parsedPreviewCents > 0
      ? previewMonthlyEquivalent(parsedPreviewCents, cycle)
      : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const amount = parseEuroToCents(amountInput);
    if (amount === null) {
      setError('Bitte einen gültigen Euro-Betrag eingeben (z. B. 12,99).');
      return;
    }

    const priority = Number.parseInt(priorityInput, 10);
    if (!Number.isInteger(priority)) {
      setError('Bitte eine ganze Zahl für die Priorität eingeben (mindestens 1).');
      return;
    }

    const dueDay = Number.parseInt(dueDayInput, 10);
    if (!Number.isInteger(dueDay)) {
      setError('Bitte einen gültigen Fälligkeitstag zwischen 1 und 28 eingeben.');
      return;
    }

    const candidate = {
      name,
      amount,
      cycle,
      dueDay,
      priority,
      category,
      activeFrom,
      activeUntil: activeUntil.trim() ? activeUntil.trim() : undefined,
      projectId: projectId.trim() ? projectId.trim() : undefined,
    };

    const validation = fixedCostInputSchema.safeParse(candidate);
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? 'Bitte Eingaben prüfen.');
      return;
    }

    setSaving(true);
    try {
      await onSubmit(validation.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {initial ? 'Abo bearbeiten' : 'Neues Abo anlegen'}
          </h2>
          <p className="text-xs text-slate-500">
            Priorität 1 wird zuerst aus den Einnahmen gedeckt; bei Gleichstand das günstigere Abo.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Formular schließen"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
        >
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Name */}
        <div className="sm:col-span-2">
          <label htmlFor="fc-name" className="block text-xs font-medium text-slate-700">
            Name
          </label>
          <input
            id="fc-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z. B. Tool A, Hosting, Streaming"
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        {/* Betrag */}
        <div>
          <label htmlFor="fc-amount" className="block text-xs font-medium text-slate-700">
            Betrag pro Zyklus (€)
          </label>
          <input
            id="fc-amount"
            type="text"
            inputMode="decimal"
            required
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="z. B. 12,99"
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        {/* Abrechnungszyklus */}
        <div>
          <label htmlFor="fc-cycle" className="block text-xs font-medium text-slate-700">
            Abrechnungszyklus
          </label>
          <select
            id="fc-cycle"
            value={cycle}
            onChange={(e) => setCycle(e.target.value as BillingCycle)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            {CYCLES.map((c) => (
              <option key={c} value={c}>
                {BILLING_CYCLE_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        {/* Live-Vorschau Monatsanteil bei Quartals- oder Jahresabo */}
        {monthlyPreview !== null && (
          <div className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900">
            Aufgerundeter Monatsanteil im Wasserfall:{' '}
            <strong className="font-semibold tabular-nums">
              {formatCents(monthlyPreview)} / Monat
            </strong>{' '}
            ({BILLING_CYCLE_LABELS[cycle]} {formatCents(parsedPreviewCents ?? 0)})
          </div>
        )}

        {/* Priorität */}
        <div>
          <label htmlFor="fc-priority" className="block text-xs font-medium text-slate-700">
            Priorität (1 = zuerst)
          </label>
          <input
            id="fc-priority"
            type="number"
            min={1}
            max={999}
            step={1}
            required
            value={priorityInput}
            onChange={(e) => setPriorityInput(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        {/* Fälligkeitstag */}
        <div>
          <label htmlFor="fc-due-day" className="block text-xs font-medium text-slate-700">
            Fälligkeitstag im Monat (1–28)
          </label>
          <input
            id="fc-due-day"
            type="number"
            min={1}
            max={28}
            step={1}
            required
            value={dueDayInput}
            onChange={(e) => setDueDayInput(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        {/* Kategorie */}
        <div>
          <label htmlFor="fc-category" className="block text-xs font-medium text-slate-700">
            Kategorie
          </label>
          <select
            id="fc-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as FixedCostCategory)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>

        {/* Optionales Projekt */}
        <div>
          <label htmlFor="fc-project" className="block text-xs font-medium text-slate-700">
            Projekt (optional)
          </label>
          <select
            id="fc-project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">Kein Projekt zugeordnet</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Aktiv ab */}
        <div>
          <label htmlFor="fc-active-from" className="block text-xs font-medium text-slate-700">
            Aktiv ab (Monat)
          </label>
          <input
            id="fc-active-from"
            type="month"
            required
            value={activeFrom}
            onChange={(e) => setActiveFrom(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        {/* Gekündigt zum */}
        <div>
          <label htmlFor="fc-active-until" className="block text-xs font-medium text-slate-700">
            Gekündigt zum (optional)
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="fc-active-until"
              type="month"
              value={activeUntil}
              onChange={(e) => setActiveUntil(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            {activeUntil && (
              <button
                type="button"
                onClick={() => setActiveUntil('')}
                className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Löschen
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Speichere …' : initial ? 'Änderungen speichern' : 'Abo speichern'}
        </button>
      </div>
    </form>
  );
}

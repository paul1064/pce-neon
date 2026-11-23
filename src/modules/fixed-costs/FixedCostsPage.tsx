import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  Archive,
  CalendarOff,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FolderKanban,
  Pencil,
  Plus,
  RotateCcw,
  Upload,
} from 'lucide-react';
import {
  db,
  formatCents,
  formatYearMonth,
  monthlyEquivalent,
  useMonth,
  useWaterfall,
  type FixedCost,
  type ID,
  type Project,
  type YearMonth,
} from '../../core';
import { CsvImportPanel } from './CsvImportPanel';
import { FixedCostForm } from './FixedCostForm';
import {
  BILLING_CYCLE_LABELS,
  BILLING_CYCLE_SHORT_LABELS,
  CATEGORY_LABELS,
  archiveFixedCost,
  cancelFixedCost,
  createFixedCost,
  getInactiveFixedCostsForMonth,
  getNextPriority,
  reactivateFixedCost,
  summarizeFixedCostCoverage,
  updateFixedCost,
  type CoverageStatus,
  type FixedCostCategory,
  type FixedCostInput,
} from './logic';

const CATEGORY_STYLES: Record<FixedCostCategory, string> = {
  essential: 'bg-sky-50 text-sky-800 border-sky-200',
  tool: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  comfort: 'bg-slate-100 text-slate-700 border-slate-200',
};

const STATUS_BADGE_STYLES: Record<CoverageStatus, { label: string; className: string; bar: string }> = {
  covered: {
    label: 'Gedeckt',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    bar: 'bg-emerald-500',
  },
  partial: {
    label: 'Teilweise gedeckt',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
    bar: 'bg-amber-500',
  },
  uncovered: {
    label: 'Ungedeckt',
    className: 'bg-rose-50 text-rose-800 border-rose-200',
    bar: 'bg-rose-400',
  },
};

export default function FixedCostsPage() {
  const { month } = useMonth();
  const waterfall = useWaterfall(month);
  const allFixedCosts = useLiveQuery(() => db.fixedCosts.toArray(), []);
  const projects = useLiveQuery(
    () => db.projects.filter((p) => !p.archivedAt).toArray(),
    [],
  );

  const [formOpen, setFormOpen] = useState<boolean>(false);
  const [csvImportOpen, setCsvImportOpen] = useState<boolean>(false);
  const [importBanner, setImportBanner] = useState<string | null>(null);
  const [editing, setEditing] = useState<FixedCost | null>(null);
  const [cancellingId, setCancellingId] = useState<ID | null>(null);
  const [cancelMonth, setCancelMonth] = useState<YearMonth>(month);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState<ID | null>(null);
  const [showInactive, setShowInactive] = useState<boolean>(false);

  const fixedCosts = allFixedCosts ?? [];
  const activeProjects = projects ?? [];
  const projectMap = new Map<ID, Project>(activeProjects.map((p) => [p.id, p]));

  const result = waterfall?.result;
  const summary = result ? summarizeFixedCostCoverage(result, fixedCosts) : null;
  const inactiveItems = getInactiveFixedCostsForMonth(fixedCosts, month);
  const nextPriority = getNextPriority(fixedCosts);

  const openCreateForm = () => {
    setEditing(null);
    setCsvImportOpen(false);
    setFormOpen(true);
  };

  const openCsvImport = () => {
    setFormOpen(false);
    setEditing(null);
    setImportBanner(null);
    setCsvImportOpen(true);
  };

  const openEditForm = (fc: FixedCost) => {
    setEditing(fc);
    setCsvImportOpen(false);
    setFormOpen(true);
    setCancellingId(null);
    setConfirmArchiveId(null);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const handleSave = async (input: FixedCostInput) => {
    if (editing) {
      await updateFixedCost(editing.id, input);
    } else {
      await createFixedCost(input);
    }
    closeForm();
  };

  const openCancelInline = (fc: FixedCost) => {
    setCancellingId(fc.id);
    const defaultUntil = fc.activeUntil ?? (month >= fc.activeFrom ? month : fc.activeFrom);
    setCancelMonth(defaultUntil);
    setCancelError(null);
    setConfirmArchiveId(null);
  };

  const handleConfirmCancel = async (fc: FixedCost) => {
    setCancelError(null);
    try {
      await cancelFixedCost(fc.id, cancelMonth);
      setCancellingId(null);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Kündigung fehlgeschlagen.');
    }
  };

  const handleReactivate = async (id: ID) => {
    await reactivateFixedCost(id);
    if (cancellingId === id) {
      setCancellingId(null);
    }
  };

  const handleArchive = async (id: ID) => {
    await archiveFixedCost(id);
    setConfirmArchiveId(null);
    if (editing?.id === id) {
      closeForm();
    }
  };

  const hasGap = (result?.fixedCostGap ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* Kopfzeile */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Abo-Gegenfinanzierer</h1>
          <p className="text-sm text-slate-500">
            Monatsdeckung für {formatYearMonth(month)} · Fixkosten werden nach Priorität gedeckt.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openCsvImport}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 shadow-xs hover:bg-slate-50 transition-colors"
          >
            <Upload className="h-4 w-4" />
            CSV importieren
          </button>
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-emerald-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Neues Abo
          </button>
        </div>
      </div>

      {importBanner && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{importBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setImportBanner(null)}
            className="text-xs font-medium text-emerald-700 hover:text-emerald-900"
          >
            Schließen
          </button>
        </div>
      )}

      {/* CSV-Import-Panel */}
      {csvImportOpen && (
        <CsvImportPanel
          defaultMonth={month}
          existingFixedCosts={fixedCosts}
          onImported={(count) => {
            setCsvImportOpen(false);
            setImportBanner(
              `${count} ${count === 1 ? 'Abo wurde' : 'Abos wurden'} erfolgreich aus der CSV-Datei importiert.`,
            );
          }}
          onClose={() => setCsvImportOpen(false)}
        />
      )}

      {/* Formular zum Anlegen / Bearbeiten */}
      {formOpen && (
        <FixedCostForm
          key={editing?.id ?? `create-${nextPriority}-${month}`}
          initial={editing}
          defaultMonth={month}
          defaultPriority={nextPriority}
          projects={activeProjects}
          onSubmit={handleSave}
          onCancel={closeForm}
        />
      )}

      {/* Monats-Zusammenfassung */}
      <section
        aria-label="Monatsübersicht Fixkosten"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Deckung · {formatYearMonth(month)}
            </p>
            <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums">
              {summary
                ? summary.totalCount > 0
                  ? `${summary.coveredCount} von ${summary.totalCount} gedeckt`
                  : 'Keine aktiven Abos in diesem Monat'
                : '…'}
            </p>
          </div>

          {result && (
            <div
              className={`rounded-xl border px-4 py-2.5 text-right ${
                hasGap
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-emerald-200 bg-emerald-50'
              }`}
            >
              <p
                className={`text-xs font-medium ${
                  hasGap ? 'text-amber-800' : 'text-emerald-800'
                }`}
              >
                {hasGap ? 'Lücke bei den Fixkosten' : 'Überschuss nach Fixkosten'}
              </p>
              <p
                className={`mt-0.5 text-xl font-bold tabular-nums ${
                  hasGap ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                {hasGap ? formatCents(result.fixedCostGap) : formatCents(result.surplus)}
              </p>
            </div>
          )}
        </div>

        {result && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
              <p className="text-xs text-slate-500">Einnahmen im Topf</p>
              <p className="mt-1 text-base font-semibold text-slate-900 tabular-nums">
                {formatCents(result.totalIncome)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
              <p className="text-xs text-slate-500">Fixkosten fällig</p>
              <p className="mt-1 text-base font-semibold text-slate-900 tabular-nums">
                {formatCents(result.fixedCostsDue)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
              <p className="text-xs text-slate-500">Fixkosten gedeckt</p>
              <p
                className={`mt-1 text-base font-semibold tabular-nums ${
                  hasGap ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {formatCents(result.fixedCostsCovered)}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Prominenter Hinweis auf das nächste ungedeckte Abo */}
      {summary?.nextUncovered && (
        <section
          role="status"
          aria-label="Nächstes ungedecktes Abo"
          className="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-xs"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-950">
                Für „{summary.nextUncovered.fixedCost?.name ?? 'Abo'}“ fehlen noch{' '}
                <span className="tabular-nums text-rose-700">
                  {formatCents(summary.nextUncovered.missing)}
                </span>
                .
              </p>
              <p className="text-xs text-amber-900 tabular-nums">
                Nächstes Abo in der Wasserfall-Reihenfolge
                {summary.nextUncovered.fixedCost
                  ? ` (Priorität ${summary.nextUncovered.fixedCost.priority})`
                  : ''}
                : {formatCents(summary.nextUncovered.covered)} von{' '}
                {formatCents(summary.nextUncovered.due)} gedeckt.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Alle gedeckt Hinweis */}
      {summary && summary.totalCount > 0 && !summary.nextUncovered && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>
            Alle {summary.totalCount} aktiven Abos sind gedeckt – der Überschuss von{' '}
            <strong className="font-semibold tabular-nums">
              {formatCents(result?.surplus ?? 0)}
            </strong>{' '}
            fließt in den nächsten Wasserfall-Schritt.
          </span>
        </div>
      )}

      {/* Liste der aktiven Abos in exakter Wasserfall-Reihenfolge */}
      <section aria-label="Aktive Abos im Monat" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Aktive Abos ({summary?.totalCount ?? 0})
          </h2>
          <span className="text-xs text-slate-400">Sortiert nach Wasserfall-Reihenfolge</span>
        </div>

        {summary && summary.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm font-medium text-slate-700">
              Noch keine aktiven Fixkosten für {formatYearMonth(month)}.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Lege deine Abos mit Betrag, Zyklus und Priorität an, um sofort zu sehen, wie viele
              Einnahmen zur Deckung nötig sind.
            </p>
            {!formOpen && (
              <button
                type="button"
                onClick={openCreateForm}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Erstes Abo anlegen
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {summary?.items.map((item) => {
              const fc = item.fixedCost;
              const statusMeta = STATUS_BADGE_STYLES[item.status];
              const linkedProject = fc?.projectId ? projectMap.get(fc.projectId) : undefined;
              const isCancelling = fc ? cancellingId === fc.id : false;
              const isConfirmingArchive = fc ? confirmArchiveId === fc.id : false;

              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3"
                >
                  {/* Kopfzeile der Abo-Karte */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {fc && (
                          <span className="inline-flex items-center rounded-lg bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white tabular-nums">
                            Prio {fc.priority}
                          </span>
                        )}
                        <h3 className="text-base font-semibold text-slate-900">
                          {fc?.name ?? 'Unbekanntes Abo'}
                        </h3>
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusMeta.className}`}
                        >
                          {statusMeta.label}
                        </span>
                      </div>

                      {fc && (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${CATEGORY_STYLES[fc.category]}`}
                          >
                            {CATEGORY_LABELS[fc.category]}
                          </span>
                          <span>·</span>
                          <span className="tabular-nums">
                            {BILLING_CYCLE_LABELS[fc.cycle]}
                            {fc.cycle !== 'monthly'
                              ? ` (${formatCents(fc.amount)} / ${BILLING_CYCLE_SHORT_LABELS[fc.cycle]} → ${formatCents(item.due)} / Monat)`
                              : ''}
                          </span>
                          <span>·</span>
                          <span className="tabular-nums">Fällig am {fc.dueDay}.</span>
                          {linkedProject && (
                            <>
                              <span>·</span>
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800 border border-emerald-200">
                                <FolderKanban className="h-3 w-3" />
                                {linkedProject.name}
                              </span>
                            </>
                          )}
                          {fc.activeUntil && (
                            <>
                              <span>·</span>
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800 border border-amber-200">
                                <CalendarOff className="h-3 w-3" />
                                Gekündigt zum {formatYearMonth(fc.activeUntil)}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="text-right tabular-nums">
                      <p className="text-base font-bold text-slate-900">{formatCents(item.due)}</p>
                      <p className="text-xs text-slate-500">pro Monat</p>
                    </div>
                  </div>

                  {/* Fortschrittsbalken */}
                  <div className="space-y-1.5">
                    <div
                      className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
                      role="progressbar"
                      aria-valuenow={item.progressPercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Deckung ${fc?.name ?? 'Abo'}`}
                    >
                      <div
                        className={`h-full rounded-full transition-all ${statusMeta.bar}`}
                        style={{ width: `${item.progressPercent}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
                      <span className="text-slate-600">
                        Gedeckt:{' '}
                        <strong className="font-semibold text-slate-900">
                          {formatCents(item.covered)}
                        </strong>{' '}
                        von {formatCents(item.due)} ({item.progressPercent} %)
                      </span>
                      {item.missing > 0 ? (
                        <span className="font-semibold text-rose-700">
                          Fehlt noch: {formatCents(item.missing)}
                        </span>
                      ) : (
                        <span className="font-medium text-emerald-700">Vollständig gedeckt</span>
                      )}
                    </div>
                  </div>

                  {/* Aktionen */}
                  {fc && (
                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => openEditForm(fc)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Bearbeiten
                      </button>

                      {fc.activeUntil ? (
                        <button
                          type="button"
                          onClick={() => handleReactivate(fc.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 transition-colors"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Kündigung aufheben
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openCancelInline(fc)}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 transition-colors"
                        >
                          <CalendarOff className="h-3.5 w-3.5" />
                          Kündigen
                        </button>
                      )}

                      {isConfirmingArchive ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleArchive(fc.id)}
                            className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 transition-colors"
                          >
                            Wirklich archivieren
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmArchiveId(null)}
                            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                          >
                            Abbrechen
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmArchiveId(fc.id);
                            setCancellingId(null);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:border-rose-200 hover:bg-rose-50 transition-colors"
                        >
                          <Archive className="h-3.5 w-3.5" />
                          Archivieren
                        </button>
                      )}
                    </div>
                  )}

                  {/* Inline-Kündigung */}
                  {fc && isCancelling && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2">
                      <p className="text-xs font-medium text-amber-950">
                        Letzter aktiver Monat für „{fc.name}“ (danach nicht mehr im Wasserfall):
                      </p>
                      {cancelError && (
                        <p role="alert" className="text-xs font-medium text-rose-700">
                          {cancelError}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="month"
                          aria-label={`Kündigungsmonat für ${fc.name}`}
                          min={fc.activeFrom}
                          value={cancelMonth}
                          onChange={(e) => setCancelMonth(e.target.value)}
                          className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs tabular-nums text-slate-900 focus:border-amber-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleConfirmCancel(fc)}
                          className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 transition-colors"
                        >
                          Kündigung speichern
                        </button>
                        <button
                          type="button"
                          onClick={() => setCancellingId(null)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Einklappbarer Bereich für zukünftige & gekündigte Abos */}
      {inactiveItems.length > 0 && (
        <section
          aria-label="Inaktive Abos im gewählten Monat"
          className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden"
        >
          <button
            type="button"
            onClick={() => setShowInactive((prev) => !prev)}
            aria-expanded={showInactive}
            className="flex w-full items-center justify-between gap-2 px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
          >
            <div>
              <h2 className="text-sm font-semibold text-slate-800">
                Zukünftige &amp; gekündigte Abos ({inactiveItems.length})
              </h2>
              <p className="text-xs text-slate-500">
                In {formatYearMonth(month)} nicht im Wasserfall aktiv – weiterhin bearbeitbar.
              </p>
            </div>
            {showInactive ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {showInactive && (
            <div className="divide-y divide-slate-100 border-t border-slate-100">
              {inactiveItems.map(({ fixedCost: fc, reason }) => {
                const monthly = monthlyEquivalent(fc);
                const linkedProject = fc.projectId ? projectMap.get(fc.projectId) : undefined;
                const isConfirmingArchive = confirmArchiveId === fc.id;

                return (
                  <div
                    key={fc.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 tabular-nums">
                          Prio {fc.priority}
                        </span>
                        <span className="text-sm font-semibold text-slate-900">{fc.name}</span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                            reason === 'future'
                              ? 'border-sky-200 bg-sky-50 text-sky-800'
                              : 'border-slate-200 bg-slate-100 text-slate-600'
                          }`}
                        >
                          {reason === 'future'
                            ? `Aktiv ab ${formatYearMonth(fc.activeFrom)}`
                            : `Gekündigt zum ${formatYearMonth(fc.activeUntil ?? fc.activeFrom)}`}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 tabular-nums">
                        <span>{CATEGORY_LABELS[fc.category]}</span>
                        <span>·</span>
                        <span>
                          {formatCents(monthly)} / Monat ({BILLING_CYCLE_LABELS[fc.cycle]})
                        </span>
                        {linkedProject && (
                          <>
                            <span>·</span>
                            <span>Projekt: {linkedProject.name}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditForm(fc)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Bearbeiten
                      </button>

                      {reason === 'ended' && fc.activeUntil && (
                        <button
                          type="button"
                          onClick={() => handleReactivate(fc.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 transition-colors"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Fortführen
                        </button>
                      )}

                      {isConfirmingArchive ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleArchive(fc.id)}
                            className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 transition-colors"
                          >
                            Archivieren
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmArchiveId(null)}
                            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                          >
                            Abbrechen
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmArchiveId(fc.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:border-rose-200 hover:bg-rose-50 transition-colors"
                        >
                          <Archive className="h-3.5 w-3.5" />
                          Archivieren
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

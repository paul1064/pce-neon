import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { z } from 'zod';
import {
  Archive,
  ArchiveRestore,
  Clock,
  Info,
  Pencil,
  Plus,
  Trash2,
  Wallet,
} from 'lucide-react';
import {
  db,
  formatCents,
  formatISODate,
  formatYearMonth,
  parseEuroToCents,
  useMonth,
  type ID,
  type ISODate,
  type IncomeEntry,
  type IncomeSource,
  type IncomeSourceKind,
  type Project,
} from '../../core';
import {
  INCOME_SOURCE_KINDS,
  INCOME_SOURCE_KIND_LABELS,
  archiveIncomeSource,
  computeSourceStats,
  createIncomeEntry,
  createIncomeSource,
  defaultReceivedOnForMonth,
  deleteIncomeEntry,
  formatHours,
  parseHoursInput,
  restoreIncomeSource,
  sortEntriesNewestFirst,
  summarizeMonthIncome,
  updateIncomeSource,
} from './logic';

const inputClass =
  'mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20';

const EMPTY_SOURCES: IncomeSource[] = [];
const EMPTY_ENTRIES: IncomeEntry[] = [];
const EMPTY_PROJECTS: Project[] = [];

export default function IncomePage() {
  const { month } = useMonth();
  const sourceNameInputRef = useRef<HTMLInputElement>(null);

  const sources =
    useLiveQuery(() => db.incomeSources.toArray(), []) ?? EMPTY_SOURCES;
  const monthEntries =
    useLiveQuery(
      () => db.incomeEntries.where('month').equals(month).toArray(),
      [month],
    ) ?? EMPTY_ENTRIES;
  const allEntries =
    useLiveQuery(() => db.incomeEntries.toArray(), []) ?? EMPTY_ENTRIES;
  const projects =
    useLiveQuery(() => db.projects.toArray(), []) ?? EMPTY_PROJECTS;

  const activeSources = useMemo(
    () =>
      sources
        .filter((s) => !s.archivedAt)
        .sort((a, b) => a.name.localeCompare(b.name, 'de-AT')),
    [sources],
  );

  const archivedSources = useMemo(
    () =>
      sources
        .filter((s) => Boolean(s.archivedAt))
        .sort((a, b) => a.name.localeCompare(b.name, 'de-AT')),
    [sources],
  );

  const activeProjects = useMemo(
    () =>
      projects
        .filter((p) => !p.archivedAt)
        .sort((a, b) => a.name.localeCompare(b.name, 'de-AT')),
    [projects],
  );

  const sourceById = useMemo(
    () => new Map(sources.map((s) => [s.id, s])),
    [sources],
  );
  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  const summary = useMemo(
    () => summarizeMonthIncome(monthEntries, sources),
    [monthEntries, sources],
  );

  const sortedMonthEntries = useMemo(
    () => sortEntriesNewestFirst(monthEntries),
    [monthEntries],
  );

  const [statsScope, setStatsScope] = useState<'month' | 'all'>('month');
  const sourceStats = useMemo(
    () =>
      computeSourceStats(
        statsScope === 'month' ? monthEntries : allEntries,
        sources,
      ),
    [statsScope, monthEntries, allEntries, sources],
  );

  // ── Buchungsformular ──────────────────────────────────────────────────
  const [entrySourceId, setEntrySourceId] = useState<string>('');
  const [entryAmountInput, setEntryAmountInput] = useState<string>('');
  const [entryDate, setEntryDate] = useState<ISODate>(() =>
    defaultReceivedOnForMonth(month),
  );
  const [entryHoursInput, setEntryHoursInput] = useState<string>('');
  const [entryNote, setEntryNote] = useState<string>('');
  const [entryError, setEntryError] = useState<string | null>(null);
  const [entrySuccess, setEntrySuccess] = useState<string | null>(null);

  useEffect(() => {
    setEntryDate(defaultReceivedOnForMonth(month));
  }, [month]);

  const effectiveEntrySourceId = activeSources.some(
    (s) => s.id === entrySourceId,
  )
    ? entrySourceId
    : (activeSources[0]?.id ?? '');

  // ── Neue Quelle anlegen ───────────────────────────────────────────────
  const [sourceName, setSourceName] = useState<string>('');
  const [sourceKind, setSourceKind] = useState<IncomeSourceKind>('microtask');
  const [sourceProjectId, setSourceProjectId] = useState<string>('');
  const [sourcePlatform, setSourcePlatform] = useState<string>('');
  const [sourceInWaterfall, setSourceInWaterfall] = useState<boolean>(true);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceSuccess, setSourceSuccess] = useState<string | null>(null);

  const effectiveProjectId =
    sourceKind === 'project'
      ? activeProjects.some((p) => p.id === sourceProjectId)
        ? sourceProjectId
        : activeProjects.length === 1
          ? activeProjects[0].id
          : ''
      : '';

  // ── Quelle bearbeiten ─────────────────────────────────────────────────
  const [editingSourceId, setEditingSourceId] = useState<ID | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editPlatform, setEditPlatform] = useState<string>('');
  const [editInWaterfall, setEditInWaterfall] = useState<boolean>(true);
  const [editError, setEditError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState<boolean>(false);

  const handleBookEntry = async (e: FormEvent) => {
    e.preventDefault();
    setEntryError(null);
    setEntrySuccess(null);

    const parsedCents = parseEuroToCents(entryAmountInput);
    if (parsedCents === null) {
      setEntryError(
        'Bitte einen gültigen Euro-Betrag eingeben (z. B. 125,50 oder 380).',
      );
      return;
    }

    const parsedHours = parseHoursInput(entryHoursInput);
    if (!parsedHours.ok) {
      setEntryError(parsedHours.error);
      return;
    }

    try {
      const saved = await createIncomeEntry({
        sourceId: effectiveEntrySourceId,
        amount: parsedCents,
        receivedOn: entryDate,
        hoursSpent: parsedHours.value,
        note: entryNote,
      });

      setEntryAmountInput('');
      setEntryHoursInput('');
      setEntryNote('');

      if (saved.month !== month) {
        setEntrySuccess(
          `Buchung über ${formatCents(saved.amount)} im Monat ${formatYearMonth(saved.month)} gespeichert.`,
        );
      } else {
        setEntrySuccess(`Einnahme über ${formatCents(saved.amount)} gebucht.`);
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        setEntryError(err.issues[0]?.message ?? 'Ungültige Eingabe.');
      } else if (err instanceof Error) {
        setEntryError(err.message);
      } else {
        setEntryError('Buchung konnte nicht gespeichert werden.');
      }
    }
  };

  const handleDeleteEntry = async (entryId: ID) => {
    await deleteIncomeEntry(entryId);
  };

  const handleCreateSource = async (e: FormEvent) => {
    e.preventDefault();
    setSourceError(null);
    setSourceSuccess(null);

    try {
      const created = await createIncomeSource({
        name: sourceName,
        kind: sourceKind,
        projectId:
          sourceKind === 'project' ? effectiveProjectId || undefined : undefined,
        platform: sourcePlatform,
        inWaterfall: sourceInWaterfall,
      });

      setSourceName('');
      setSourcePlatform('');
      setSourceInWaterfall(true);
      setEntrySourceId(created.id);
      setSourceSuccess(`Quelle „${created.name}“ wurde angelegt.`);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setSourceError(err.issues[0]?.message ?? 'Ungültige Eingabe.');
      } else if (err instanceof Error) {
        setSourceError(err.message);
      } else {
        setSourceError('Quelle konnte nicht angelegt werden.');
      }
    }
  };

  const startEditSource = (source: IncomeSource) => {
    setEditingSourceId(source.id);
    setEditName(source.name);
    setEditPlatform(source.platform ?? '');
    setEditInWaterfall(source.inWaterfall);
    setEditError(null);
  };

  const cancelEditSource = () => {
    setEditingSourceId(null);
    setEditError(null);
  };

  const handleSaveEditSource = async (e: FormEvent, id: ID) => {
    e.preventDefault();
    setEditError(null);
    try {
      await updateIncomeSource(id, {
        name: editName,
        platform: editPlatform,
        inWaterfall: editInWaterfall,
      });
      setEditingSourceId(null);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setEditError(err.issues[0]?.message ?? 'Ungültige Eingabe.');
      } else if (err instanceof Error) {
        setEditError(err.message);
      } else {
        setEditError('Änderungen konnten nicht gespeichert werden.');
      }
    }
  };

  const handleArchiveSource = async (id: ID) => {
    if (editingSourceId === id) {
      setEditingSourceId(null);
    }
    await archiveIncomeSource(id);
  };

  const handleRestoreSource = async (id: ID) => {
    await restoreIncomeSource(id);
  };

  return (
    <div className="space-y-6">
      {/* Kopf & Monatsübersicht */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Einkommens-Tracker · {formatYearMonth(month)}
            </p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900 tabular-nums">
              {formatCents(summary.totalCents)}
            </h1>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              Monatssumme · {summary.entryCount}{' '}
              {summary.entryCount === 1 ? 'Buchung' : 'Buchungen'}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {summary.hasExcludedSources && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
                <p className="text-[11px] font-medium text-emerald-700">
                  Im Wasserfall
                </p>
                <p className="mt-0.5 text-base font-semibold text-emerald-900 tabular-nums">
                  {formatCents(summary.waterfallCents)}
                </p>
                {summary.nonWaterfallCents > 0 && (
                  <p className="text-[11px] text-emerald-700/80 tabular-nums">
                    Außen vor: {formatCents(summary.nonWaterfallCents)}
                  </p>
                )}
              </div>
            )}

            {summary.totalHours > 0 && summary.averageHourlyRateCents !== null && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                <p className="text-[11px] font-medium text-slate-500">
                  Ø Stundenlohn ({formatHours(summary.totalHours)})
                </p>
                <p className="mt-0.5 text-base font-semibold text-slate-900 tabular-nums">
                  {formatCents(summary.averageHourlyRateCents)}/h
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Schnelle Buchung in 3 Pflichtfeldern */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-emerald-600" />
          <h2 className="text-base font-semibold text-slate-900">
            Einnahme buchen
          </h2>
        </div>

        {activeSources.length === 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 shrink-0 text-amber-600" />
              <span>
                Lege zuerst unten eine Einkommensquelle an (z. B. Micro-Task oder
                Projekt), um Einnahmen zu buchen.
              </span>
            </div>
            <button
              type="button"
              onClick={() => sourceNameInputRef.current?.focus()}
              className="rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 transition-colors"
            >
              Quelle anlegen
            </button>
          </div>
        ) : (
          <form onSubmit={handleBookEntry} className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="entry-source"
                  className="block text-xs font-medium text-slate-700"
                >
                  Quelle
                </label>
                <select
                  id="entry-source"
                  value={effectiveEntrySourceId}
                  onChange={(e) => setEntrySourceId(e.target.value)}
                  className={inputClass}
                  required
                >
                  {activeSources.map((src) => (
                    <option key={src.id} value={src.id}>
                      {src.name} ({INCOME_SOURCE_KIND_LABELS[src.kind]})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="entry-amount"
                  className="block text-xs font-medium text-slate-700"
                >
                  Betrag (€)
                </label>
                <input
                  id="entry-amount"
                  type="text"
                  inputMode="decimal"
                  value={entryAmountInput}
                  onChange={(e) => setEntryAmountInput(e.target.value)}
                  placeholder="z. B. 240,00"
                  className={`${inputClass} tabular-nums`}
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="entry-date"
                  className="block text-xs font-medium text-slate-700"
                >
                  Datum
                </label>
                <input
                  id="entry-date"
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className={`${inputClass} tabular-nums`}
                  required
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="entry-hours"
                  className="block text-xs font-medium text-slate-600"
                >
                  Arbeitszeit in Stunden (optional)
                </label>
                <input
                  id="entry-hours"
                  type="text"
                  inputMode="decimal"
                  value={entryHoursInput}
                  onChange={(e) => setEntryHoursInput(e.target.value)}
                  placeholder="z. B. 2,5"
                  className={`${inputClass} tabular-nums`}
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="entry-note"
                  className="block text-xs font-medium text-slate-600"
                >
                  Notiz (optional)
                </label>
                <input
                  id="entry-note"
                  type="text"
                  value={entryNote}
                  onChange={(e) => setEntryNote(e.target.value)}
                  placeholder="z. B. Auftrag #12, Auszahlung"
                  className={inputClass}
                />
              </div>
            </div>

            {entryError && (
              <p role="alert" className="text-xs font-medium text-rose-600">
                {entryError}
              </p>
            )}
            {entrySuccess && (
              <p role="status" className="text-xs font-medium text-emerald-700">
                {entrySuccess}
              </p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4" />
                Einnahme buchen
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Buchungen im gewählten Monat */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">
            Buchungen · {formatYearMonth(month)}
          </h2>
          <span className="text-xs font-medium text-slate-500 tabular-nums">
            Summe: {formatCents(summary.totalCents)}
          </span>
        </div>

        {sortedMonthEntries.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
            Für {formatYearMonth(month)} gibt es noch keine Buchungen.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {sortedMonthEntries.map((entry) => {
              const source = sourceById.get(entry.sourceId);
              const entryHourly =
                entry.hoursSpent && entry.hoursSpent > 0
                  ? Math.round(entry.amount / entry.hoursSpent)
                  : null;
              return (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">
                        {source?.name ?? 'Unbekannte Quelle'}
                      </span>
                      {source && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          {INCOME_SOURCE_KIND_LABELS[source.kind]}
                        </span>
                      )}
                      {source && !source.inWaterfall && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                          Nicht im Wasserfall
                        </span>
                      )}
                      {source?.archivedAt && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                          Archiviert
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      <span className="tabular-nums">
                        {formatISODate(entry.receivedOn)}
                      </span>
                      {entry.hoursSpent !== undefined && entry.hoursSpent > 0 && (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Clock className="h-3 w-3" />
                          {formatHours(entry.hoursSpent)}
                          {entryHourly !== null && (
                            <span>({formatCents(entryHourly)}/h)</span>
                          )}
                        </span>
                      )}
                      {entry.note && (
                        <span className="truncate text-slate-600">
                          {entry.note}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-900 tabular-nums">
                      {formatCents(entry.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleDeleteEntry(entry.id)}
                      aria-label={`Buchung vom ${formatISODate(entry.receivedOn)} löschen`}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Löschen
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Stundenlohn & Auswertung je Quelle */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Stundenlohn je Quelle
            </h2>
            <p className="text-xs text-slate-500">
              Einnahmen, erfasste Stunden und effektiver Stundenlohn im Überblick
            </p>
          </div>
          <div
            role="group"
            aria-label="Zeitraum für Auswertung"
            className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium"
          >
            <button
              type="button"
              onClick={() => setStatsScope('month')}
              className={`rounded-lg px-3 py-1 transition-colors ${
                statsScope === 'month'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Dieser Monat
            </button>
            <button
              type="button"
              onClick={() => setStatsScope('all')}
              className={`rounded-lg px-3 py-1 transition-colors ${
                statsScope === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Gesamt
            </button>
          </div>
        </div>

        {sourceStats.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            {statsScope === 'month'
              ? `Noch keine Einnahmen für ${formatYearMonth(month)}.`
              : 'Noch keine Einnahmen erfasst.'}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                  <th className="pb-2 pr-3">Quelle</th>
                  <th className="pb-2 px-3 text-right">Einnahmen</th>
                  <th className="pb-2 px-3 text-right">Stunden</th>
                  <th className="pb-2 pl-3 text-right">Stundenlohn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sourceStats.map((stat) => (
                  <tr key={stat.sourceId}>
                    <td className="py-2.5 pr-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-slate-900">
                          {stat.sourceName}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                          {INCOME_SOURCE_KIND_LABELS[stat.kind]}
                        </span>
                        {!stat.inWaterfall && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                            Nicht im Wasserfall
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {stat.entryCount}{' '}
                        {stat.entryCount === 1 ? 'Buchung' : 'Buchungen'}
                        {stat.platform ? ` · ${stat.platform}` : ''}
                      </p>
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-900 tabular-nums">
                      {formatCents(stat.totalCents)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-600 tabular-nums">
                      {stat.totalHours > 0 ? formatHours(stat.totalHours) : '—'}
                    </td>
                    <td className="py-2.5 pl-3 text-right font-medium text-emerald-700 tabular-nums">
                      {stat.hourlyRateCents !== null
                        ? `${formatCents(stat.hourlyRateCents)}/h`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Quellen verwalten */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <h2 className="text-base font-semibold text-slate-900">
          Einkommensquellen
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Verwalte Projekte, Micro-Tasks oder wiederkehrende Quellen. Läuft auch
          ohne angelegte Projekte.
        </p>

        {/* Formular: Neue Quelle */}
        <form
          onSubmit={handleCreateSource}
          className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3"
        >
          <h3 className="text-sm font-semibold text-slate-800">
            Neue Quelle anlegen
          </h3>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="source-name"
                className="block text-xs font-medium text-slate-700"
              >
                Name
              </label>
              <input
                ref={sourceNameInputRef}
                id="source-name"
                type="text"
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder="z. B. Shop oder Umfragen"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label
                htmlFor="source-kind"
                className="block text-xs font-medium text-slate-700"
              >
                Typ
              </label>
              <select
                id="source-kind"
                value={sourceKind}
                onChange={(e) =>
                  setSourceKind(e.target.value as IncomeSourceKind)
                }
                className={inputClass}
              >
                {INCOME_SOURCE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {INCOME_SOURCE_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {sourceKind === 'project' && (
            <div>
              <label
                htmlFor="source-project"
                className="block text-xs font-medium text-slate-700"
              >
                Projekt
              </label>
              {activeProjects.length === 0 ? (
                <div className="mt-1 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <span>
                    Es gibt noch keine aktiven Projekte. Lege zuerst im
                    Ideen-Sammler ein Projekt an oder wähle hier einen anderen
                    Typ (z. B. Micro-Task, Wiederkehrend oder Sonstiges).
                  </span>
                </div>
              ) : (
                <select
                  id="source-project"
                  value={effectiveProjectId}
                  onChange={(e) => setSourceProjectId(e.target.value)}
                  className={inputClass}
                  required
                >
                  {activeProjects.length > 1 && (
                    <option value="">Projekt wählen …</option>
                  )}
                  {activeProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <div>
              <label
                htmlFor="source-platform"
                className="block text-xs font-medium text-slate-700"
              >
                Plattform (optional)
              </label>
              <input
                id="source-platform"
                type="text"
                value={sourcePlatform}
                onChange={(e) => setSourcePlatform(e.target.value)}
                placeholder="z. B. Etsy, Prolific, Direkt"
                className={inputClass}
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={sourceInWaterfall}
                onChange={(e) => setSourceInWaterfall(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-xs font-medium text-slate-700">
                In Wasserfall einbeziehen
              </span>
            </label>
          </div>

          {sourceError && (
            <p role="alert" className="text-xs font-medium text-rose-600">
              {sourceError}
            </p>
          )}
          {sourceSuccess && (
            <p role="status" className="text-xs font-medium text-emerald-700">
              {sourceSuccess}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={sourceKind === 'project' && activeProjects.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Quelle anlegen
            </button>
          </div>
        </form>

        {/* Liste aktiver Quellen */}
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Aktive Quellen ({activeSources.length})
          </h3>

          {activeSources.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              Noch keine aktiven Einkommensquellen angelegt.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {activeSources.map((source) => {
                const linkedProject = source.projectId
                  ? projectById.get(source.projectId)
                  : undefined;
                const isEditing = editingSourceId === source.id;

                if (isEditing) {
                  return (
                    <li key={source.id} className="py-3">
                      <form
                        onSubmit={(e) => void handleSaveEditSource(e, source.id)}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3"
                      >
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label
                              htmlFor={`edit-name-${source.id}`}
                              className="block text-xs font-medium text-slate-700"
                            >
                              Name
                            </label>
                            <input
                              id={`edit-name-${source.id}`}
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className={inputClass}
                              required
                            />
                          </div>
                          <div>
                            <label
                              htmlFor={`edit-platform-${source.id}`}
                              className="block text-xs font-medium text-slate-700"
                            >
                              Plattform (optional)
                            </label>
                            <input
                              id={`edit-platform-${source.id}`}
                              type="text"
                              value={editPlatform}
                              onChange={(e) => setEditPlatform(e.target.value)}
                              className={inputClass}
                            />
                          </div>
                        </div>

                        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
                          <input
                            type="checkbox"
                            checked={editInWaterfall}
                            onChange={(e) =>
                              setEditInWaterfall(e.target.checked)
                            }
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          In Wasserfall einbeziehen
                        </label>

                        {editError && (
                          <p
                            role="alert"
                            className="text-xs font-medium text-rose-600"
                          >
                            {editError}
                          </p>
                        )}

                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={cancelEditSource}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Abbrechen
                          </button>
                          <button
                            type="submit"
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            Speichern
                          </button>
                        </div>
                      </form>
                    </li>
                  );
                }

                return (
                  <li
                    key={source.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">
                          {source.name}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          {INCOME_SOURCE_KIND_LABELS[source.kind]}
                        </span>
                        {source.inWaterfall ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                            Im Wasserfall
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                            Nicht im Wasserfall
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {[
                          linkedProject
                            ? `Projekt: ${linkedProject.name}`
                            : null,
                          source.platform
                            ? `Plattform: ${source.platform}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Keine weiteren Angaben'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEditSource(source)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Bearbeiten
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleArchiveSource(source.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800"
                      >
                        <Archive className="h-3.5 w-3.5" />
                        Archivieren
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Archivierte Quellen */}
        {archivedSources.length > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setShowArchived((prev) => !prev)}
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              {showArchived ? '▾' : '▸'} Archivierte Quellen (
              {archivedSources.length})
            </button>

            {showArchived && (
              <ul className="mt-3 divide-y divide-slate-100">
                {archivedSources.map((source) => (
                  <li
                    key={source.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm text-slate-500"
                  >
                    <div>
                      <span className="font-medium text-slate-700">
                        {source.name}
                      </span>{' '}
                      <span className="text-xs">
                        ({INCOME_SOURCE_KIND_LABELS[source.kind]})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRestoreSource(source.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <ArchiveRestore className="h-3.5 w-3.5" />
                      Wiederherstellen
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

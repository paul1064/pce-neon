import { useState, type FormEvent } from 'react';
import {
  Archive,
  ArchiveRestore,
  Compass,
  FolderKanban,
  Lightbulb,
  Pencil,
  Plus,
} from 'lucide-react';
import {
  centsToInput,
  formatCents,
  formatYearMonth,
  parseEuroToCents,
  type ID,
  type Project,
  type ProjectStatus,
  type YearMonth,
} from '../../core';
import { PROJECT_STATUS_LABELS, type ProjectMonthMetrics } from './logic';
import { createProject, setProjectArchived, updateProject } from './repository';

const PROJECT_BADGE_STYLES: Record<ProjectStatus, string> = {
  active: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  paused: 'bg-amber-50 text-amber-800 border-amber-200',
  done: 'bg-sky-50 text-sky-800 border-sky-200',
  dropped: 'bg-rose-50 text-rose-700 border-rose-200',
};

const PROJECT_STATUSES: readonly ProjectStatus[] = ['active', 'paused', 'done', 'dropped'];

interface ProjectsSectionProps {
  month: YearMonth;
  projects: Project[];
  metrics: Map<ID, ProjectMonthMetrics>;
  highlightedProjectId: ID | null;
}

export function ProjectsSection({
  month,
  projects,
  metrics,
  highlightedProjectId,
}: ProjectsSectionProps) {
  const [name, setName] = useState('');
  const [monthlyTargetRaw, setMonthlyTargetRaw] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);

  const [editingId, setEditingId] = useState<ID | null>(null);
  const [editName, setEditName] = useState('');
  const [editTargetRaw, setEditTargetRaw] = useState('');
  const [editNextStep, setEditNextStep] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const activeProjects = projects.filter((p) => !p.archivedAt && p.status === 'active');
  const totalActiveActual = activeProjects.reduce(
    (sum, p) => sum + (metrics.get(p.id)?.actualIncome ?? 0),
    0,
  );
  const totalActiveTarget = activeProjects.reduce(
    (sum, p) => sum + (p.monthlyTarget ?? 0),
    0,
  );

  const visibleProjects = projects.filter((p) => {
    if (!showArchived && p.archivedAt) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    return true;
  });

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    let monthlyTarget: number | undefined;
    if (monthlyTargetRaw.trim() !== '') {
      const parsed = parseEuroToCents(monthlyTargetRaw);
      if (parsed === null || parsed < 0) {
        setFormError('Bitte gib ein gültiges Monatsziel in Euro ein (z. B. 400,00).');
        return;
      }
      monthlyTarget = parsed;
    }

    setCreating(true);
    try {
      await createProject({
        name,
        ...(monthlyTarget !== undefined ? { monthlyTarget } : {}),
        ...(nextStep.trim() ? { nextStep } : {}),
      });
      setName('');
      setMonthlyTargetRaw('');
      setNextStep('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Projekt konnte nicht angelegt werden.');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (project: Project) => {
    setEditingId(project.id);
    setEditName(project.name);
    setEditTargetRaw(
      project.monthlyTarget !== undefined ? centsToInput(project.monthlyTarget) : '',
    );
    setEditNextStep(project.nextStep ?? '');
    setEditError(null);
  };

  const handleSaveEdit = async (e: FormEvent, projectId: ID) => {
    e.preventDefault();
    setEditError(null);

    let monthlyTarget: number | null = null;
    if (editTargetRaw.trim() !== '') {
      const parsed = parseEuroToCents(editTargetRaw);
      if (parsed === null || parsed < 0) {
        setEditError('Bitte gib ein gültiges Monatsziel in Euro ein (z. B. 400,00).');
        return;
      }
      monthlyTarget = parsed;
    }

    try {
      await updateProject(projectId, {
        name: editName,
        monthlyTarget,
        nextStep: editNextStep.trim() === '' ? null : editNextStep,
      });
      setEditingId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Projekt konnte nicht gespeichert werden.');
    }
  };

  return (
    <div className="space-y-5">
      {/* Monats-Zusammenfassung */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Projekt-Einnahmen · {formatYearMonth(month)}
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 tabular-nums">
                {formatCents(totalActiveActual)}
              </span>
              {totalActiveTarget > 0 && (
                <span className="text-sm text-slate-500 tabular-nums">
                  von {formatCents(totalActiveTarget)} Monatsziel (aktive Projekte)
                </span>
              )}
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            <FolderKanban className="h-3.5 w-3.5" />
            {activeProjects.length} {activeProjects.length === 1 ? 'aktives Projekt' : 'aktive Projekte'}
          </span>
        </div>
      </section>

      {/* Direktes Projekt anlegen */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <h2 className="text-sm font-semibold text-slate-900">Projekt direkt anlegen</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Projekte können auch ohne vorherige Idee gestartet werden.
        </p>

        <form onSubmit={handleCreate} className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label htmlFor="new-project-name" className="block text-xs font-medium text-slate-700">
                Projektname *
              </label>
              <input
                id="new-project-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. Etsy-Vorlagen, Nachhilfe, Web-Design …"
                required
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div>
              <label
                htmlFor="new-project-target"
                className="block text-xs font-medium text-slate-700"
              >
                Monatsziel (€)
              </label>
              <input
                id="new-project-target"
                type="text"
                inputMode="decimal"
                value={monthlyTargetRaw}
                onChange={(e) => setMonthlyTargetRaw(e.target.value)}
                placeholder="z. B. 500,00"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label
                htmlFor="new-project-next-step"
                className="block text-xs font-medium text-slate-700"
              >
                Nächster konkreter Schritt (optional)
              </label>
              <input
                id="new-project-next-step"
                type="text"
                value={nextStep}
                onChange={(e) => setNextStep(e.target.value)}
                placeholder="z. B. Erstes Angebot veröffentlichen"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shrink-0"
            >
              <Plus className="h-4 w-4" />
              Projekt anlegen
            </button>
          </div>

          {formError && (
            <p role="alert" className="text-xs font-medium text-rose-600">
              {formError}
            </p>
          )}
        </form>
      </section>

      {/* Filterleiste */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            Alle
          </button>
          {PROJECT_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === status
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {PROJECT_STATUS_LABELS[status]}
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          Archivierte anzeigen
        </label>
      </div>

      {/* Projektliste */}
      {visibleProjects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <FolderKanban className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-700">Noch keine passenden Projekte</p>
          <p className="mt-1 text-xs text-slate-500">
            Validiere eine Idee und befördere sie zum Projekt oder lege oben direkt eines an.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleProjects.map((project) => {
            const projectMetrics = metrics.get(project.id);
            const actual = projectMetrics?.actualIncome ?? 0;
            const target = project.monthlyTarget;
            const progressPercent = projectMetrics?.progressPercent ?? null;
            const clampedPercent = projectMetrics?.clampedPercent ?? 0;
            const remaining = projectMetrics?.remainingToTarget ?? null;
            const sourceCount = projectMetrics?.sourceCount ?? 0;
            const isHighlighted = highlightedProjectId === project.id;
            const isEditing = editingId === project.id;

            return (
              <article
                key={project.id}
                className={`rounded-2xl border bg-white p-5 shadow-xs transition-all ${
                  isHighlighted
                    ? 'border-emerald-400 ring-2 ring-emerald-500/20'
                    : project.archivedAt
                      ? 'border-slate-200/70 opacity-75'
                      : 'border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-900 break-words">
                        {project.name}
                      </h3>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${PROJECT_BADGE_STYLES[project.status]}`}
                      >
                        {PROJECT_STATUS_LABELS[project.status]}
                      </span>
                      {project.ideaId && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          <Lightbulb className="h-3 w-3 text-amber-500" />
                          Aus Idee
                        </span>
                      )}
                      {project.archivedAt && (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                          Archiviert
                        </span>
                      )}
                    </div>

                    {project.nextStep && !isEditing && (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                        <Compass className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        <span>
                          <strong className="font-medium text-slate-800">Nächster Schritt:</strong>{' '}
                          {project.nextStep}
                        </span>
                      </p>
                    )}
                  </div>

                  {/* Status-Auswahl & Aktionen */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!project.archivedAt && (
                      <select
                        aria-label={`Status für ${project.name}`}
                        value={project.status}
                        onChange={(e) => {
                          void updateProject(project.id, {
                            status: e.target.value as ProjectStatus,
                          });
                        }}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-emerald-500 focus:outline-none"
                      >
                        {PROJECT_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {PROJECT_STATUS_LABELS[st]}
                          </option>
                        ))}
                      </select>
                    )}

                    {!project.archivedAt && !isEditing && (
                      <button
                        type="button"
                        onClick={() => startEdit(project)}
                        aria-label={`Projekt ${project.name} bearbeiten`}
                        title="Bearbeiten"
                        className="rounded-xl p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        void setProjectArchived(project.id, !project.archivedAt);
                      }}
                      aria-label={
                        project.archivedAt ? 'Projekt wiederherstellen' : 'Projekt archivieren'
                      }
                      title={project.archivedAt ? 'Wiederherstellen' : 'Archivieren'}
                      className="rounded-xl p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                    >
                      {project.archivedAt ? (
                        <ArchiveRestore className="h-4 w-4" />
                      ) : (
                        <Archive className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Bearbeitungsformular */}
                {isEditing && (
                  <form
                    onSubmit={(e) => handleSaveEdit(e, project.id)}
                    className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-700">
                          Projektname *
                        </label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          required
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700">
                          Monatsziel (€)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editTargetRaw}
                          onChange={(e) => setEditTargetRaw(e.target.value)}
                          placeholder="Leer = kein Ziel"
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700">
                        Nächster Schritt
                      </label>
                      <input
                        type="text"
                        value={editNextStep}
                        onChange={(e) => setEditNextStep(e.target.value)}
                        placeholder="Was ist der nächste kleine Schritt?"
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                    {editError && (
                      <p role="alert" className="text-xs font-medium text-rose-600">
                        {editError}
                      </p>
                    )}
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                      >
                        Abbrechen
                      </button>
                      <button
                        type="submit"
                        className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
                      >
                        Speichern
                      </button>
                    </div>
                  </form>
                )}

                {/* Soll gegen Ist */}
                <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-600">
                      Ist vs. Soll ({formatYearMonth(month)})
                    </span>
                    <div className="flex items-baseline gap-1.5 tabular-nums">
                      <span className="text-sm font-bold text-slate-900">
                        {formatCents(actual)}
                      </span>
                      <span className="text-slate-400">/</span>
                      <span className="font-medium text-slate-600">
                        {target !== undefined && target > 0
                          ? formatCents(target)
                          : 'Kein Ziel'}
                      </span>
                      {progressPercent !== null && (
                        <span
                          className={`ml-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                            progressPercent >= 100
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200/80 text-slate-700'
                          }`}
                        >
                          {progressPercent} %
                        </span>
                      )}
                    </div>
                  </div>

                  {target !== undefined && target > 0 && (
                    <div className="mt-2">
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full rounded-full transition-all ${
                            (progressPercent ?? 0) >= 100 ? 'bg-emerald-500' : 'bg-emerald-600'
                          }`}
                          style={{ width: `${clampedPercent}%` }}
                        />
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-500 tabular-nums">
                        <span>
                          {remaining !== null && remaining > 0
                            ? `Noch ${formatCents(remaining)} bis zum Monatsziel`
                            : remaining !== null && remaining < 0
                              ? `${formatCents(Math.abs(remaining))} über dem Monatsziel`
                              : 'Monatsziel exakt erreicht'}
                        </span>
                        <span>
                          {sourceCount}{' '}
                          {sourceCount === 1 ? 'verknüpfte Quelle' : 'verknüpfte Quellen'}
                        </span>
                      </div>
                    </div>
                  )}

                  {(target === undefined || target === 0) && (
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      {sourceCount > 0
                        ? `${sourceCount} ${sourceCount === 1 ? 'Einkommensquelle' : 'Einkommensquellen'} verknüpft · Setze über „Bearbeiten“ ein Monatsziel.`
                        : 'Noch keine Einkommensquelle verknüpft – wähle dieses Projekt unter „Einnahmen“ aus.'}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useMemo, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FolderKanban,
  Lightbulb,
  Plus,
  X,
} from 'lucide-react';
import {
  db,
  parseEuroToCents,
  useMonth,
  type ID,
  type IdeaStatus,
} from '../../core';
import {
  IDEA_STATUS_LABELS,
  computeProjectMetrics,
  parseTagsInput,
} from './logic';
import { createIdea } from './repository';
import { IdeaCard } from './IdeaCard';
import { ProjectsSection } from './ProjectsSection';

type ActiveTab = 'ideas' | 'projects';

const IDEA_STATUS_FILTERS: readonly IdeaStatus[] = [
  'inbox',
  'validating',
  'validated',
  'promoted',
  'rejected',
];

export default function IdeasPage() {
  const { month } = useMonth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('ideas');
  const [highlightedProjectId, setHighlightedProjectId] = useState<ID | null>(null);
  const [recentlyCreatedIdeaId, setRecentlyCreatedIdeaId] = useState<ID | null>(null);
  const [promotedBanner, setPromotedBanner] = useState<{
    projectId: ID;
    projectName: string;
  } | null>(null);

  // Ideen-Erfassungsformular
  const [title, setTitle] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [setupHoursRaw, setSetupHoursRaw] = useState('');
  const [monthlyRevenueRaw, setMonthlyRevenueRaw] = useState('');
  const [monthlyCostRaw, setMonthlyCostRaw] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Ideen-Filter
  const [statusFilter, setStatusFilter] = useState<IdeaStatus | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);

  // Live-Abfragen (eigene + fremde Tabellen ausschließlich lesend über useLiveQuery)
  const ideas = useLiveQuery(async () => {
    const all = await db.ideas.toArray();
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt));
  }, []);

  const projects = useLiveQuery(async () => {
    const all = await db.projects.toArray();
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt));
  }, []);

  const incomeSources = useLiveQuery(() => db.incomeSources.toArray(), []);

  const monthIncomeEntries = useLiveQuery(
    () => db.incomeEntries.where('month').equals(month).toArray(),
    [month],
  );

  const projectMetrics = useMemo(
    () =>
      computeProjectMetrics(
        projects ?? [],
        incomeSources ?? [],
        monthIncomeEntries ?? [],
      ),
    [projects, incomeSources, monthIncomeEntries],
  );

  const nonArchivedIdeas = useMemo(
    () => (ideas ?? []).filter((i) => !i.archivedAt),
    [ideas],
  );

  const nonArchivedProjects = useMemo(
    () => (projects ?? []).filter((p) => !p.archivedAt),
    [projects],
  );

  const validatedCount = useMemo(
    () => nonArchivedIdeas.filter((i) => i.status === 'validated').length,
    [nonArchivedIdeas],
  );

  const visibleIdeas = useMemo(() => {
    return (ideas ?? []).filter((idea) => {
      if (!showArchived && idea.archivedAt) return false;
      if (statusFilter !== 'all' && idea.status !== statusFilter) return false;
      return true;
    });
  }, [ideas, showArchived, statusFilter]);

  const handleCreateIdea = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const hasAnyEstimate =
      setupHoursRaw.trim() !== '' ||
      monthlyRevenueRaw.trim() !== '' ||
      monthlyCostRaw.trim() !== '';

    let estimate: { setupHours: number; monthlyRevenue: number; monthlyCost: number } | undefined;
    if (hasAnyEstimate) {
      const hoursVal =
        setupHoursRaw.trim() === '' ? 0 : Number(setupHoursRaw.replace(',', '.'));
      if (!Number.isFinite(hoursVal) || hoursVal < 0) {
        setFormError('Bitte gib gültige Startstunden (≥ 0) ein.');
        return;
      }
      const revCents =
        monthlyRevenueRaw.trim() === '' ? 0 : parseEuroToCents(monthlyRevenueRaw);
      if (revCents === null || revCents < 0) {
        setFormError('Bitte gib einen gültigen erwarteten Monatsumsatz ein (z. B. 500,00).');
        return;
      }
      const costCents =
        monthlyCostRaw.trim() === '' ? 0 : parseEuroToCents(monthlyCostRaw);
      if (costCents === null || costCents < 0) {
        setFormError('Bitte gib gültige erwartete Monatskosten ein (z. B. 20,00).');
        return;
      }
      estimate = {
        setupHours: hoursVal,
        monthlyRevenue: revCents,
        monthlyCost: costCents,
      };
    }

    setSubmitting(true);
    try {
      const created = await createIdea({
        title,
        description,
        tags: parseTagsInput(tagsRaw),
        ...(estimate ? { estimate } : {}),
      });
      setRecentlyCreatedIdeaId(created.id);
      setTitle('');
      setDescription('');
      setTagsRaw('');
      setSetupHoursRaw('');
      setMonthlyRevenueRaw('');
      setMonthlyCostRaw('');
      setDetailsOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Idee konnte nicht gespeichert werden.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenProject = (projectId: ID) => {
    setHighlightedProjectId(projectId);
    setActiveTab('projects');
  };

  return (
    <div className="space-y-6">
      {/* Seitenkopf & Tab-Umschalter */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            Stufe 1 · Ideen-Sammler
          </span>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900">
            Ideen & Projekte
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Sammle Einkommensideen, prüfe sie mit 5 Kriterien und mache validierte Ideen zu Projekten.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Bereiche"
          className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-xs self-start sm:self-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ideas'}
            onClick={() => setActiveTab('ideas')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              activeTab === 'ideas'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Lightbulb className="h-4 w-4" />
            <span>Ideen</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
                activeTab === 'ideas' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {nonArchivedIdeas.length}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'projects'}
            onClick={() => setActiveTab('projects')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              activeTab === 'projects'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <FolderKanban className="h-4 w-4" />
            <span>Projekte</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
                activeTab === 'projects' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {nonArchivedProjects.length}
            </span>
          </button>
        </div>
      </header>

      {/* Hinweis-Banner nach Beförderung */}
      {promotedBanner && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>
              Projekt <strong>„{promotedBanner.projectName}“</strong> wurde angelegt und die Idee als{' '}
              <strong>Befördert</strong> markiert.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                handleOpenProject(promotedBanner.projectId);
                setPromotedBanner(null);
              }}
              className="rounded-lg bg-emerald-700 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors"
            >
              Zum Projekt wechseln
            </button>
            <button
              type="button"
              onClick={() => setPromotedBanner(null)}
              aria-label="Hinweis schließen"
              className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* TAB 1: IDEEN */}
      {activeTab === 'ideas' && (
        <div className="space-y-5">
          {/* Schnelle Erfassung */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <form onSubmit={handleCreateIdea} className="space-y-3">
              <label htmlFor="quick-idea-title" className="block text-sm font-semibold text-slate-900">
                Neue Idee festhalten
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="quick-idea-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Idee in einem Satz (z. B. Vorlagen-Shop, Kleingewerbe-Service …)"
                  required
                  className="flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  Idee speichern
                </button>
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setDetailsOpen((prev) => !prev)}
                  aria-expanded={detailsOpen}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
                >
                  {detailsOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  Beschreibung, Tags & Schätzung (optional)
                </button>
                {validatedCount > 0 && (
                  <span className="text-xs font-medium text-emerald-700">
                    {validatedCount} {validatedCount === 1 ? 'Idee' : 'Ideen'} bereit für ein Projekt
                  </span>
                )}
              </div>

              {detailsOpen && (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <label htmlFor="idea-description" className="block text-xs font-medium text-slate-700">
                      Beschreibung
                    </label>
                    <textarea
                      id="idea-description"
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Für wen ist es gedacht? Welches Problem löst es?"
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                  <div>
                    <label htmlFor="idea-tags" className="block text-xs font-medium text-slate-700">
                      Tags (kommagetrennt)
                    </label>
                    <input
                      id="idea-tags"
                      type="text"
                      value={tagsRaw}
                      onChange={(e) => setTagsRaw(e.target.value)}
                      placeholder="z. B. digital, schnell, nebenbei"
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label htmlFor="idea-hours" className="block text-xs font-medium text-slate-700">
                        Startaufwand (Stunden)
                      </label>
                      <input
                        id="idea-hours"
                        type="number"
                        min="0"
                        step="0.5"
                        value={setupHoursRaw}
                        onChange={(e) => setSetupHoursRaw(e.target.value)}
                        placeholder="z. B. 10"
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                    <div>
                      <label htmlFor="idea-revenue" className="block text-xs font-medium text-slate-700">
                        Erw. Monatsumsatz (€)
                      </label>
                      <input
                        id="idea-revenue"
                        type="text"
                        inputMode="decimal"
                        value={monthlyRevenueRaw}
                        onChange={(e) => setMonthlyRevenueRaw(e.target.value)}
                        placeholder="z. B. 400,00"
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                    <div>
                      <label htmlFor="idea-cost" className="block text-xs font-medium text-slate-700">
                        Erw. Monatskosten (€)
                      </label>
                      <input
                        id="idea-cost"
                        type="text"
                        inputMode="decimal"
                        value={monthlyCostRaw}
                        onChange={(e) => setMonthlyCostRaw(e.target.value)}
                        placeholder="z. B. 15,00"
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                  </div>
                </div>
              )}

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
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                Alle
              </button>
              {IDEA_STATUS_FILTERS.map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    statusFilter === st
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {IDEA_STATUS_LABELS[st]}
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

          {/* Ideen-Liste */}
          {visibleIdeas.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <Lightbulb className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-700">
                {nonArchivedIdeas.length === 0
                  ? 'Noch keine Ideen erfasst'
                  : 'Keine Ideen für diesen Filter'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Halte oben deine erste Idee fest und bewerte sie anhand der 5 Kriterien.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleIdeas.map((idea) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  defaultExpanded={
                    idea.id === recentlyCreatedIdeaId ||
                    (visibleIdeas.length <= 3 &&
                      (idea.status === 'inbox' || idea.status === 'validating'))
                  }
                  onPromoted={(projectId, projectName) =>
                    setPromotedBanner({ projectId, projectName })
                  }
                  onOpenProject={handleOpenProject}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PROJEKTE */}
      {activeTab === 'projects' && (
        <ProjectsSection
          month={month}
          projects={projects ?? []}
          metrics={projectMetrics}
          highlightedProjectId={highlightedProjectId}
        />
      )}
    </div>
  );
}

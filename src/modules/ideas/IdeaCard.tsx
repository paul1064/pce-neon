import { useState, type FormEvent } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Pencil,
  Rocket,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import {
  centsToInput,
  formatCents,
  formatISODate,
  parseEuroToCents,
  type ID,
  type Idea,
  type IdeaStatus,
  type ValidationCheck,
  type ValidationCriterion,
} from '../../core';
import {
  IDEA_STATUS_LABELS,
  TOTAL_CRITERIA_COUNT,
  VALIDATION_CRITERIA,
  VALIDATION_THRESHOLD,
  parseTagsInput,
} from './logic';
import {
  promoteIdeaToProject,
  setIdeaArchived,
  setIdeaStatus,
  updateIdea,
  upsertIdeaCheck,
} from './repository';

const STATUS_BADGE_STYLES: Record<IdeaStatus, string> = {
  inbox: 'bg-slate-100 text-slate-700 border-slate-200',
  validating: 'bg-sky-50 text-sky-800 border-sky-200',
  validated: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  promoted: 'bg-emerald-700 text-white border-emerald-700',
};

const RATINGS: readonly (1 | 2 | 3 | 4 | 5)[] = [1, 2, 3, 4, 5];

interface IdeaCardProps {
  idea: Idea;
  defaultExpanded?: boolean;
  onPromoted: (projectId: ID, projectName: string) => void;
  onOpenProject: (projectId: ID) => void;
}

export function IdeaCard({
  idea,
  defaultExpanded = false,
  onPromoted,
  onOpenProject,
}: IdeaCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [editing, setEditing] = useState(false);
  const [openNoteKey, setOpenNoteKey] = useState<ValidationCriterion | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Partial<Record<ValidationCriterion, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit-Formular-Zustand
  const [editTitle, setEditTitle] = useState(idea.title);
  const [editDescription, setEditDescription] = useState(idea.description);
  const [editTags, setEditTags] = useState(idea.tags.join(', '));
  const [editSetupHours, setEditSetupHours] = useState(
    idea.estimate ? String(idea.estimate.setupHours) : '',
  );
  const [editMonthlyRevenue, setEditMonthlyRevenue] = useState(
    idea.estimate ? centsToInput(idea.estimate.monthlyRevenue) : '',
  );
  const [editMonthlyCost, setEditMonthlyCost] = useState(
    idea.estimate ? centsToInput(idea.estimate.monthlyCost) : '',
  );

  const checksByKey = new Map<ValidationCriterion, ValidationCheck>(
    idea.checks.map((c) => [c.criterion, c]),
  );
  const ratedCount = checksByKey.size;
  const isLocked = Boolean(idea.archivedAt) || idea.status === 'promoted';

  const startEditing = () => {
    setEditTitle(idea.title);
    setEditDescription(idea.description);
    setEditTags(idea.tags.join(', '));
    setEditSetupHours(idea.estimate ? String(idea.estimate.setupHours) : '');
    setEditMonthlyRevenue(idea.estimate ? centsToInput(idea.estimate.monthlyRevenue) : '');
    setEditMonthlyCost(idea.estimate ? centsToInput(idea.estimate.monthlyCost) : '');
    setError(null);
    setEditing(true);
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const hasAnyEstimate =
      editSetupHours.trim() !== '' ||
      editMonthlyRevenue.trim() !== '' ||
      editMonthlyCost.trim() !== '';

    let estimate: { setupHours: number; monthlyRevenue: number; monthlyCost: number } | null = null;
    if (hasAnyEstimate) {
      const hoursVal = editSetupHours.trim() === '' ? 0 : Number(editSetupHours.replace(',', '.'));
      if (!Number.isFinite(hoursVal) || hoursVal < 0) {
        setError('Bitte gib gültige Stunden (≥ 0) ein.');
        return;
      }
      const revCents =
        editMonthlyRevenue.trim() === '' ? 0 : parseEuroToCents(editMonthlyRevenue);
      if (revCents === null || revCents < 0) {
        setError('Bitte gib einen gültigen Monatsumsatz in Euro ein (z. B. 500,00).');
        return;
      }
      const costCents =
        editMonthlyCost.trim() === '' ? 0 : parseEuroToCents(editMonthlyCost);
      if (costCents === null || costCents < 0) {
        setError('Bitte gib gültige Monatskosten in Euro ein (z. B. 25,00).');
        return;
      }
      estimate = {
        setupHours: hoursVal,
        monthlyRevenue: revCents,
        monthlyCost: costCents,
      };
    }

    setBusy(true);
    try {
      await updateIdea(idea.id, {
        title: editTitle,
        description: editDescription,
        tags: parseTagsInput(editTags),
        estimate,
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Änderungen konnten nicht gespeichert werden.');
    } finally {
      setBusy(false);
    }
  };

  const handleRate = async (criterion: ValidationCriterion, rating: 1 | 2 | 3 | 4 | 5) => {
    if (isLocked) return;
    setError(null);
    const existingNote = noteDrafts[criterion] ?? checksByKey.get(criterion)?.note;
    try {
      await upsertIdeaCheck(idea.id, {
        criterion,
        rating,
        ...(existingNote && existingNote.trim() ? { note: existingNote.trim() } : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bewertung konnte nicht gespeichert werden.');
    }
  };

  const handleSaveNote = async (criterion: ValidationCriterion) => {
    const existing = checksByKey.get(criterion);
    if (!existing || isLocked) return;
    const draft = noteDrafts[criterion] ?? existing.note ?? '';
    setError(null);
    try {
      await upsertIdeaCheck(idea.id, {
        criterion,
        rating: existing.rating,
        ...(draft.trim() ? { note: draft.trim() } : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Notiz konnte nicht gespeichert werden.');
    }
  };

  const handlePromote = async () => {
    setBusy(true);
    setError(null);
    try {
      const { project } = await promoteIdeaToProject(idea.id);
      onPromoted(project.id, project.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Befördern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const handleStatusChange = async (nextStatus: IdeaStatus) => {
    setBusy(true);
    setError(null);
    try {
      await setIdeaStatus(idea.id, nextStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status konnte nicht geändert werden.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleArchive = async () => {
    setBusy(true);
    setError(null);
    try {
      await setIdeaArchived(idea.id, !idea.archivedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archivieren fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const scoreValue = idea.score;
  const scoreBadgeClass =
    scoreValue === undefined
      ? 'bg-slate-100 text-slate-500'
      : scoreValue >= VALIDATION_THRESHOLD
        ? 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200'
        : 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200';

  return (
    <article
      className={`rounded-2xl border bg-white p-5 shadow-xs transition-colors ${
        idea.archivedAt ? 'border-slate-200/70 opacity-75' : 'border-slate-200'
      }`}
    >
      {/* Kopfzeile */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900 break-words">{idea.title}</h3>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_STYLES[idea.status]}`}
            >
              {IDEA_STATUS_LABELS[idea.status]}
            </span>
            {idea.archivedAt && (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                Archiviert
              </span>
            )}
          </div>
          {idea.description && !editing && (
            <p className="mt-1.5 text-sm text-slate-600 whitespace-pre-line">{idea.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Erstellt am {formatISODate(idea.createdAt)}</span>
            {idea.estimate && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums font-medium text-slate-700">
                  Ziel {formatCents(idea.estimate.monthlyRevenue)}/Monat
                </span>
                {idea.estimate.monthlyCost > 0 && (
                  <span className="tabular-nums">
                    (Kosten {formatCents(idea.estimate.monthlyCost)})
                  </span>
                )}
                {idea.estimate.setupHours > 0 && (
                  <span className="tabular-nums">· {idea.estimate.setupHours} h Startaufwand</span>
                )}
              </>
            )}
          </div>
          {idea.tags.length > 0 && !editing && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {idea.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Score-Anzeige */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            className={`rounded-xl px-3 py-1.5 text-right tabular-nums ${scoreBadgeClass}`}
            aria-label={
              scoreValue !== undefined
                ? `Score ${scoreValue} von 100 Punkten`
                : 'Noch nicht bewertet'
            }
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider opacity-75">
              Score
            </div>
            <div className="text-lg font-bold leading-tight">
              {scoreValue !== undefined ? scoreValue : '–'}
            </div>
          </div>
        </div>
      </div>

      {/* Fehleranzeige */}
      {error && (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
        >
          {error}
        </div>
      )}

      {/* Bearbeitungsformular */}
      {editing && (
        <form
          onSubmit={handleSaveEdit}
          className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
        >
          <div>
            <label className="block text-xs font-medium text-slate-700">Titel *</label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Beschreibung</label>
            <textarea
              rows={2}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">
              Tags (kommagetrennt)
            </label>
            <input
              type="text"
              value={editTags}
              onChange={(e) => setEditTags(e.target.value)}
              placeholder="z. B. digital, produkt, lokal"
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Startaufwand (Stunden)
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={editSetupHours}
                onChange={(e) => setEditSetupHours(e.target.value)}
                placeholder="0"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Monatsumsatz (€)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={editMonthlyRevenue}
                onChange={(e) => setEditMonthlyRevenue(e.target.value)}
                placeholder="500,00"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Monatskosten (€)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={editMonthlyCost}
                onChange={(e) => setEditMonthlyCost(e.target.value)}
                placeholder="20,00"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              Speichern
            </button>
          </div>
        </form>
      )}

      {/* Aktionsleiste + Bewertung ein-/ausklappen */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          <span>
            Bewertung ({ratedCount}/{TOTAL_CRITERIA_COUNT})
          </span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {!idea.archivedAt && idea.status === 'validated' && (
            <button
              type="button"
              disabled={busy}
              onClick={handlePromote}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              <Rocket className="h-3.5 w-3.5" />
              Zum Projekt machen
            </button>
          )}

          {idea.status === 'promoted' && idea.projectId && (
            <button
              type="button"
              onClick={() => onOpenProject(idea.projectId as ID)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors"
            >
              Projekt ansehen
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}

          {!idea.archivedAt && (idea.status === 'inbox' || idea.status === 'validating') && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleStatusChange('validated')}
                className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50/70 px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 transition-colors"
                title="Auch ohne 5 Bewertungen manuell als validiert markieren"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Validieren
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleStatusChange('rejected')}
                className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 transition-colors"
              >
                <XCircle className="h-3.5 w-3.5" />
                Verwerfen
              </button>
            </>
          )}

          {!idea.archivedAt && idea.status === 'rejected' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => handleStatusChange(ratedCount > 0 ? 'validating' : 'inbox')}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Wieder öffnen
            </button>
          )}

          {!idea.archivedAt && !editing && (
            <button
              type="button"
              onClick={startEditing}
              aria-label="Idee bearbeiten"
              className="inline-flex items-center gap-1 rounded-xl p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
              title="Bearbeiten"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={handleToggleArchive}
            aria-label={idea.archivedAt ? 'Idee wiederherstellen' : 'Idee archivieren'}
            className="inline-flex items-center gap-1 rounded-xl p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
            title={idea.archivedAt ? 'Wiederherstellen' : 'Archivieren'}
          >
            {idea.archivedAt ? (
              <ArchiveRestore className="h-3.5 w-3.5" />
            ) : (
              <Archive className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* 5-Kriterien-Bewertung */}
      {expanded && (
        <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          {/* Score-Fortschritt */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-700">
                5-Kriterien-Prüfung
              </span>
              <span className="tabular-nums text-slate-600">
                {scoreValue !== undefined ? (
                  <>
                    Score <strong className="text-slate-900">{scoreValue}</strong> / 100 (Schwelle{' '}
                    {VALIDATION_THRESHOLD})
                  </>
                ) : (
                  'Bewerte die 5 Kriterien von 1 bis 5'
                )}
              </span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full transition-all ${
                  (scoreValue ?? 0) >= VALIDATION_THRESHOLD ? 'bg-emerald-500' : 'bg-amber-400'
                }`}
                style={{ width: `${scoreValue ?? 0}%` }}
              />
              <div
                aria-hidden="true"
                className="absolute top-0 bottom-0 w-0.5 bg-slate-700/60"
                style={{ left: `${VALIDATION_THRESHOLD}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500">
              {ratedCount < TOTAL_CRITERIA_COUNT
                ? `Noch ${TOTAL_CRITERIA_COUNT - ratedCount} ${
                    TOTAL_CRITERIA_COUNT - ratedCount === 1 ? 'Kriterium' : 'Kriterien'
                  } offen – ab 5 Bewertungen und ${VALIDATION_THRESHOLD} Punkten automatisch validiert.`
                : (scoreValue ?? 0) >= VALIDATION_THRESHOLD
                  ? 'Alle 5 Kriterien bewertet und Schwelle erreicht – bereit für ein Projekt.'
                  : `Alle 5 Kriterien bewertet, aber unter ${VALIDATION_THRESHOLD} Punkten.`}
            </p>
          </div>

          {/* Kriterien-Liste */}
          <div className="divide-y divide-slate-200/80">
            {VALIDATION_CRITERIA.map((criterion) => {
              const check = checksByKey.get(criterion.key);
              const noteVisible = openNoteKey === criterion.key || Boolean(check?.note);
              const draftNote = noteDrafts[criterion.key] ?? check?.note ?? '';

              return (
                <div key={criterion.key} className="py-3 first:pt-1 last:pb-0">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{criterion.label}</p>
                      <p className="text-xs text-slate-500">{criterion.hint}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div
                        role="group"
                        aria-label={`Bewertung für ${criterion.label}`}
                        className="inline-flex items-center gap-1"
                      >
                        {RATINGS.map((rating) => {
                          const selected = check?.rating === rating;
                          return (
                            <button
                              key={rating}
                              type="button"
                              disabled={isLocked}
                              aria-pressed={selected}
                              aria-label={`${criterion.label}: ${rating} von 5`}
                              onClick={() => handleRate(criterion.key, rating)}
                              className={`h-8 w-8 rounded-lg text-xs font-semibold tabular-nums transition-colors ${
                                selected
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'border border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 disabled:hover:border-slate-200 disabled:hover:bg-white'
                              } disabled:opacity-60`}
                            >
                              {rating}
                            </button>
                          );
                        })}
                      </div>
                      {check && !isLocked && (
                        <button
                          type="button"
                          onClick={() =>
                            setOpenNoteKey((prev) =>
                              prev === criterion.key ? null : criterion.key,
                            )
                          }
                          aria-label={`Notiz zu ${criterion.label}`}
                          title="Notiz hinzufügen oder bearbeiten"
                          className={`rounded-lg p-1.5 transition-colors ${
                            check.note || openNoteKey === criterion.key
                              ? 'bg-slate-200 text-slate-800'
                              : 'text-slate-400 hover:bg-slate-200/70 hover:text-slate-700'
                          }`}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {noteVisible && check && (
                    <div className="mt-2">
                      {isLocked ? (
                        check.note && (
                          <p className="rounded-lg bg-white px-2.5 py-1.5 text-xs text-slate-600">
                            {check.note}
                          </p>
                        )
                      ) : (
                        <input
                          type="text"
                          value={draftNote}
                          onChange={(e) =>
                            setNoteDrafts((prev) => ({
                              ...prev,
                              [criterion.key]: e.target.value,
                            }))
                          }
                          onBlur={() => handleSaveNote(criterion.key)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void handleSaveNote(criterion.key);
                            }
                          }}
                          placeholder={`Kurze Notiz zu „${criterion.label}“ …`}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </article>
  );
}

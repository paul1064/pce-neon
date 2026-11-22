import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, FolderKanban, Lightbulb } from 'lucide-react';
import { db, formatCents, formatYearMonth, type YearMonth } from '../../core';
import { computeProjectMetrics } from './logic';

export function IdeasDashboardCard({ month }: { month: YearMonth }) {
  const data = useLiveQuery(async () => {
    const [ideas, projects, sources, entries] = await Promise.all([
      db.ideas.toArray(),
      db.projects.toArray(),
      db.incomeSources.toArray(),
      db.incomeEntries.where('month').equals(month).toArray(),
    ]);

    const activeIdeas = ideas.filter((i) => !i.archivedAt);
    const openCount = activeIdeas.filter(
      (i) => i.status === 'inbox' || i.status === 'validating',
    ).length;
    const validatedCount = activeIdeas.filter((i) => i.status === 'validated').length;

    const activeProjects = projects.filter((p) => !p.archivedAt && p.status === 'active');
    const metrics = computeProjectMetrics(activeProjects, sources, entries);
    const totalTarget = activeProjects.reduce((sum, p) => sum + (p.monthlyTarget ?? 0), 0);
    const totalActual = activeProjects.reduce(
      (sum, p) => sum + (metrics.get(p.id)?.actualIncome ?? 0),
      0,
    );

    return {
      openCount,
      validatedCount,
      activeProjectCount: activeProjects.length,
      totalTarget,
      totalActual,
    };
  }, [month]);

  return (
    <Link
      to="/ideen"
      className="group flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-emerald-300 transition-colors"
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Lightbulb className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Ideen & Projekte</h3>
              <p className="text-[11px] text-slate-500">Stufe 1 · {formatYearMonth(month)}</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 group-hover:text-emerald-600 transition-all" />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-slate-50 p-2.5">
            <p className="text-[11px] text-slate-500">Offen</p>
            <p className="mt-0.5 text-lg font-bold text-slate-900 tabular-nums">
              {data ? data.openCount : '–'}
            </p>
          </div>
          <div className="rounded-xl bg-emerald-50/70 p-2.5">
            <p className="text-[11px] text-emerald-800">Validiert</p>
            <p className="mt-0.5 text-lg font-bold text-emerald-800 tabular-nums">
              {data ? data.validatedCount : '–'}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-2.5">
            <p className="text-[11px] text-slate-500">Projekte</p>
            <p className="mt-0.5 text-lg font-bold text-slate-900 tabular-nums">
              {data ? data.activeProjectCount : '–'}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
        {data && (data.totalActual > 0 || data.totalTarget > 0) ? (
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <FolderKanban className="h-3.5 w-3.5 text-emerald-600" />
            <span>
              Ist <strong className="text-slate-900">{formatCents(data.totalActual)}</strong>
              {data.totalTarget > 0 ? ` / Ziel ${formatCents(data.totalTarget)}` : ''}
            </span>
          </span>
        ) : (
          <span className="text-slate-500">Ideen bewerten & Projekte starten</span>
        )}
        <span className="font-semibold text-emerald-700">Öffnen</span>
      </div>
    </Link>
  );
}

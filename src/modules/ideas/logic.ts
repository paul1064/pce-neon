import { z } from 'zod';
import type {
  Cents,
  ID,
  IdeaStatus,
  IncomeEntry,
  IncomeSource,
  Project,
  ProjectStatus,
  ValidationCheck,
  ValidationCriterion,
} from '../../core';

export const VALIDATION_THRESHOLD = 60;
export const TOTAL_CRITERIA_COUNT = 5;

export interface CriterionDefinition {
  key: ValidationCriterion;
  label: string;
  hint: string;
}

export const VALIDATION_CRITERIA: readonly CriterionDefinition[] = [
  {
    key: 'demand',
    label: 'Zahlende Nachfrage',
    hint: 'Gibt es Menschen, die dafür nachweislich bezahlen? (1 = unklar, 5 = klar belegt)',
  },
  {
    key: 'effort',
    label: 'Aufwand bis zum ersten Angebot',
    hint: 'Wie überschaubar ist der Weg bis zum ersten Angebot? (1 = riesig, 5 = sehr klein)',
  },
  {
    key: 'timeToFirstEuro',
    label: 'Zeit bis zum ersten Euro',
    hint: 'Wie schnell kann der erste Euro fließen? (1 = Monate, 5 = Tage)',
  },
  {
    key: 'startupCost',
    label: 'Startkosten',
    hint: 'Wie gering sind die nötigen Vorabkosten? (1 = hoch, 5 = nahezu 0 €)',
  },
  {
    key: 'energy',
    label: 'Energie & Motivation',
    hint: 'Zieht mich das Thema an oder kostet es Kraft? (1 = zehrt, 5 = zieht mich an)',
  },
] as const;

export const IDEA_STATUS_LABELS: Record<IdeaStatus, string> = {
  inbox: 'Eingang',
  validating: 'In Prüfung',
  validated: 'Validiert',
  rejected: 'Verworfen',
  promoted: 'Befördert',
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Aktiv',
  paused: 'Pausiert',
  done: 'Fertig',
  dropped: 'Abgebrochen',
};

// ── Zod-Schemas ───────────────────────────────────────────────────────

export const validationCriterionSchema = z.enum([
  'demand',
  'effort',
  'timeToFirstEuro',
  'startupCost',
  'energy',
]);

export const validationRatingSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const validationCheckSchema = z.object({
  criterion: validationCriterionSchema,
  rating: validationRatingSchema,
  note: z.string().trim().max(500, 'Notiz darf höchstens 500 Zeichen haben.').optional(),
});

export const ideaEstimateSchema = z.object({
  setupHours: z
    .number()
    .finite('Aufwand muss eine gültige Zahl sein.')
    .min(0, 'Aufwand darf nicht negativ sein.')
    .max(100_000, 'Aufwand ist unrealistisch hoch.'),
  monthlyRevenue: z
    .number()
    .int('Monatsumsatz muss in ganzen Cent angegeben werden.')
    .min(0, 'Monatsumsatz darf nicht negativ sein.'),
  monthlyCost: z
    .number()
    .int('Monatskosten müssen in ganzen Cent angegeben werden.')
    .min(0, 'Monatskosten dürfen nicht negativ sein.'),
});

export const ideaStatusSchema = z.enum([
  'inbox',
  'validating',
  'validated',
  'rejected',
  'promoted',
]);

export const createIdeaInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Bitte gib einen Titel für die Idee ein.')
    .max(140, 'Titel darf höchstens 140 Zeichen haben.'),
  description: z
    .string()
    .trim()
    .max(2000, 'Beschreibung darf höchstens 2000 Zeichen haben.')
    .default(''),
  tags: z
    .array(z.string().trim().min(1).max(32, 'Ein Tag darf höchstens 32 Zeichen haben.'))
    .max(12, 'Höchstens 12 Tags pro Idee.')
    .default([]),
  estimate: ideaEstimateSchema.optional(),
});

export const updateIdeaInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Bitte gib einen Titel für die Idee ein.')
    .max(140, 'Titel darf höchstens 140 Zeichen haben.')
    .optional(),
  description: z
    .string()
    .trim()
    .max(2000, 'Beschreibung darf höchstens 2000 Zeichen haben.')
    .optional(),
  tags: z
    .array(z.string().trim().min(1).max(32, 'Ein Tag darf höchstens 32 Zeichen haben.'))
    .max(12, 'Höchstens 12 Tags pro Idee.')
    .optional(),
  estimate: ideaEstimateSchema.nullable().optional(),
});

export const projectStatusSchema = z.enum(['active', 'paused', 'done', 'dropped']);

export const createProjectInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Bitte gib einen Projektnamen ein.')
    .max(140, 'Projektname darf höchstens 140 Zeichen haben.'),
  monthlyTarget: z
    .number()
    .int('Monatsziel muss in ganzen Cent angegeben werden.')
    .min(0, 'Monatsziel darf nicht negativ sein.')
    .optional(),
  nextStep: z
    .string()
    .trim()
    .max(240, 'Nächster Schritt darf höchstens 240 Zeichen haben.')
    .optional(),
});

export const updateProjectInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Bitte gib einen Projektnamen ein.')
    .max(140, 'Projektname darf höchstens 140 Zeichen haben.')
    .optional(),
  status: projectStatusSchema.optional(),
  monthlyTarget: z
    .number()
    .int('Monatsziel muss in ganzen Cent angegeben werden.')
    .min(0, 'Monatsziel darf nicht negativ sein.')
    .nullable()
    .optional(),
  nextStep: z
    .string()
    .trim()
    .max(240, 'Nächster Schritt darf höchstens 240 Zeichen haben.')
    .nullable()
    .optional(),
});

export type CreateIdeaInput = z.input<typeof createIdeaInputSchema>;
export type UpdateIdeaInput = z.input<typeof updateIdeaInputSchema>;
export type CreateProjectInput = z.input<typeof createProjectInputSchema>;
export type UpdateProjectInput = z.input<typeof updateProjectInputSchema>;

// ── Reine Berechnungen ────────────────────────────────────────────────

/** Normalisiert Checks, sodass jedes Kriterium höchstens einmal vorkommt. */
export function normalizeChecks(checks: ValidationCheck[]): ValidationCheck[] {
  const byCriterion = new Map<ValidationCriterion, ValidationCheck>();
  for (const check of checks) {
    byCriterion.set(check.criterion, {
      criterion: check.criterion,
      rating: check.rating,
      ...(check.note && check.note.trim().length > 0 ? { note: check.note.trim() } : {}),
    });
  }
  return VALIDATION_CRITERIA.map((def) => byCriterion.get(def.key)).filter(
    (item): item is ValidationCheck => item !== undefined,
  );
}

/**
 * Berechnet den Ideen-Score (0–100) als auf 0..100 skalierten Durchschnitt der Bewertungen (1..5).
 * Formel: Math.round(((avg - 1) / 4) * 100). Gibt undefined zurück, wenn keine Kriterien bewertet sind.
 */
export function calculateIdeaScore(checks: ValidationCheck[]): number | undefined {
  const unique = normalizeChecks(checks);
  if (unique.length === 0) return undefined;
  const sum = unique.reduce((acc, c) => acc + c.rating, 0);
  const avg = sum / unique.length;
  return Math.round(((avg - 1) / 4) * 100);
}

/**
 * Bestimmt den Ideen-Status nach einer Änderung der Bewertungen:
 * - 'promoted' und 'rejected' bleiben unverändert.
 * - Alle 5 Kriterien bewertet UND score >= 60 -> 'validated'.
 * - 1–4 Kriterien ODER score < 60 -> 'validating' (falls vorher 'inbox', 'validating' oder 'validated').
 * - 0 Kriterien -> 'inbox'.
 */
export function deriveIdeaStatus(
  currentStatus: IdeaStatus,
  checks: ValidationCheck[],
): IdeaStatus {
  if (currentStatus === 'promoted' || currentStatus === 'rejected') {
    return currentStatus;
  }
  const unique = normalizeChecks(checks);
  if (unique.length === 0) {
    return 'inbox';
  }
  const score = calculateIdeaScore(unique);
  if (
    unique.length === TOTAL_CRITERIA_COUNT &&
    score !== undefined &&
    score >= VALIDATION_THRESHOLD
  ) {
    return 'validated';
  }
  return 'validating';
}

/** Fügt eine Bewertung hinzu oder aktualisiert sie für das angegebene Kriterium. */
export function applyCheckUpdate(
  existingChecks: ValidationCheck[],
  nextCheck: ValidationCheck,
): ValidationCheck[] {
  const filtered = existingChecks.filter((c) => c.criterion !== nextCheck.criterion);
  return normalizeChecks([...filtered, nextCheck]);
}

/** Parst kommagetrennte Tags in eine bereinigte, deduplizierte Liste. */
export function parseTagsInput(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(',')) {
    const cleaned = part.trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= 12) break;
  }
  return result;
}

export interface ProjectMonthMetrics {
  projectId: ID;
  actualIncome: Cents;
  monthlyTarget?: Cents;
  sourceCount: number;
  progressPercent: number | null;
  clampedPercent: number;
  remainingToTarget: Cents | null;
}

/**
 * Berechnet für jedes Projekt die echten Einnahmen des gewählten Monats
 * aus allen IncomeSources mit source.projectId === project.id.
 */
export function computeProjectMetrics(
  projects: Project[],
  sources: IncomeSource[],
  entriesForMonth: IncomeEntry[],
): Map<ID, ProjectMonthMetrics> {
  const sourcesByProject = new Map<ID, Set<ID>>();
  for (const source of sources) {
    if (!source.projectId || source.archivedAt) continue;
    const existing = sourcesByProject.get(source.projectId);
    if (existing) {
      existing.add(source.id);
    } else {
      sourcesByProject.set(source.projectId, new Set([source.id]));
    }
  }

  // Auch archivierte Quellen mit bereits gebuchten Einträgen im Monat berücksichtigen
  const allSourceToProject = new Map<ID, ID>();
  for (const source of sources) {
    if (source.projectId) {
      allSourceToProject.set(source.id, source.projectId);
    }
  }

  const incomeByProject = new Map<ID, Cents>();
  for (const entry of entriesForMonth) {
    if (entry.archivedAt) continue;
    const projectId = allSourceToProject.get(entry.sourceId);
    if (!projectId) continue;
    incomeByProject.set(projectId, (incomeByProject.get(projectId) ?? 0) + entry.amount);
  }

  const metrics = new Map<ID, ProjectMonthMetrics>();
  for (const project of projects) {
    const actualIncome = incomeByProject.get(project.id) ?? 0;
    const sourceCount = sourcesByProject.get(project.id)?.size ?? 0;
    const target = project.monthlyTarget;
    const hasPositiveTarget = target !== undefined && target > 0;
    const progressPercent = hasPositiveTarget
      ? Math.round((actualIncome / target) * 100)
      : null;
    const clampedPercent =
      progressPercent === null ? 0 : Math.max(0, Math.min(100, progressPercent));
    const remainingToTarget = hasPositiveTarget ? target - actualIncome : null;

    metrics.set(project.id, {
      projectId: project.id,
      actualIncome,
      monthlyTarget: target,
      sourceCount,
      progressPercent,
      clampedPercent,
      remainingToTarget,
    });
  }

  return metrics;
}

import { z } from 'zod';
import {
  DEFAULT_SETTINGS,
  type Debt,
  type DebtPayment,
  type EngineDB,
  type EngineSettings,
  type FixedCost,
  type Idea,
  type IncomeEntry,
  type IncomeSource,
  type MonthClose,
  type Project,
} from '../core';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const yearMonthSchema = z.string().regex(/^\d{4}-\d{2}$/);
const centsSchema = z.number().int();

const baseEntitySchema = z.object({
  id: z.string().min(1),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  archivedAt: isoDateSchema.optional(),
});

const ideaSchema: z.ZodType<Idea> = baseEntitySchema.extend({
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  status: z.enum(['inbox', 'validating', 'validated', 'rejected', 'promoted']),
  checks: z.array(
    z.object({
      criterion: z.enum(['demand', 'effort', 'timeToFirstEuro', 'startupCost', 'energy']),
      rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      note: z.string().optional(),
    }),
  ),
  score: z.number().optional(),
  estimate: z
    .object({
      setupHours: z.number(),
      monthlyRevenue: centsSchema,
      monthlyCost: centsSchema,
    })
    .optional(),
  projectId: z.string().optional(),
});

const projectSchema: z.ZodType<Project> = baseEntitySchema.extend({
  name: z.string(),
  status: z.enum(['active', 'paused', 'done', 'dropped']),
  ideaId: z.string().optional(),
  monthlyTarget: centsSchema.optional(),
  nextStep: z.string().optional(),
});

const incomeSourceSchema: z.ZodType<IncomeSource> = baseEntitySchema.extend({
  name: z.string(),
  kind: z.enum(['project', 'microtask', 'recurring', 'other']),
  projectId: z.string().optional(),
  platform: z.string().optional(),
  inWaterfall: z.boolean(),
});

const incomeEntrySchema: z.ZodType<IncomeEntry> = baseEntitySchema.extend({
  sourceId: z.string(),
  amount: centsSchema,
  receivedOn: isoDateSchema,
  month: yearMonthSchema,
  hoursSpent: z.number().optional(),
  note: z.string().optional(),
});

const fixedCostSchema: z.ZodType<FixedCost> = baseEntitySchema.extend({
  name: z.string(),
  amount: centsSchema,
  cycle: z.enum(['monthly', 'quarterly', 'yearly']),
  dueDay: z.number().int().min(1).max(28),
  priority: z.number().int().min(1),
  category: z.enum(['essential', 'tool', 'comfort']),
  activeFrom: yearMonthSchema,
  activeUntil: yearMonthSchema.optional(),
  projectId: z.string().optional(),
});

const debtSchema: z.ZodType<Debt> = baseEntitySchema.extend({
  name: z.string(),
  creditor: z.string().optional(),
  originalAmount: centsSchema,
  balance: centsSchema,
  aprBps: z.number().int().min(0),
  minPayment: centsSchema,
  status: z.enum(['open', 'paid']),
});

const debtPaymentSchema: z.ZodType<DebtPayment> = baseEntitySchema.extend({
  debtId: z.string(),
  amount: centsSchema,
  paidOn: isoDateSchema,
  month: yearMonthSchema,
  kind: z.enum(['minimum', 'extra']),
  monthCloseId: z.string().optional(),
});

const waterfallResultSchema = z.object({
  month: yearMonthSchema,
  totalIncome: centsSchema,
  fixedCosts: z.array(
    z.object({
      id: z.string(),
      due: centsSchema,
      covered: centsSchema,
    }),
  ),
  fixedCostsDue: centsSchema,
  fixedCostsCovered: centsSchema,
  fixedCostGap: centsSchema,
  surplus: centsSchema,
  debtPayments: z.array(
    z.object({
      debtId: z.string(),
      minimum: centsSchema,
      extra: centsSchema,
      balanceAfter: centsSchema,
    }),
  ),
  minimumGap: centsSchema,
  bufferHeld: centsSchema,
  totalToDebt: centsSchema,
  unallocated: centsSchema,
});

const monthCloseSchema: z.ZodType<MonthClose> = baseEntitySchema.extend({
  month: yearMonthSchema,
  result: waterfallResultSchema,
});

const settingsSchema: z.ZodType<EngineSettings> = z.object({
  id: z.literal('settings'),
  currency: z.literal('EUR'),
  debtStrategy: z.enum(['snowball', 'avalanche']),
  buffer: centsSchema.min(0),
  enabledModules: z.array(z.enum(['ideas', 'income', 'fixedCosts', 'debts'])),
});

export const backupPayloadSchema = z.object({
  schemaVersion: z.literal(4),
  exportedAt: z.string(),
  tables: z.object({
    ideas: z.array(ideaSchema),
    projects: z.array(projectSchema),
    settings: z.array(settingsSchema),
    incomeSources: z.array(incomeSourceSchema),
    incomeEntries: z.array(incomeEntrySchema),
    fixedCosts: z.array(fixedCostSchema),
    debts: z.array(debtSchema),
    debtPayments: z.array(debtPaymentSchema),
    monthCloses: z.array(monthCloseSchema),
  }),
});

export type BackupPayload = z.infer<typeof backupPayloadSchema>;

const LAST_EXPORT_KEY = 'pce:lastExportAt';
const REMINDER_DISMISSED_KEY = 'pce:exportReminderDismissedMonth';

export function getLastExportAt(): string | null {
  try {
    return window.localStorage.getItem(LAST_EXPORT_KEY);
  } catch {
    return null;
  }
}

export function markExportedNow(now = new Date()): void {
  try {
    window.localStorage.setItem(LAST_EXPORT_KEY, now.toISOString());
  } catch {
    // localStorage nicht verfügbar
  }
}

export function dismissExportReminderForMonth(month: string): void {
  try {
    window.localStorage.setItem(REMINDER_DISMISSED_KEY, month);
  } catch {
    // localStorage nicht verfügbar
  }
}

export function shouldShowExportReminder(currentMonth: string, hasData: boolean, now = new Date()): boolean {
  if (!hasData) return false;
  try {
    const dismissedMonth = window.localStorage.getItem(REMINDER_DISMISSED_KEY);
    if (dismissedMonth === currentMonth) return false;
    const last = window.localStorage.getItem(LAST_EXPORT_KEY);
    if (!last) return true;
    const diffMs = now.getTime() - new Date(last).getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    return Number.isNaN(diffMs) || diffMs >= thirtyDaysMs;
  } catch {
    return false;
  }
}

/** Exportiert alle neun Tabellen als validiertes Backup-Objekt. */
export async function exportAllData(database: EngineDB): Promise<BackupPayload> {
  const [
    ideas,
    projects,
    settings,
    incomeSources,
    incomeEntries,
    fixedCosts,
    debts,
    debtPayments,
    monthCloses,
  ] = await Promise.all([
    database.ideas.toArray(),
    database.projects.toArray(),
    database.settings.toArray(),
    database.incomeSources.toArray(),
    database.incomeEntries.toArray(),
    database.fixedCosts.toArray(),
    database.debts.toArray(),
    database.debtPayments.toArray(),
    database.monthCloses.toArray(),
  ]);

  return {
    schemaVersion: 4,
    exportedAt: new Date().toISOString(),
    tables: {
      ideas,
      projects,
      settings,
      incomeSources,
      incomeEntries,
      fixedCosts,
      debts,
      debtPayments,
      monthCloses,
    },
  };
}

/** Validiert ein JSON-Backup mit Zod und ersetzt alle Tabellen atomar. */
export async function importAllData(database: EngineDB, raw: unknown): Promise<BackupPayload> {
  const parsed = backupPayloadSchema.parse(raw);
  const { tables } = parsed;

  await database.transaction('rw', database.tables, async () => {
    await Promise.all(database.tables.map((t) => t.clear()));
    if (tables.ideas.length > 0) await database.ideas.bulkAdd(tables.ideas);
    if (tables.projects.length > 0) await database.projects.bulkAdd(tables.projects);
    if (tables.settings.length > 0) {
      await database.settings.bulkAdd(tables.settings);
    } else {
      await database.settings.put(DEFAULT_SETTINGS);
    }
    if (tables.incomeSources.length > 0) await database.incomeSources.bulkAdd(tables.incomeSources);
    if (tables.incomeEntries.length > 0) await database.incomeEntries.bulkAdd(tables.incomeEntries);
    if (tables.fixedCosts.length > 0) await database.fixedCosts.bulkAdd(tables.fixedCosts);
    if (tables.debts.length > 0) await database.debts.bulkAdd(tables.debts);
    if (tables.debtPayments.length > 0) await database.debtPayments.bulkAdd(tables.debtPayments);
    if (tables.monthCloses.length > 0) await database.monthCloses.bulkAdd(tables.monthCloses);
  });

  return parsed;
}

/** Löscht alle Daten aller Tabellen und stellt die Standard-Einstellungen wieder her. */
export async function clearAllData(database: EngineDB): Promise<void> {
  await database.transaction('rw', database.tables, async () => {
    await Promise.all(database.tables.map((t) => t.clear()));
    await database.settings.put(DEFAULT_SETTINGS);
  });
}

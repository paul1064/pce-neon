import { z } from 'zod';
import {
  db,
  monthlyEquivalent,
  todayISO,
  type BillingCycle,
  type Cents,
  type EngineDB,
  type FixedCost,
  type ID,
  type ISODate,
  type WaterfallResult,
  type YearMonth,
} from '../../core';

export type FixedCostCategory = FixedCost['category'];

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: 'Monatlich',
  quarterly: 'Vierteljährlich',
  yearly: 'Jährlich',
};

export const BILLING_CYCLE_SHORT_LABELS: Record<BillingCycle, string> = {
  monthly: 'Monat',
  quarterly: 'Quartal',
  yearly: 'Jahr',
};

export const CATEGORY_LABELS: Record<FixedCostCategory, string> = {
  essential: 'Wichtig',
  tool: 'Tool / Arbeit',
  comfort: 'Komfort',
};

export const yearMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Bitte einen gültigen Monat (JJJJ-MM) angeben.');

export const fixedCostInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Bitte einen Namen für das Abo eingeben.')
      .max(120, 'Der Name darf höchstens 120 Zeichen lang sein.'),
    amount: z
      .number()
      .int('Der Betrag muss in ganzen Cent vorliegen.')
      .positive('Der Betrag muss größer als 0,00 € sein.'),
    cycle: z.enum(['monthly', 'quarterly', 'yearly']),
    dueDay: z
      .number()
      .int('Der Fälligkeitstag muss eine ganze Zahl sein.')
      .min(1, 'Der Fälligkeitstag muss zwischen 1 und 28 liegen.')
      .max(28, 'Der Fälligkeitstag muss zwischen 1 und 28 liegen.'),
    priority: z
      .number()
      .int('Die Priorität muss eine ganze Zahl sein.')
      .min(1, 'Die Priorität muss mindestens 1 sein.')
      .max(999, 'Die Priorität darf höchstens 999 sein.'),
    category: z.enum(['essential', 'tool', 'comfort']),
    activeFrom: yearMonthSchema,
    activeUntil: yearMonthSchema.optional(),
    projectId: z.string().trim().min(1).optional(),
  })
  .refine((data) => !data.activeUntil || data.activeUntil >= data.activeFrom, {
    message: 'Der Kündigungsmonat darf nicht vor dem Startmonat liegen.',
    path: ['activeUntil'],
  });

export type FixedCostInput = z.infer<typeof fixedCostInputSchema>;

export const cancelFixedCostSchema = z.object({
  activeUntil: yearMonthSchema,
});

/** Berechnet den aufgerundeten Monatsanteil für Betrag und Abrechnungszyklus. */
export function previewMonthlyEquivalent(amount: Cents, cycle: BillingCycle): Cents {
  const sample: FixedCost = {
    id: 'preview',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    name: '',
    amount,
    cycle,
    dueDay: 1,
    priority: 1,
    category: 'tool',
    activeFrom: '2026-01',
  };
  return monthlyEquivalent(sample);
}

/** Prüft analog zu core/db.ts, ob ein Abo im angegebenen Monat aktiv ist. */
export function isFixedCostActiveInMonth(fc: FixedCost, month: YearMonth): boolean {
  return !fc.archivedAt && fc.activeFrom <= month && (!fc.activeUntil || month <= fc.activeUntil);
}

export type InactiveReason = 'future' | 'ended';

export interface InactiveFixedCostItem {
  fixedCost: FixedCost;
  reason: InactiveReason;
}

/** Liefert alle nicht-archivierten Abos, die im gewählten Monat nicht aktiv sind. */
export function getInactiveFixedCostsForMonth(
  fixedCosts: FixedCost[],
  month: YearMonth,
): InactiveFixedCostItem[] {
  return fixedCosts
    .filter((fc) => !fc.archivedAt && !isFixedCostActiveInMonth(fc, month))
    .map((fc): InactiveFixedCostItem => ({
      fixedCost: fc,
      reason: fc.activeFrom > month ? 'future' : 'ended',
    }))
    .sort(
      (a, b) =>
        a.fixedCost.priority - b.fixedCost.priority ||
        a.fixedCost.name.localeCompare(b.fixedCost.name, 'de'),
    );
}

/** Ermittelt die kleinste noch freie Priorität >= 1 unter den nicht-archivierten Abos. */
export function getNextPriority(fixedCosts: FixedCost[]): number {
  const used = new Set(
    fixedCosts.filter((fc) => !fc.archivedAt).map((fc) => fc.priority),
  );
  let candidate = 1;
  while (used.has(candidate)) {
    candidate += 1;
  }
  return candidate;
}

export type CoverageStatus = 'covered' | 'partial' | 'uncovered';

export interface FixedCostCoverageItem {
  id: ID;
  fixedCost?: FixedCost;
  due: Cents;
  covered: Cents;
  missing: Cents;
  progressPercent: number;
  status: CoverageStatus;
}

export interface FixedCostCoverageSummary {
  items: FixedCostCoverageItem[];
  totalCount: number;
  coveredCount: number;
  nextUncovered: FixedCostCoverageItem | null;
}

/**
 * Verknüpft das Wasserfall-Ergebnis mit den Abo-Stammdaten und ermittelt
 * Deckungsstatus, Zähler und das nächste ungedeckte bzw. teilgedeckte Abo.
 */
export function summarizeFixedCostCoverage(
  result: WaterfallResult,
  fixedCosts: FixedCost[],
): FixedCostCoverageSummary {
  const byId = new Map<ID, FixedCost>(fixedCosts.map((fc) => [fc.id, fc]));

  const items: FixedCostCoverageItem[] = result.fixedCosts.map((entry) => {
    const missing = Math.max(0, entry.due - entry.covered);
    let status: CoverageStatus;
    if (entry.due > 0 && entry.covered >= entry.due) {
      status = 'covered';
    } else if (entry.covered > 0) {
      status = 'partial';
    } else {
      status = 'uncovered';
    }
    const progressPercent =
      entry.due > 0 ? Math.min(100, Math.round((entry.covered / entry.due) * 100)) : 100;

    return {
      id: entry.id,
      fixedCost: byId.get(entry.id),
      due: entry.due,
      covered: entry.covered,
      missing,
      progressPercent,
      status,
    };
  });

  const coveredCount = items.filter((item) => item.covered >= item.due && item.due > 0).length;
  const nextUncovered = items.find((item) => item.due > 0 && item.covered < item.due) ?? null;

  return {
    items,
    totalCount: items.length,
    coveredCount,
    nextUncovered,
  };
}

/** Legt ein neues Abo validiert in db.fixedCosts an. */
export async function createFixedCost(
  input: FixedCostInput,
  database: EngineDB = db,
  now: ISODate = todayISO(),
): Promise<FixedCost> {
  const parsed = fixedCostInputSchema.parse(input);
  const entity: FixedCost = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    name: parsed.name,
    amount: parsed.amount,
    cycle: parsed.cycle,
    dueDay: parsed.dueDay,
    priority: parsed.priority,
    category: parsed.category,
    activeFrom: parsed.activeFrom,
    ...(parsed.activeUntil ? { activeUntil: parsed.activeUntil } : {}),
    ...(parsed.projectId ? { projectId: parsed.projectId } : {}),
  };
  await database.fixedCosts.add(entity);
  return entity;
}

/** Aktualisiert ein bestehendes Abo validiert in db.fixedCosts. */
export async function updateFixedCost(
  id: ID,
  input: FixedCostInput,
  database: EngineDB = db,
  now: ISODate = todayISO(),
): Promise<FixedCost> {
  const existing = await database.fixedCosts.get(id);
  if (!existing) {
    throw new Error('Abo wurde nicht gefunden.');
  }
  const parsed = fixedCostInputSchema.parse(input);
  const updated: FixedCost = {
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: now,
    ...(existing.archivedAt ? { archivedAt: existing.archivedAt } : {}),
    name: parsed.name,
    amount: parsed.amount,
    cycle: parsed.cycle,
    dueDay: parsed.dueDay,
    priority: parsed.priority,
    category: parsed.category,
    activeFrom: parsed.activeFrom,
    ...(parsed.activeUntil ? { activeUntil: parsed.activeUntil } : {}),
    ...(parsed.projectId ? { projectId: parsed.projectId } : {}),
  };
  await database.fixedCosts.put(updated);
  return updated;
}

/** Kündigt ein Abo zum angegebenen Monat (setzt activeUntil). */
export async function cancelFixedCost(
  id: ID,
  activeUntil: YearMonth,
  database: EngineDB = db,
  now: ISODate = todayISO(),
): Promise<FixedCost> {
  const existing = await database.fixedCosts.get(id);
  if (!existing) {
    throw new Error('Abo wurde nicht gefunden.');
  }
  const parsed = cancelFixedCostSchema.parse({ activeUntil });
  if (parsed.activeUntil < existing.activeFrom) {
    throw new Error('Der Kündigungsmonat darf nicht vor dem Startmonat liegen.');
  }
  const updated: FixedCost = {
    ...existing,
    activeUntil: parsed.activeUntil,
    updatedAt: now,
  };
  await database.fixedCosts.put(updated);
  return updated;
}

/** Entfernt ein gesetztes Kündigungsdatum (activeUntil). */
export async function reactivateFixedCost(
  id: ID,
  database: EngineDB = db,
  now: ISODate = todayISO(),
): Promise<FixedCost> {
  const existing = await database.fixedCosts.get(id);
  if (!existing) {
    throw new Error('Abo wurde nicht gefunden.');
  }
  const updated: FixedCost = {
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: now,
    ...(existing.archivedAt ? { archivedAt: existing.archivedAt } : {}),
    name: existing.name,
    amount: existing.amount,
    cycle: existing.cycle,
    dueDay: existing.dueDay,
    priority: existing.priority,
    category: existing.category,
    activeFrom: existing.activeFrom,
    ...(existing.projectId ? { projectId: existing.projectId } : {}),
  };
  await database.fixedCosts.put(updated);
  return updated;
}

/** Archiviert ein Abo statt es zu löschen (setzt archivedAt). */
export async function archiveFixedCost(
  id: ID,
  database: EngineDB = db,
  now: ISODate = todayISO(),
): Promise<FixedCost> {
  const existing = await database.fixedCosts.get(id);
  if (!existing) {
    throw new Error('Abo wurde nicht gefunden.');
  }
  const archived: FixedCost = {
    ...existing,
    archivedAt: now,
    updatedAt: now,
  };
  await database.fixedCosts.put(archived);
  return archived;
}

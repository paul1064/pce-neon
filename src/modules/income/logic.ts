import { z } from 'zod';
import {
  currentYearMonth,
  db,
  todayISO,
  toYearMonth,
  type Cents,
  type EngineDB,
  type ID,
  type ISODate,
  type IncomeEntry,
  type IncomeSource,
  type IncomeSourceKind,
  type YearMonth,
} from '../../core';

export const INCOME_SOURCE_KINDS: readonly IncomeSourceKind[] = [
  'project',
  'microtask',
  'recurring',
  'other',
] as const;

export const INCOME_SOURCE_KIND_LABELS: Record<IncomeSourceKind, string> = {
  project: 'Projekt',
  microtask: 'Micro-Task',
  recurring: 'Wiederkehrend',
  other: 'Sonstiges',
};

const hoursFormatter = new Intl.NumberFormat('de-AT', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Formatiert Stunden im de-AT-Format (z. B. "2,5 h"). */
export function formatHours(hours: number): string {
  return `${hoursFormatter.format(hours)} h`;
}

/** Prüft, ob ein YYYY-MM-DD-String ein echtes Kalenderdatum darstellt. */
function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
}

export const isoDateSchema = z
  .string()
  .refine(isValidISODate, 'Bitte ein gültiges Datum (JJJJ-MM-TT) wählen.');

export const incomeSourceKindSchema = z.enum([
  'project',
  'microtask',
  'recurring',
  'other',
]);

export const createIncomeSourceSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Bitte einen Namen für die Quelle eingeben.')
      .max(120, 'Der Name darf höchstens 120 Zeichen lang sein.'),
    kind: incomeSourceKindSchema,
    projectId: z.string().trim().min(1).optional(),
    platform: z
      .string()
      .trim()
      .max(120, 'Die Plattform darf höchstens 120 Zeichen lang sein.')
      .optional(),
    inWaterfall: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.kind === 'project' && !data.projectId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['projectId'],
        message: 'Bitte ein Projekt für diese Quelle auswählen.',
      });
    }
  });

export const updateIncomeSourceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Bitte einen Namen für die Quelle eingeben.')
    .max(120, 'Der Name darf höchstens 120 Zeichen lang sein.'),
  platform: z
    .string()
    .trim()
    .max(120, 'Die Plattform darf höchstens 120 Zeichen lang sein.')
    .optional(),
  inWaterfall: z.boolean(),
});

export const createIncomeEntrySchema = z.object({
  sourceId: z.string().trim().min(1, 'Bitte eine Einkommensquelle auswählen.'),
  amount: z
    .number()
    .int('Der Betrag muss in ganzen Cent angegeben sein.')
    .positive('Der Betrag muss größer als 0,00 € sein.'),
  receivedOn: isoDateSchema,
  hoursSpent: z
    .number()
    .positive('Die Arbeitszeit muss größer als 0 Stunden sein.')
    .max(10000, 'Die Arbeitszeit ist zu hoch.')
    .optional(),
  note: z
    .string()
    .trim()
    .max(500, 'Die Notiz darf höchstens 500 Zeichen lang sein.')
    .optional(),
});

export type CreateIncomeSourceInput = z.input<typeof createIncomeSourceSchema>;
export type UpdateIncomeSourceInput = z.input<typeof updateIncomeSourceSchema>;
export type CreateIncomeEntryInput = z.input<typeof createIncomeEntrySchema>;

export type HoursParseResult =
  | { ok: true; value: number | undefined }
  | { ok: false; error: string };

/** Parst optionale Stundenangaben (z. B. "2,5", "2.5", "4"). Leer -> undefined. */
export function parseHoursInput(raw: string): HoursParseResult {
  const cleaned = raw.trim();
  if (!cleaned) {
    return { ok: true, value: undefined };
  }
  const normalized = cleaned.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return {
      ok: false,
      error: 'Bitte eine gültige Stundenzahl eingeben (z. B. 2,5 oder 3).',
    };
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) {
    return {
      ok: false,
      error: 'Die Arbeitszeit muss größer als 0 Stunden sein.',
    };
  }
  return { ok: true, value: Math.round(value * 100) / 100 };
}

/** Standarddatum für das Buchungsformular passend zum ausgewählten Monat. */
export function defaultReceivedOnForMonth(
  month: YearMonth,
  now = new Date(),
): ISODate {
  return month === currentYearMonth(now) ? todayISO(now) : `${month}-01`;
}

/** Berechnet den Stundenlohn in ganzen Cent, oder null wenn keine Stunden erfasst sind. */
export function calculateHourlyRateCents(
  sumCents: Cents,
  totalHours: number,
): Cents | null {
  if (!Number.isFinite(totalHours) || totalHours <= 0) return null;
  return Math.round(sumCents / totalHours);
}

export interface MonthIncomeSummary {
  totalCents: Cents;
  waterfallCents: Cents;
  nonWaterfallCents: Cents;
  entryCount: number;
  totalHours: number;
  averageHourlyRateCents: Cents | null;
  hasExcludedSources: boolean;
}

/** Fasst alle Buchungen eines Monats inkl. Wasserfall-Anteil zusammen. */
export function summarizeMonthIncome(
  entries: IncomeEntry[],
  sources: IncomeSource[],
): MonthIncomeSummary {
  const waterfallSourceIds = new Set(
    sources.filter((s) => s.inWaterfall && !s.archivedAt).map((s) => s.id),
  );

  let totalCents = 0;
  let waterfallCents = 0;
  let totalHours = 0;

  for (const entry of entries) {
    totalCents += entry.amount;
    if (waterfallSourceIds.has(entry.sourceId)) {
      waterfallCents += entry.amount;
    }
    if (entry.hoursSpent && entry.hoursSpent > 0) {
      totalHours += entry.hoursSpent;
    }
  }

  const nonWaterfallCents = totalCents - waterfallCents;
  const roundedHours = Math.round(totalHours * 100) / 100;
  const hasExcludedSources =
    nonWaterfallCents > 0 ||
    sources.some((s) => !s.archivedAt && !s.inWaterfall);

  return {
    totalCents,
    waterfallCents,
    nonWaterfallCents,
    entryCount: entries.length,
    totalHours: roundedHours,
    averageHourlyRateCents: calculateHourlyRateCents(totalCents, roundedHours),
    hasExcludedSources,
  };
}

export interface SourceIncomeStat {
  sourceId: ID;
  sourceName: string;
  kind: IncomeSourceKind;
  platform?: string;
  inWaterfall: boolean;
  archived: boolean;
  totalCents: Cents;
  entryCount: number;
  totalHours: number;
  hourlyRateCents: Cents | null;
}

/** Aggregiert Einnahmen, Stunden und Stundenlohn pro Quelle. */
export function computeSourceStats(
  entries: IncomeEntry[],
  sources: IncomeSource[],
): SourceIncomeStat[] {
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const buckets = new Map<
    ID,
    { totalCents: Cents; entryCount: number; totalHours: number }
  >();

  for (const entry of entries) {
    const prev = buckets.get(entry.sourceId) ?? {
      totalCents: 0,
      entryCount: 0,
      totalHours: 0,
    };
    prev.totalCents += entry.amount;
    prev.entryCount += 1;
    if (entry.hoursSpent && entry.hoursSpent > 0) {
      prev.totalHours += entry.hoursSpent;
    }
    buckets.set(entry.sourceId, prev);
  }

  const stats: SourceIncomeStat[] = [];
  for (const [sourceId, agg] of buckets.entries()) {
    const source = sourceById.get(sourceId);
    const roundedHours = Math.round(agg.totalHours * 100) / 100;
    stats.push({
      sourceId,
      sourceName: source?.name ?? 'Unbekannte Quelle',
      kind: source?.kind ?? 'other',
      platform: source?.platform,
      inWaterfall: source?.inWaterfall ?? false,
      archived: Boolean(source?.archivedAt),
      totalCents: agg.totalCents,
      entryCount: agg.entryCount,
      totalHours: roundedHours,
      hourlyRateCents: calculateHourlyRateCents(agg.totalCents, roundedHours),
    });
  }

  return stats.sort(
    (a, b) =>
      b.totalCents - a.totalCents ||
      a.sourceName.localeCompare(b.sourceName, 'de-AT'),
  );
}

/** Sortiert Buchungen nach Eingangsdatum absteigend (neueste zuerst). */
export function sortEntriesNewestFirst(entries: IncomeEntry[]): IncomeEntry[] {
  return [...entries].sort(
    (a, b) =>
      b.receivedOn.localeCompare(a.receivedOn) ||
      b.createdAt.localeCompare(a.createdAt) ||
      b.id.localeCompare(a.id),
  );
}

// ── Datenbank-Operationen (nur incomeSources & incomeEntries) ───────────

export async function createIncomeSource(
  input: CreateIncomeSourceInput,
  database: EngineDB = db,
  now = new Date(),
): Promise<IncomeSource> {
  const parsed = createIncomeSourceSchema.parse({
    ...input,
    projectId: input.kind === 'project' ? input.projectId : undefined,
    platform: input.platform?.trim() ? input.platform.trim() : undefined,
  });

  const stamp = todayISO(now);
  const source: IncomeSource = {
    id: crypto.randomUUID(),
    createdAt: stamp,
    updatedAt: stamp,
    name: parsed.name,
    kind: parsed.kind,
    projectId: parsed.kind === 'project' ? parsed.projectId : undefined,
    platform: parsed.platform || undefined,
    inWaterfall: parsed.inWaterfall,
  };

  await database.incomeSources.add(source);
  return source;
}

export async function updateIncomeSource(
  id: ID,
  input: UpdateIncomeSourceInput,
  database: EngineDB = db,
  now = new Date(),
): Promise<IncomeSource> {
  const parsed = updateIncomeSourceSchema.parse({
    ...input,
    platform: input.platform?.trim() ? input.platform.trim() : undefined,
  });

  const existing = await database.incomeSources.get(id);
  if (!existing) {
    throw new Error('Einkommensquelle wurde nicht gefunden.');
  }

  const updated: IncomeSource = {
    ...existing,
    name: parsed.name,
    platform: parsed.platform || undefined,
    inWaterfall: parsed.inWaterfall,
    updatedAt: todayISO(now),
  };

  await database.incomeSources.put(updated);
  return updated;
}

export async function archiveIncomeSource(
  id: ID,
  database: EngineDB = db,
  now = new Date(),
): Promise<void> {
  const stamp = todayISO(now);
  await database.incomeSources.update(id, {
    archivedAt: stamp,
    updatedAt: stamp,
  });
}

export async function restoreIncomeSource(
  id: ID,
  database: EngineDB = db,
  now = new Date(),
): Promise<void> {
  await database.incomeSources.update(id, {
    archivedAt: undefined,
    updatedAt: todayISO(now),
  });
}

export async function createIncomeEntry(
  input: CreateIncomeEntryInput,
  database: EngineDB = db,
  now = new Date(),
): Promise<IncomeEntry> {
  const parsed = createIncomeEntrySchema.parse({
    ...input,
    note: input.note?.trim() ? input.note.trim() : undefined,
  });

  const source = await database.incomeSources.get(parsed.sourceId);
  if (!source) {
    throw new Error('Die gewählte Einkommensquelle existiert nicht.');
  }

  const stamp = todayISO(now);
  const entry: IncomeEntry = {
    id: crypto.randomUUID(),
    createdAt: stamp,
    updatedAt: stamp,
    sourceId: parsed.sourceId,
    amount: parsed.amount,
    receivedOn: parsed.receivedOn,
    month: toYearMonth(parsed.receivedOn),
    hoursSpent: parsed.hoursSpent,
    note: parsed.note || undefined,
  };

  await database.incomeEntries.add(entry);
  return entry;
}

/** Löscht eine Buchung dauerhaft aus incomeEntries (für Korrekturen/Abnahme). */
export async function deleteIncomeEntry(
  id: ID,
  database: EngineDB = db,
): Promise<void> {
  await database.incomeEntries.delete(id);
}

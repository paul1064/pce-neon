import {
  db,
  parseEuroToCents,
  todayISO,
  type BillingCycle,
  type Cents,
  type EngineDB,
  type FixedCost,
  type ISODate,
  type YearMonth,
} from '../../core';
import {
  fixedCostInputSchema,
  getNextPriority,
  previewMonthlyEquivalent,
  type FixedCostCategory,
  type FixedCostInput,
} from './logic';

export interface ParsedCsvRow {
  rowNumber: number;
  input: FixedCostInput;
  monthlyCents: Cents;
  isDuplicate: boolean;
  note?: string;
}

export interface SkippedCsvRow {
  rowNumber: number;
  rawName: string;
  reason: string;
}

export interface CsvImportPreview {
  delimiter: ',' | ';' | '\t';
  headerRowNumber: number;
  rows: ParsedCsvRow[];
  skipped: SkippedCsvRow[];
  error?: string;
}

const NAME_HEADERS = [
  'name',
  'abo',
  'bezeichnung',
  'vertrag',
  'anbieter',
  'dienst',
  'service',
  'titel',
  'beschreibung',
  'produkt',
  'subscription',
  'posten',
];

const MONTHLY_AMOUNT_HEADERS = [
  'betrag (€ / monat)',
  'betrag/monat',
  'monatsbetrag',
  'monatlich',
  '€/monat',
  'eur/monat',
  'monthly',
];

const GENERIC_AMOUNT_HEADERS = [
  'betrag',
  'preis',
  'kosten',
  'amount',
  'eur',
  'euro',
  'rate',
  'gebühr',
  'gebuehr',
  '€',
];

const YEARLY_AMOUNT_HEADERS = ['betrag (€ / jahr)', '€/jahr', 'eur/jahr', 'jahresbetrag', 'yearly'];

const CYCLE_HEADERS = [
  'zyklus',
  'intervall',
  'zahlungsintervall',
  'rhythmus',
  'abrechnung',
  'turnus',
  'cycle',
  'billing',
  'frequenz',
];

const DUE_DAY_HEADERS = ['fälligkeit', 'faelligkeit', 'fällig', 'tag', 'abbuchung', 'due', 'dueday'];

const PRIORITY_HEADERS = ['priorität', 'prioritaet', 'prio', 'priority', 'rang'];

const CATEGORY_HEADERS = ['kategorie', 'category', 'bereich', 'typ', 'gruppe'];

const STATUS_HEADERS = ['status', 'zustand', 'aktiv', 'state'];

const ACTIVE_UNTIL_HEADERS = ['gekündigt zum', 'gekuendigt zum', 'ende', 'bis', 'activeuntil', 'laufzeitende'];

const NOTE_HEADERS = ['anmerkung', 'notiz', 'kommentar', 'hinweis', 'note', 'zahlungsart', 'konto', 'bank'];

const SUMMARY_PREFIXES = ['gesamtsumme', 'gesamt', 'summe', 'zwischensumme', 'total'];

const INACTIVE_STATUS_TOKENS = [
  'gekündigt',
  'gekuendigt',
  'beendet',
  'inaktiv',
  'abgelaufen',
  'storniert',
  'pausiert',
  'cancelled',
  'canceled',
  'inactive',
  'ended',
  'paused',
];

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function matchesAny(header: string, candidates: string[]): boolean {
  const norm = normalizeHeader(header);
  if (!norm) return false;
  return candidates.some((candidate) => norm === candidate || norm.includes(candidate));
}

/** Erkennt das wahrscheinlichste Trennzeichen (Semikolon, Komma oder Tab). */
export function detectCsvDelimiter(text: string): ',' | ';' | '\t' {
  const sampleLines = text
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 20);

  const delimiters: Array<',' | ';' | '\t'> = [';', ',', '\t'];
  let best: ',' | ';' | '\t' = ',';
  let bestScore = -1;

  for (const delim of delimiters) {
    let score = 0;
    for (const line of sampleLines) {
      const cells = parseCsvLine(line, delim);
      if (cells.length >= 2) {
        score += cells.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = delim;
    }
  }

  return best;
}

/** Parst eine einzelne CSV-Zeile unter Berücksichtigung von Anführungszeichen. */
export function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** Parst gesamten CSV-Text in Zeilen-Arrays (RFC-4180-konform inkl. Zeilenumbrüchen in Quotes). */
export function parseCsvMatrix(rawText: string, delimiter: string): string[][] {
  const text = rawText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }

  return rows;
}

interface ColumnMap {
  nameIdx: number;
  amountIdx: number;
  amountIsMonthlyColumn: boolean;
  cycleIdx: number;
  dueDayIdx: number;
  priorityIdx: number;
  categoryIdx: number;
  statusIdx: number;
  activeUntilIdx: number;
  noteIdx: number;
}

function detectColumns(headerCells: string[]): ColumnMap | null {
  const nameIdx = headerCells.findIndex((h) => matchesAny(h, NAME_HEADERS));
  if (nameIdx < 0) return null;

  const monthlyAmountIdx = headerCells.findIndex(
    (h, idx) => idx !== nameIdx && matchesAny(h, MONTHLY_AMOUNT_HEADERS),
  );
  const genericAmountIdx = headerCells.findIndex(
    (h, idx) =>
      idx !== nameIdx &&
      !matchesAny(h, YEARLY_AMOUNT_HEADERS) &&
      matchesAny(h, GENERIC_AMOUNT_HEADERS),
  );
  const yearlyFallbackIdx = headerCells.findIndex(
    (h, idx) => idx !== nameIdx && matchesAny(h, YEARLY_AMOUNT_HEADERS),
  );

  const amountIdx =
    monthlyAmountIdx >= 0
      ? monthlyAmountIdx
      : genericAmountIdx >= 0
        ? genericAmountIdx
        : yearlyFallbackIdx;

  if (amountIdx < 0) return null;

  const cycleIdx = headerCells.findIndex(
    (h, idx) => idx !== nameIdx && idx !== amountIdx && matchesAny(h, CYCLE_HEADERS),
  );
  const dueDayIdx = headerCells.findIndex(
    (h, idx) => idx !== nameIdx && idx !== amountIdx && matchesAny(h, DUE_DAY_HEADERS),
  );
  const priorityIdx = headerCells.findIndex(
    (h, idx) => idx !== nameIdx && idx !== amountIdx && matchesAny(h, PRIORITY_HEADERS),
  );
  const categoryIdx = headerCells.findIndex(
    (h, idx) => idx !== nameIdx && idx !== amountIdx && matchesAny(h, CATEGORY_HEADERS),
  );
  const statusIdx = headerCells.findIndex(
    (h, idx) => idx !== nameIdx && idx !== amountIdx && matchesAny(h, STATUS_HEADERS),
  );
  const activeUntilIdx = headerCells.findIndex(
    (h, idx) => idx !== nameIdx && idx !== amountIdx && matchesAny(h, ACTIVE_UNTIL_HEADERS),
  );
  const noteIdx = headerCells.findIndex(
    (h, idx) => idx !== nameIdx && idx !== amountIdx && matchesAny(h, NOTE_HEADERS),
  );

  return {
    nameIdx,
    amountIdx,
    amountIsMonthlyColumn: monthlyAmountIdx >= 0,
    cycleIdx,
    dueDayIdx,
    priorityIdx,
    categoryIdx,
    statusIdx,
    activeUntilIdx,
    noteIdx,
  };
}

function parseCycle(raw: string | undefined, amountIsMonthlyColumn: boolean): BillingCycle {
  if (amountIsMonthlyColumn) {
    // Wenn die Betrags-Spalte explizit "€/Monat" ist, gilt der Betrag pro Monat.
    return 'monthly';
  }
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) return 'monthly';
  if (value.includes('jähr') || value.includes('jaehr') || value.includes('jahr') || value.includes('year') || value.includes('annual') || value === 'p.a.') {
    return 'yearly';
  }
  if (value.includes('quartal') || value.includes('viertelj') || value.includes('quarter') || value.includes('3 monat')) {
    return 'quarterly';
  }
  return 'monthly';
}

function parseDueDay(raw: string | undefined): number {
  if (!raw) return 1;
  const trimmed = raw.trim();
  if (!trimmed) return 1;

  // ISO-Datum YYYY-MM-DD -> Tag extrahieren
  const isoMatch = trimmed.match(/^\d{4}-\d{2}-(\d{2})$/);
  if (isoMatch) {
    const day = Number.parseInt(isoMatch[1] ?? '1', 10);
    return Math.min(28, Math.max(1, day));
  }

  // Deutsches Datum DD.MM.YYYY -> Tag extrahieren
  const deDateMatch = trimmed.match(/^(\d{1,2})\.\d{1,2}\.\d{2,4}$/);
  if (deDateMatch) {
    const day = Number.parseInt(deDateMatch[1] ?? '1', 10);
    return Math.min(28, Math.max(1, day));
  }

  // "1. des Monats", "ca. 5.", "am 15.", "15"
  const dayMatch = trimmed.match(/\b(\d{1,2})\b/);
  if (dayMatch) {
    const day = Number.parseInt(dayMatch[1] ?? '1', 10);
    if (day >= 1 && day <= 31) {
      return Math.min(28, day);
    }
  }
  return 1;
}

function parseCategory(rawCategory: string | undefined, name: string): FixedCostCategory {
  const combined = `${rawCategory ?? ''} ${name}`.toLowerCase();
  if (
    combined.includes('essential') ||
    combined.includes('wichtig') ||
    combined.includes('versicherung') ||
    combined.includes('mobilfunk') ||
    combined.includes('telefon') ||
    combined.includes('internet') ||
    combined.includes('kommunikation') ||
    combined.includes('spusu') ||
    combined.includes('miete') ||
    combined.includes('strom') ||
    combined.includes('konto') ||
    combined.includes('bank')
  ) {
    return 'essential';
  }
  if (
    combined.includes('comfort') ||
    combined.includes('komfort') ||
    combined.includes('streaming') ||
    combined.includes('alltag') ||
    combined.includes('konsum') ||
    combined.includes('tabak') ||
    combined.includes('freizeit') ||
    combined.includes('unterhaltung') ||
    combined.includes('netflix') ||
    combined.includes('prime') ||
    combined.includes('spotify')
  ) {
    return 'comfort';
  }
  return 'tool';
}

function parseActiveUntil(raw: string | undefined): YearMonth | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmed)) {
    return trimmed;
  }
  const isoMatch = trimmed.match(/^(\d{4})-(0[1-9]|1[0-2])-\d{2}$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}`;
  }
  const deMatch = trimmed.match(/^\d{1,2}\.(0?[1-9]|1[0-2])\.(\d{4})$/);
  if (deMatch) {
    const monthPart = (deMatch[1] ?? '01').padStart(2, '0');
    return `${deMatch[2]}-${monthPart}`;
  }
  return undefined;
}

function isSummaryRow(cells: string[]): boolean {
  return cells.some((cell) => {
    const norm = cell.trim().toLowerCase();
    return SUMMARY_PREFIXES.some((prefix) => norm.startsWith(prefix));
  });
}

function isNewSectionHeader(cells: string[]): boolean {
  const nonEmpty = cells.filter((c) => c.trim().length > 0);
  if (nonEmpty.length !== 1) return false;
  return /^\d+\.\s+\S+/.test(nonEmpty[0] ?? '');
}

/**
 * Parst eine Abo-CSV-Datei (z. B. Google-Sheets- oder Excel-Export)
 * in validierte FixedCost-Kandidaten inkl. Duplikat-Erkennung.
 */
export function parseFixedCostsCsv(
  rawText: string,
  defaultMonth: YearMonth,
  existingFixedCosts: FixedCost[] = [],
): CsvImportPreview {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      delimiter: ',',
      headerRowNumber: 0,
      rows: [],
      skipped: [],
      error: 'Die CSV-Datei ist leer.',
    };
  }

  const delimiter = detectCsvDelimiter(trimmed);
  const matrix = parseCsvMatrix(trimmed, delimiter);

  let headerIdx = -1;
  let columns: ColumnMap | null = null;
  const scanLimit = Math.min(matrix.length, 30);

  for (let i = 0; i < scanLimit; i += 1) {
    const candidate = detectColumns(matrix[i] ?? []);
    if (candidate) {
      headerIdx = i;
      columns = candidate;
      break;
    }
  }

  if (headerIdx < 0 || !columns) {
    return {
      delimiter,
      headerRowNumber: 0,
      rows: [],
      skipped: [],
      error:
        'Keine passenden Spalten gefunden. Erwartet werden mindestens Spalten für Name/Bezeichnung und Betrag/Preis.',
    };
  }

  const existingNames = new Set(
    existingFixedCosts.filter((fc) => !fc.archivedAt).map((fc) => normalizeName(fc.name)),
  );
  const seenInCsv = new Set<string>();
  let autoPriority = getNextPriority(existingFixedCosts);

  const rows: ParsedCsvRow[] = [];
  const skipped: SkippedCsvRow[] = [];
  let sawAnyDataRow = false;

  for (let i = headerIdx + 1; i < matrix.length; i += 1) {
    const cells = matrix[i] ?? [];
    const rowNumber = i + 1;
    const isEmptyRow = cells.every((c) => c.trim().length === 0);
    if (isEmptyRow) {
      continue;
    }

    // Bei mehrteiligen Finanz-Tabellen (z. B. Abschnitt "2. Einzelausgaben") sauber abbrechen
    if (sawAnyDataRow && isNewSectionHeader(cells)) {
      break;
    }

    if (isSummaryRow(cells)) {
      if (sawAnyDataRow) {
        // Nach einer Summenzeile folgen oft weitere Tabellenabschnitte -> stoppen
        break;
      }
      continue;
    }

    const rawName = (cells[columns.nameIdx] ?? '').trim();
    const rawAmount = (cells[columns.amountIdx] ?? '').trim();

    if (!rawName && !rawAmount) {
      continue;
    }

    sawAnyDataRow = true;

    if (!rawName) {
      skipped.push({ rowNumber, rawName: '(ohne Namen)', reason: 'Fehlender Abo-Name' });
      continue;
    }

    const rawStatus = columns.statusIdx >= 0 ? (cells[columns.statusIdx] ?? '').trim().toLowerCase() : '';
    if (rawStatus && INACTIVE_STATUS_TOKENS.some((tok) => rawStatus.includes(tok))) {
      skipped.push({ rowNumber, rawName, reason: `Status „${cells[columns.statusIdx]}“` });
      continue;
    }

    // Betrag parsen (auch negative Werte wie "-8,99 €" aus Kontoauszügen akzeptieren)
    const parsedCents = parseEuroToCents(rawAmount.replace(/EUR/gi, '').trim());
    const amountCents = parsedCents !== null ? Math.abs(parsedCents) : null;
    if (amountCents === null || amountCents <= 0) {
      skipped.push({
        rowNumber,
        rawName,
        reason: rawAmount ? `Ungültiger Betrag („${rawAmount}“)` : 'Kein Betrag angegeben',
      });
      continue;
    }

    const rawCycle = columns.cycleIdx >= 0 ? cells[columns.cycleIdx] : undefined;
    const cycle = parseCycle(rawCycle, columns.amountIsMonthlyColumn);
    const rawDue =
      columns.dueDayIdx >= 0
        ? cells[columns.dueDayIdx]
        : columns.cycleIdx >= 0
          ? cells[columns.cycleIdx]
          : undefined;
    const dueDay = parseDueDay(rawDue);

    const rawPriority = columns.priorityIdx >= 0 ? (cells[columns.priorityIdx] ?? '').trim() : '';
    const parsedPriority = rawPriority ? Number.parseInt(rawPriority, 10) : Number.NaN;
    const priority =
      Number.isInteger(parsedPriority) && parsedPriority >= 1 && parsedPriority <= 999
        ? parsedPriority
        : autoPriority++;

    const rawCategory = columns.categoryIdx >= 0 ? cells[columns.categoryIdx] : undefined;
    const category = parseCategory(rawCategory, rawName);
    const activeUntil =
      columns.activeUntilIdx >= 0 ? parseActiveUntil(cells[columns.activeUntilIdx]) : undefined;
    const note = columns.noteIdx >= 0 ? (cells[columns.noteIdx] ?? '').trim() || undefined : undefined;

    const candidate: FixedCostInput = {
      name: rawName.slice(0, 120),
      amount: amountCents,
      cycle,
      dueDay,
      priority,
      category,
      activeFrom: defaultMonth,
      ...(activeUntil && activeUntil >= defaultMonth ? { activeUntil } : {}),
    };

    const validation = fixedCostInputSchema.safeParse(candidate);
    if (!validation.success) {
      skipped.push({
        rowNumber,
        rawName,
        reason: validation.error.issues[0]?.message ?? 'Validierungsfehler',
      });
      continue;
    }

    const norm = normalizeName(validation.data.name);
    const isDuplicate = existingNames.has(norm) || seenInCsv.has(norm);
    seenInCsv.add(norm);

    rows.push({
      rowNumber,
      input: validation.data,
      monthlyCents: previewMonthlyEquivalent(validation.data.amount, validation.data.cycle),
      isDuplicate,
      note,
    });
  }

  return {
    delimiter,
    headerRowNumber: headerIdx + 1,
    rows,
    skipped,
  };
}

/** Validiert eine Auswahl geparster Abos mit Zod und speichert sie atomar in db.fixedCosts. */
export async function importFixedCostsBatch(
  inputs: FixedCostInput[],
  database: EngineDB = db,
  now: ISODate = todayISO(),
): Promise<FixedCost[]> {
  const validated = inputs.map((item) => fixedCostInputSchema.parse(item));
  if (validated.length === 0) {
    return [];
  }

  const entities: FixedCost[] = validated.map((parsed) => ({
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
  }));

  await database.transaction('rw', database.fixedCosts, async () => {
    await database.fixedCosts.bulkAdd(entities);
  });

  return entities;
}

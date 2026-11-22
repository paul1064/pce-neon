// core/db.ts — eine Dexie-Version pro Ausbaustufe
import Dexie, { type Table } from 'dexie';
import type {
  Cents, Debt, DebtPayment, EngineSettings, FixedCost, Idea, IncomeEntry, IncomeSource, MonthClose, Project, YearMonth,
} from './model';
import type { WaterfallInput } from './waterfall';

export class EngineDB extends Dexie {
  ideas!: Table<Idea, string>;
  projects!: Table<Project, string>;
  settings!: Table<EngineSettings, string>;
  incomeSources!: Table<IncomeSource, string>;
  incomeEntries!: Table<IncomeEntry, string>;
  fixedCosts!: Table<FixedCost, string>;
  debts!: Table<Debt, string>;
  debtPayments!: Table<DebtPayment, string>;
  monthCloses!: Table<MonthClose, string>;

  constructor(name = 'cashflow-engine', upTo = 4) {
    super(name);
    // Stufe 1: Ideen-Sammler
    this.version(1).stores({ ideas: 'id, status, updatedAt', projects: 'id, status, ideaId', settings: 'id' });
    // Stufe 2: Einkommens-Tracker
    if (upTo >= 2) this.version(2).stores({ incomeSources: 'id, kind, projectId', incomeEntries: 'id, sourceId, month' });
    // Stufe 3: Abo-Gegenfinanzierer
    if (upTo >= 3) this.version(3).stores({ fixedCosts: 'id, priority, projectId' });
    // Stufe 4: Schuldentilger
    if (upTo >= 4) this.version(4).stores({ debts: 'id, status', debtPayments: 'id, debtId, month', monthCloses: 'id, &month' });
  }
}

export const monthlyEquivalent = (fc: FixedCost): Cents =>
  fc.cycle === 'monthly' ? fc.amount : Math.ceil(fc.amount / (fc.cycle === 'quarterly' ? 3 : 12));

const isActive = (fc: FixedCost, month: YearMonth): boolean =>
  !fc.archivedAt && fc.activeFrom <= month && (!fc.activeUntil || month <= fc.activeUntil);

const has = (db: EngineDB, table: string): boolean => db.tables.some((t) => t.name === table);

// Der einzige Ort, an dem Tabellen zu Wasserfall-Eingaben werden.
// Fehlt eine Tabelle (Modul noch nicht gebaut), liefert sie eine leere Liste.
export async function loadWaterfallInput(db: EngineDB, month: YearMonth): Promise<WaterfallInput> {
  const settings = await db.settings.get('settings');
  const sources = has(db, 'incomeSources') ? await db.incomeSources.toArray() : [];
  const counted = new Set(sources.filter((s) => s.inWaterfall && !s.archivedAt).map((s) => s.id));
  const entries = has(db, 'incomeEntries') ? await db.incomeEntries.where('month').equals(month).toArray() : [];
  const costs = has(db, 'fixedCosts') ? await db.fixedCosts.toArray() : [];
  const debts = has(db, 'debts') ? await db.debts.where('status').equals('open').toArray() : [];
  return {
    month,
    incomes: entries.filter((e) => counted.has(e.sourceId)).map((e) => ({ id: e.id, amount: e.amount })),
    fixedCosts: costs.filter((fc) => isActive(fc, month)).map((fc) => ({ id: fc.id, monthlyAmount: monthlyEquivalent(fc), priority: fc.priority })),
    debts: debts.map((d) => ({ id: d.id, balance: d.balance, aprBps: d.aprBps, minPayment: d.minPayment })),
    strategy: settings?.debtStrategy ?? 'avalanche',
    buffer: settings?.buffer ?? 0,
  };
}

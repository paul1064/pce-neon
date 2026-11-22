// core/waterfall.ts — reine Funktionen, keine Imports aus React oder Dexie
import type { Cents, DebtStrategy, ID, YearMonth } from './model';

export interface WaterfallInput {
  month: YearMonth;
  incomes: { id: ID; amount: Cents }[];
  fixedCosts: { id: ID; monthlyAmount: Cents; priority: number }[];
  debts: { id: ID; balance: Cents; aprBps: number; minPayment: Cents }[];
  strategy: DebtStrategy;
  buffer: Cents;
}

export interface WaterfallResult {
  month: YearMonth;
  totalIncome: Cents;
  fixedCosts: { id: ID; due: Cents; covered: Cents }[];
  fixedCostsDue: Cents;
  fixedCostsCovered: Cents;
  fixedCostGap: Cents;             // > 0: Einnahmen decken die Fixkosten nicht
  surplus: Cents;                  // Rest nach Fixkosten = Andockpunkt für Modul 4
  debtPayments: { debtId: ID; minimum: Cents; extra: Cents; balanceAfter: Cents }[];
  minimumGap: Cents;               // > 0: Mindestraten nicht voll gedeckt
  bufferHeld: Cents;
  totalToDebt: Cents;
  unallocated: Cents;              // bleibt nur übrig, wenn alle Schulden getilgt sind
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

export function runWaterfall(input: WaterfallInput): WaterfallResult {
  // Stufe 0: alle Einnahmen des Monats in einen Topf
  const totalIncome = sum(input.incomes.map((i) => i.amount));
  let pool = totalIncome;
  const take = (wanted: Cents): Cents => {
    const got = Math.max(0, Math.min(pool, wanted));
    pool -= got;
    return got;
  };

  // Stufe 1: Fixkosten nach Priorität, bei Gleichstand das günstigere zuerst
  const fixedCosts = [...input.fixedCosts]
    .sort((a, b) => a.priority - b.priority || a.monthlyAmount - b.monthlyAmount || a.id.localeCompare(b.id))
    .map((fc) => ({ id: fc.id, due: fc.monthlyAmount, covered: take(fc.monthlyAmount) }));
  const fixedCostsDue = sum(fixedCosts.map((f) => f.due));
  const fixedCostsCovered = sum(fixedCosts.map((f) => f.covered));
  const surplus = pool;

  // Reihenfolge der Schulden: Schneeball = kleinster Saldo, Lawine = höchster Zins
  type D = WaterfallInput['debts'][number];
  const bySnowball = (a: D, b: D) => a.balance - b.balance || b.aprBps - a.aprBps || a.id.localeCompare(b.id);
  const byAvalanche = (a: D, b: D) => b.aprBps - a.aprBps || a.balance - b.balance || a.id.localeCompare(b.id);
  const ordered = input.debts
    .filter((d) => d.balance > 0)
    .sort(input.strategy === 'snowball' ? bySnowball : byAvalanche);

  // Stufe 2: Mindestraten aller offenen Schulden
  const plan = ordered.map((d) => {
    const due = Math.min(d.minPayment, d.balance);
    const minimum = take(due);
    return { debtId: d.id, due, minimum, extra: 0, balanceAfter: d.balance - minimum };
  });
  const minimumGap = sum(plan.map((p) => p.due - p.minimum));

  // Stufe 3: optionale Rücklage
  const bufferHeld = take(input.buffer);

  // Stufe 4: der gesamte Rest als Extra-Tilgung; ist die Zielschuld getilgt,
  // fließt der Rest im selben Monat in die nächste (Kaskade)
  for (const p of plan) {
    p.extra = take(p.balanceAfter);
    p.balanceAfter -= p.extra;
  }

  return {
    month: input.month,
    totalIncome,
    fixedCosts,
    fixedCostsDue,
    fixedCostsCovered,
    fixedCostGap: fixedCostsDue - fixedCostsCovered,
    surplus,
    debtPayments: plan.map(({ debtId, minimum, extra, balanceAfter }) => ({ debtId, minimum, extra, balanceAfter })),
    minimumGap,
    bufferHeld,
    totalToDebt: sum(plan.map((p) => p.minimum + p.extra)),
    unallocated: pool,
  };
}

// Monatszins auf den Saldo, kaufmännisch auf ganze Cent gerundet
export const monthlyInterest = (balance: Cents, aprBps: number): Cents =>
  Math.round((balance * aprBps) / 120000);

export const nextMonth = (ym: YearMonth): YearMonth => {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

// Prognose: denselben Monat wiederholen, bis alle Schulden getilgt sind
export function simulatePayoff(base: WaterfallInput, maxMonths = 600) {
  let debts = base.debts.map((d) => ({ ...d }));
  let month = base.month;
  let interestPaid = 0;
  for (let n = 1; n <= maxMonths; n++) {
    debts = debts.map((d) => {
      const interest = monthlyInterest(d.balance, d.aprBps);
      interestPaid += interest;
      return { ...d, balance: d.balance + interest };
    });
    const r = runWaterfall({ ...base, month, debts });
    debts = debts.map((d) => ({ ...d, balance: r.debtPayments.find((p) => p.debtId === d.id)?.balanceAfter ?? 0 }));
    if (debts.every((d) => d.balance === 0)) return { months: n, debtFreeIn: month, interestPaid };
    if (r.totalToDebt === 0) return null;        // kein Überschuss: keine Prognose möglich
    month = nextMonth(month);
  }
  return null;
}

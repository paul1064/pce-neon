import { describe, expect, it } from 'vitest';
import { monthlyInterest, nextMonth, runWaterfall, simulatePayoff, type WaterfallInput } from './waterfall';

// Alle Werte in Cent. Diese Erwartungen sind verbindlich und werden nicht angepasst.
const base: WaterfallInput = {
  month: '2026-12',
  incomes: [{ id: 'i1', amount: 38000 }, { id: 'i2', amount: 24000 }],
  fixedCosts: [
    { id: 'toolA', monthlyAmount: 2000, priority: 1 },
    { id: 'toolB', monthlyAmount: 1299, priority: 2 },
    { id: 'stream', monthlyAmount: 999, priority: 3 },
  ],
  debts: [
    { id: 'A', balance: 30000, aprBps: 0, minPayment: 2500 },
    { id: 'B', balance: 180000, aprBps: 1250, minPayment: 5000 },
    { id: 'C', balance: 95000, aprBps: 600, minPayment: 3000 },
  ],
  strategy: 'snowball',
  buffer: 0,
};
const conserved = (r: ReturnType<typeof runWaterfall>) =>
  r.fixedCostsCovered + r.totalToDebt + r.bufferHeld + r.unallocated === r.totalIncome;

describe('runWaterfall', () => {
  it('Rechenbeispiel Schneeball', () => {
    const r = runWaterfall(base);
    expect(r.totalIncome).toBe(62000);
    expect(r.fixedCostsCovered).toBe(4298);
    expect(r.surplus).toBe(57702);
    expect(r.debtPayments).toEqual([
      { debtId: 'A', minimum: 2500, extra: 27500, balanceAfter: 0 },
      { debtId: 'C', minimum: 3000, extra: 19702, balanceAfter: 72298 },
      { debtId: 'B', minimum: 5000, extra: 0, balanceAfter: 175000 },
    ]);
    expect(r.unallocated).toBe(0);
    expect(conserved(r)).toBe(true);
  });

  it('Rechenbeispiel Lawine', () => {
    const r = runWaterfall({ ...base, strategy: 'avalanche' });
    expect(r.debtPayments).toEqual([
      { debtId: 'B', minimum: 5000, extra: 47202, balanceAfter: 127798 },
      { debtId: 'C', minimum: 3000, extra: 0, balanceAfter: 92000 },
      { debtId: 'A', minimum: 2500, extra: 0, balanceAfter: 27500 },
    ]);
    expect(conserved(r)).toBe(true);
  });

  it('Unterdeckung: nichts fließt in Schulden, Lücken werden ausgewiesen', () => {
    const r = runWaterfall({ ...base, incomes: [{ id: 'i', amount: 2500 }] });
    expect(r.fixedCosts.map((f) => f.covered)).toEqual([2000, 500, 0]);
    expect(r.fixedCostGap).toBe(1798);
    expect(r.totalToDebt).toBe(0);
    expect(r.minimumGap).toBe(10500);
  });

  it('läuft ohne Schulden und ohne Fixkosten (frühe Ausbaustufen)', () => {
    expect(runWaterfall({ ...base, debts: [] }).unallocated).toBe(57702);
    expect(runWaterfall({ ...base, debts: [], fixedCosts: [] }).unallocated).toBe(62000);
  });

  it('Puffer wird vor der Extra-Tilgung gehalten', () => {
    const r = runWaterfall({ ...base, buffer: 10000 });
    expect(r.bufferHeld).toBe(10000);
    expect(r.totalToDebt).toBe(47702);
    expect(conserved(r)).toBe(true);
  });

  it('kein Saldo wird negativ', () => {
    const r = runWaterfall({ ...base, incomes: [{ id: 'i', amount: 1000000 }] });
    expect(r.debtPayments.every((p) => p.balanceAfter === 0)).toBe(true);
    expect(r.unallocated).toBe(1000000 - 4298 - 305000);
  });
});

describe('Prognose', () => {
  it('Hilfsfunktionen', () => {
    expect(nextMonth('2026-12')).toBe('2027-01');
    expect(monthlyInterest(180000, 1250)).toBe(1875);
  });
  it('beide Strategien: 6 Monate, Lawine kostet weniger Zinsen', () => {
    expect(simulatePayoff(base)).toEqual({ months: 6, debtFreeIn: '2027-05', interestPaid: 9027 });
    expect(simulatePayoff({ ...base, strategy: 'avalanche' })).toEqual({ months: 6, debtFreeIn: '2027-05', interestPaid: 6486 });
  });
  it('ohne Überschuss keine Prognose', () => {
    expect(simulatePayoff({ ...base, incomes: [] })).toBeNull();
  });
});

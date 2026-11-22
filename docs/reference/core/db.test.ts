import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { EngineDB, loadWaterfallInput } from './db';
import { runWaterfall } from './waterfall';

const b = { createdAt: '2026-12-01', updatedAt: '2026-12-01' };

it('Stufen docken an: Daten aus Version 1 überleben Version 4', async () => {
  const v1 = new EngineDB('t-upgrade', 1);
  await v1.open();
  await v1.ideas.add({ ...b, id: 'idea1', title: 'Test', description: '', tags: [], status: 'inbox', checks: [] });
  const empty = await loadWaterfallInput(v1, '2026-12');
  expect([empty.incomes, empty.fixedCosts, empty.debts]).toEqual([[], [], []]);
  v1.close();

  const v4 = new EngineDB('t-upgrade', 4);
  await v4.open();
  expect((await v4.ideas.get('idea1'))?.title).toBe('Test');
  expect(v4.tables.map((t) => t.name).sort()).toEqual(
    ['debtPayments', 'debts', 'fixedCosts', 'ideas', 'incomeEntries', 'incomeSources', 'monthCloses', 'projects', 'settings']);
  v4.close();
});

it('loadWaterfallInput filtert Monat, Quellen, gekündigte Abos, bezahlte Schulden', async () => {
  const db = new EngineDB('t-input', 4);
  await db.open();
  await db.incomeSources.bulkAdd([
    { ...b, id: 's1', name: 'Shop', kind: 'project', inWaterfall: true },
    { ...b, id: 's2', name: 'Privat', kind: 'other', inWaterfall: false },
  ]);
  await db.incomeEntries.bulkAdd([
    { ...b, id: 'e1', sourceId: 's1', amount: 5000, receivedOn: '2026-12-03', month: '2026-12' },
    { ...b, id: 'e2', sourceId: 's2', amount: 9999, receivedOn: '2026-12-04', month: '2026-12' },
    { ...b, id: 'e3', sourceId: 's1', amount: 700, receivedOn: '2026-11-30', month: '2026-11' },
  ]);
  await db.fixedCosts.bulkAdd([
    { ...b, id: 'f1', name: 'Jahresabo', amount: 11999, cycle: 'yearly', dueDay: 1, priority: 1, category: 'tool', activeFrom: '2026-01' },
    { ...b, id: 'f2', name: 'gekündigt', amount: 999, cycle: 'monthly', dueDay: 1, priority: 2, category: 'comfort', activeFrom: '2026-01', activeUntil: '2026-11' },
  ]);
  await db.debts.bulkAdd([
    { ...b, id: 'd1', name: 'offen', originalAmount: 10000, balance: 8000, aprBps: 500, minPayment: 1000, status: 'open' },
    { ...b, id: 'd2', name: 'bezahlt', originalAmount: 10000, balance: 0, aprBps: 500, minPayment: 1000, status: 'paid' },
  ]);
  const input = await loadWaterfallInput(db, '2026-12');
  expect(input.incomes).toEqual([{ id: 'e1', amount: 5000 }]);
  expect(input.fixedCosts).toEqual([{ id: 'f1', monthlyAmount: 1000, priority: 1 }]);
  expect(input.debts).toHaveLength(1);
  const r = runWaterfall(input);
  expect([r.fixedCostsCovered, r.totalToDebt, r.debtPayments[0].balanceAfter]).toEqual([1000, 4000, 4000]);
  db.close();
});

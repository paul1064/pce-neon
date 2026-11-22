import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EngineDB,
  loadWaterfallInput,
  runWaterfall,
  type IncomeEntry,
  type IncomeSource,
} from '../../core';
import {
  archiveFixedCost,
  cancelFixedCost,
  createFixedCost,
  fixedCostInputSchema,
  getInactiveFixedCostsForMonth,
  getNextPriority,
  previewMonthlyEquivalent,
  reactivateFixedCost,
  summarizeFixedCostCoverage,
  updateFixedCost,
} from './logic';

const createdDbs: EngineDB[] = [];

async function openTestDb(name: string): Promise<EngineDB> {
  const testDb = new EngineDB(`${name}-${crypto.randomUUID()}`, 4);
  await testDb.open();
  createdDbs.push(testDb);
  return testDb;
}

afterEach(async () => {
  while (createdDbs.length > 0) {
    const instance = createdDbs.pop();
    if (instance) {
      await instance.delete();
    }
  }
});

async function seedIncome(
  testDb: EngineDB,
  month: string,
  amounts: number[],
): Promise<void> {
  const source: IncomeSource = {
    id: crypto.randomUUID(),
    createdAt: `${month}-01`,
    updatedAt: `${month}-01`,
    name: 'Testquelle',
    kind: 'microtask',
    inWaterfall: true,
  };
  await testDb.incomeSources.add(source);

  const entries: IncomeEntry[] = amounts.map((amount, idx) => ({
    id: crypto.randomUUID(),
    createdAt: `${month}-0${idx + 1}`,
    updatedAt: `${month}-0${idx + 1}`,
    sourceId: source.id,
    amount,
    receivedOn: `${month}-0${idx + 1}`,
    month,
  }));
  await testDb.incomeEntries.bulkAdd(entries);
}

describe('Modul 3 · Abo-Gegenfinanzierer', () => {
  it('Rechenbeispiel: 20,00 / 12,99 / 9,99 bei 620,00 € -> 3 von 3 gedeckt & 577,02 € Überschuss', async () => {
    const testDb = await openTestDb('fc-example');
    const month = '2026-11';
    await seedIncome(testDb, month, [38000, 24000]);

    const abo1 = await createFixedCost(
      {
        name: 'Tool A',
        amount: 2000,
        cycle: 'monthly',
        dueDay: 1,
        priority: 1,
        category: 'essential',
        activeFrom: month,
      },
      testDb,
      '2026-11-01',
    );
    const abo2 = await createFixedCost(
      {
        name: 'Tool B',
        amount: 1299,
        cycle: 'monthly',
        dueDay: 5,
        priority: 2,
        category: 'tool',
        activeFrom: month,
      },
      testDb,
      '2026-11-01',
    );
    const abo3 = await createFixedCost(
      {
        name: 'Streaming',
        amount: 999,
        cycle: 'monthly',
        dueDay: 15,
        priority: 3,
        category: 'comfort',
        activeFrom: month,
      },
      testDb,
      '2026-11-01',
    );

    const input = await loadWaterfallInput(testDb, month);
    const result = runWaterfall(input);
    const allFixedCosts = await testDb.fixedCosts.toArray();
    const summary = summarizeFixedCostCoverage(result, allFixedCosts);

    expect(result.totalIncome).toBe(62000);
    expect(result.fixedCostsDue).toBe(4298);
    expect(result.fixedCostsCovered).toBe(4298);
    expect(result.fixedCostGap).toBe(0);
    expect(result.surplus).toBe(57702);

    expect(summary.coveredCount).toBe(3);
    expect(summary.totalCount).toBe(3);
    expect(summary.nextUncovered).toBeNull();
    expect(summary.items.map((i) => i.id)).toEqual([abo1.id, abo2.id, abo3.id]);
    expect(summary.items.every((i) => i.status === 'covered' && i.missing === 0)).toBe(true);
  });

  it('Unterdeckung: 25,00 € Einnahmen -> Lücke 17,98 € & nächstes ungedecktes Abo braucht 7,99 €', async () => {
    const testDb = await openTestDb('fc-shortfall');
    const month = '2026-12';
    await seedIncome(testDb, month, [2500]);

    await createFixedCost(
      {
        name: 'Tool A',
        amount: 2000,
        cycle: 'monthly',
        dueDay: 1,
        priority: 1,
        category: 'essential',
        activeFrom: month,
      },
      testDb,
      '2026-12-01',
    );
    const toolB = await createFixedCost(
      {
        name: 'Tool B',
        amount: 1299,
        cycle: 'monthly',
        dueDay: 5,
        priority: 2,
        category: 'tool',
        activeFrom: month,
      },
      testDb,
      '2026-12-01',
    );
    const streaming = await createFixedCost(
      {
        name: 'Streaming',
        amount: 999,
        cycle: 'monthly',
        dueDay: 15,
        priority: 3,
        category: 'comfort',
        activeFrom: month,
      },
      testDb,
      '2026-12-01',
    );

    const input = await loadWaterfallInput(testDb, month);
    const result = runWaterfall(input);
    const allFixedCosts = await testDb.fixedCosts.toArray();
    const summary = summarizeFixedCostCoverage(result, allFixedCosts);

    expect(result.totalIncome).toBe(2500);
    expect(result.fixedCostsDue).toBe(4298);
    expect(result.fixedCostsCovered).toBe(2500);
    expect(result.fixedCostGap).toBe(1798);
    expect(result.surplus).toBe(0);

    expect(summary.coveredCount).toBe(1);
    expect(summary.totalCount).toBe(3);

    expect(summary.nextUncovered).not.toBeNull();
    expect(summary.nextUncovered?.id).toBe(toolB.id);
    expect(summary.nextUncovered?.fixedCost?.name).toBe('Tool B');
    expect(summary.nextUncovered?.covered).toBe(500);
    expect(summary.nextUncovered?.missing).toBe(799);
    expect(summary.nextUncovered?.status).toBe('partial');

    const third = summary.items.find((item) => item.id === streaming.id);
    expect(third?.covered).toBe(0);
    expect(third?.missing).toBe(999);
    expect(third?.status).toBe('uncovered');
  });

  it('Jahresabo- und Quartalsabo-Monatsanteil wird korrekt aufgerundet berechnet', async () => {
    expect(previewMonthlyEquivalent(11999, 'yearly')).toBe(1000);
    expect(previewMonthlyEquivalent(12000, 'yearly')).toBe(1000);
    expect(previewMonthlyEquivalent(12001, 'yearly')).toBe(1001);
    expect(previewMonthlyEquivalent(2999, 'quarterly')).toBe(1000);
    expect(previewMonthlyEquivalent(999, 'monthly')).toBe(999);

    const testDb = await openTestDb('fc-yearly');
    const month = '2026-11';
    await seedIncome(testDb, month, [1500]);

    await createFixedCost(
      {
        name: 'Domain & Hosting',
        amount: 11999,
        cycle: 'yearly',
        dueDay: 1,
        priority: 1,
        category: 'tool',
        activeFrom: '2026-01',
      },
      testDb,
      '2026-11-01',
    );

    const input = await loadWaterfallInput(testDb, month);
    const result = runWaterfall(input);

    expect(input.fixedCosts).toHaveLength(1);
    expect(input.fixedCosts[0]?.monthlyAmount).toBe(1000);
    expect(result.fixedCostsDue).toBe(1000);
    expect(result.fixedCostsCovered).toBe(1000);
    expect(result.surplus).toBe(500);
  });

  it('Zod-Validierung lehnt ungültige Eingaben sauber ab', () => {
    const validBase = {
      name: 'Cloud-Speicher',
      amount: 999,
      cycle: 'monthly' as const,
      dueDay: 10,
      priority: 1,
      category: 'tool' as const,
      activeFrom: '2026-11',
    };

    expect(fixedCostInputSchema.safeParse(validBase).success).toBe(true);
    expect(fixedCostInputSchema.safeParse({ ...validBase, name: '   ' }).success).toBe(false);
    expect(fixedCostInputSchema.safeParse({ ...validBase, amount: 0 }).success).toBe(false);
    expect(fixedCostInputSchema.safeParse({ ...validBase, amount: -100 }).success).toBe(false);
    expect(fixedCostInputSchema.safeParse({ ...validBase, dueDay: 0 }).success).toBe(false);
    expect(fixedCostInputSchema.safeParse({ ...validBase, dueDay: 29 }).success).toBe(false);
    expect(fixedCostInputSchema.safeParse({ ...validBase, priority: 0 }).success).toBe(false);
    expect(
      fixedCostInputSchema.safeParse({ ...validBase, activeFrom: '2026-11', activeUntil: '2026-10' })
        .success,
    ).toBe(false);
    expect(
      fixedCostInputSchema.safeParse({ ...validBase, activeFrom: '2026-11', activeUntil: '2026-11' })
        .success,
    ).toBe(true);
  });

  it('CRUD: Bearbeiten, Kündigen, Fortführen, Archivieren und Inaktiv-Filterung funktionieren korrekt', async () => {
    const testDb = await openTestDb('fc-crud');

    const first = await createFixedCost(
      {
        name: 'Design-Tool',
        amount: 1500,
        cycle: 'monthly',
        dueDay: 3,
        priority: 1,
        category: 'tool',
        activeFrom: '2026-10',
      },
      testDb,
      '2026-10-01',
    );

    const future = await createFixedCost(
      {
        name: 'Zukunfts-Abo',
        amount: 2500,
        cycle: 'monthly',
        dueDay: 1,
        priority: 2,
        category: 'comfort',
        activeFrom: '2027-01',
      },
      testDb,
      '2026-10-01',
    );

    expect(getNextPriority(await testDb.fixedCosts.toArray())).toBe(3);

    // Bearbeiten
    const updated = await updateFixedCost(
      first.id,
      {
        name: 'Design-Tool Pro',
        amount: 1999,
        cycle: 'monthly',
        dueDay: 4,
        priority: 1,
        category: 'tool',
        activeFrom: '2026-10',
      },
      testDb,
      '2026-10-15',
    );
    expect(updated.name).toBe('Design-Tool Pro');
    expect(updated.amount).toBe(1999);

    // Kündigen zum Oktober -> im November nicht mehr aktiv
    await cancelFixedCost(first.id, '2026-10', testDb, '2026-10-20');
    const novInput = await loadWaterfallInput(testDb, '2026-11');
    expect(novInput.fixedCosts).toHaveLength(0);

    const inactiveNov = getInactiveFixedCostsForMonth(await testDb.fixedCosts.toArray(), '2026-11');
    expect(inactiveNov).toHaveLength(2);
    expect(inactiveNov.find((x) => x.fixedCost.id === first.id)?.reason).toBe('ended');
    expect(inactiveNov.find((x) => x.fixedCost.id === future.id)?.reason).toBe('future');

    // Kündigung aufheben -> im November wieder aktiv
    await reactivateFixedCost(first.id, testDb, '2026-11-01');
    const novInputAfterReactivate = await loadWaterfallInput(testDb, '2026-11');
    expect(novInputAfterReactivate.fixedCosts).toHaveLength(1);
    expect(novInputAfterReactivate.fixedCosts[0]?.id).toBe(first.id);

    // Archivieren -> weder aktiv noch inaktiv gelistet, Priorität 1 wieder frei
    await archiveFixedCost(first.id, testDb, '2026-11-05');
    const afterArchive = await testDb.fixedCosts.toArray();
    expect(afterArchive.find((x) => x.id === first.id)?.archivedAt).toBe('2026-11-05');
    expect((await loadWaterfallInput(testDb, '2026-11')).fixedCosts).toHaveLength(0);
    expect(getNextPriority(afterArchive)).toBe(1);
  });
});

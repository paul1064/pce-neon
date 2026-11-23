import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { EngineDB, loadWaterfallInput, runWaterfall } from '../core';
import { loadDemoData } from './demoData';

describe('loadDemoData', () => {
  it('legt das Rechenbeispiel mit 620 € Einnahmen, 3 Abos und 3 Schulden an', async () => {
    const db = new EngineDB('t-demo-data', 4);
    await db.open();

    await loadDemoData(db, '2026-11');

    expect(await db.ideas.count()).toBe(2);
    expect(await db.projects.count()).toBe(1);
    expect(await db.incomeSources.count()).toBe(2);
    expect(await db.incomeEntries.count()).toBe(2);
    expect(await db.fixedCosts.count()).toBe(3);
    expect(await db.debts.count()).toBe(3);

    const input = await loadWaterfallInput(db, '2026-11');
    const result = runWaterfall(input);
    expect(result.totalIncome).toBe(62000);
    expect(result.fixedCostsCovered).toBe(4298);
    expect(result.surplus).toBe(57702);
    expect(result.totalToDebt).toBe(57702);

    db.close();
  });
});

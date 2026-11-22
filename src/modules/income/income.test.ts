import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { EngineDB, loadWaterfallInput } from '../../core';
import {
  archiveIncomeSource,
  calculateHourlyRateCents,
  computeSourceStats,
  createIncomeEntry,
  createIncomeSource,
  defaultReceivedOnForMonth,
  deleteIncomeEntry,
  parseHoursInput,
  restoreIncomeSource,
  sortEntriesNewestFirst,
  summarizeMonthIncome,
  updateIncomeSource,
} from './logic';

const openDbs: EngineDB[] = [];

async function makeTestDb(suffix: string): Promise<EngineDB> {
  const db = new EngineDB(`income-test-${suffix}-${crypto.randomUUID()}`, 4);
  await db.open();
  openDbs.push(db);
  return db;
}

afterEach(async () => {
  while (openDbs.length > 0) {
    const db = openDbs.pop();
    if (db) {
      db.close();
      await db.delete();
    }
  }
});

describe('Modul 2 · Einkommens-Tracker (Quellen & Buchungen)', () => {
  it('legt Quellen auch ohne vorhandene Projekte an (Micro-Task, Wiederkehrend, Sonstiges)', async () => {
    const db = await makeTestDb('no-projects');

    const micro = await createIncomeSource(
      {
        name: 'Umfragen',
        kind: 'microtask',
        platform: ' Prolific ',
        inWaterfall: true,
      },
      db,
    );
    const other = await createIncomeSource(
      {
        name: 'Privatverkauf',
        kind: 'other',
        inWaterfall: false,
      },
      db,
    );

    expect(micro.name).toBe('Umfragen');
    expect(micro.kind).toBe('microtask');
    expect(micro.projectId).toBeUndefined();
    expect(micro.platform).toBe('Prolific');
    expect(micro.inWaterfall).toBe(true);

    expect(other.inWaterfall).toBe(false);
    expect(await db.incomeSources.count()).toBe(2);
  });

  it('verlangt projectId bei Typ Projekt und legt Projekt-Quelle korrekt an', async () => {
    const db = await makeTestDb('project-source');

    await expect(
      createIncomeSource(
        { name: 'Shop', kind: 'project', inWaterfall: true },
        db,
      ),
    ).rejects.toThrow();

    const projectSource = await createIncomeSource(
      {
        name: 'Shop',
        kind: 'project',
        projectId: 'proj-123',
        platform: 'Etsy',
        inWaterfall: true,
      },
      db,
    );

    expect(projectSource.kind).toBe('project');
    expect(projectSource.projectId).toBe('proj-123');
    expect(projectSource.platform).toBe('Etsy');
  });

  it('bearbeitet, archiviert und stellt eine Quelle wieder her', async () => {
    const db = await makeTestDb('edit-archive');
    const created = await createIncomeSource(
      { name: 'Alt', kind: 'recurring', inWaterfall: true },
      db,
    );

    const updated = await updateIncomeSource(
      created.id,
      { name: 'Neu', platform: 'Direkt', inWaterfall: false },
      db,
    );
    expect(updated.name).toBe('Neu');
    expect(updated.platform).toBe('Direkt');
    expect(updated.inWaterfall).toBe(false);

    await archiveIncomeSource(created.id, db);
    const archived = await db.incomeSources.get(created.id);
    expect(archived?.archivedAt).toBeDefined();

    await restoreIncomeSource(created.id, db);
    const restored = await db.incomeSources.get(created.id);
    expect(restored?.archivedAt).toBeUndefined();
  });

  it('summiert Monatsbuchungen exakt und trennt Wasserfall-Quellen korrekt', async () => {
    const db = await makeTestDb('month-sum');

    const shop = await createIncomeSource(
      { name: 'Shop', kind: 'project', projectId: 'proj-1', inWaterfall: true },
      db,
    );
    const surveys = await createIncomeSource(
      { name: 'Umfragen', kind: 'microtask', inWaterfall: true },
      db,
    );
    const privateSource = await createIncomeSource(
      { name: 'Geschenk', kind: 'other', inWaterfall: false },
      db,
    );

    await createIncomeEntry(
      { sourceId: shop.id, amount: 38000, receivedOn: '2026-11-10', hoursSpent: 10 },
      db,
    );
    await createIncomeEntry(
      { sourceId: surveys.id, amount: 24000, receivedOn: '2026-11-15', hoursSpent: 6 },
      db,
    );
    await createIncomeEntry(
      { sourceId: privateSource.id, amount: 5000, receivedOn: '2026-11-20' },
      db,
    );
    // Anderer Monat darf nicht in 2026-11 zählen
    await createIncomeEntry(
      { sourceId: shop.id, amount: 99900, receivedOn: '2026-10-28' },
      db,
    );

    const novEntries = await db.incomeEntries
      .where('month')
      .equals('2026-11')
      .toArray();
    const sources = await db.incomeSources.toArray();
    const summary = summarizeMonthIncome(novEntries, sources);

    expect(summary.totalCents).toBe(67000);
    expect(summary.waterfallCents).toBe(62000);
    expect(summary.nonWaterfallCents).toBe(5000);
    expect(summary.entryCount).toBe(3);
    expect(summary.hasExcludedSources).toBe(true);

    const wfInput = await loadWaterfallInput(db, '2026-11');
    const wfTotal = wfInput.incomes.reduce((acc, i) => acc + i.amount, 0);
    expect(wfTotal).toBe(62000);
  });

  it('berechnet Stundenlohn je Quelle aus Summe der Einnahmen und Stunden', async () => {
    const db = await makeTestDb('hourly-rate');

    const shop = await createIncomeSource(
      { name: 'Shop', kind: 'project', projectId: 'proj-1', inWaterfall: true },
      db,
    );
    const surveys = await createIncomeSource(
      { name: 'Umfragen', kind: 'microtask', inWaterfall: true },
      db,
    );

    await createIncomeEntry(
      { sourceId: shop.id, amount: 15000, receivedOn: '2026-11-05', hoursSpent: 2.5 },
      db,
    );
    await createIncomeEntry(
      { sourceId: shop.id, amount: 10000, receivedOn: '2026-11-12', hoursSpent: 1.5 },
      db,
    );
    await createIncomeEntry(
      { sourceId: surveys.id, amount: 2500, receivedOn: '2026-11-14' },
      db,
    );

    const entries = await db.incomeEntries.where('month').equals('2026-11').toArray();
    const sources = await db.incomeSources.toArray();
    const stats = computeSourceStats(entries, sources);

    expect(stats).toHaveLength(2);
    expect(stats[0].sourceName).toBe('Shop');
    expect(stats[0].totalCents).toBe(25000);
    expect(stats[0].totalHours).toBe(4);
    expect(stats[0].hourlyRateCents).toBe(6250); // 62,50 €/h

    expect(stats[1].sourceName).toBe('Umfragen');
    expect(stats[1].totalCents).toBe(2500);
    expect(stats[1].totalHours).toBe(0);
    expect(stats[1].hourlyRateCents).toBeNull();
  });

  it('löscht eine Buchung dauerhaft aus incomeEntries und aktualisiert Summen & Wasserfall', async () => {
    const db = await makeTestDb('delete-entry');

    const surveys = await createIncomeSource(
      { name: 'Umfragen', kind: 'microtask', inWaterfall: true },
      db,
    );

    const e1 = await createIncomeEntry(
      { sourceId: surveys.id, amount: 2500, receivedOn: '2026-12-02' },
      db,
    );
    const e2 = await createIncomeEntry(
      { sourceId: surveys.id, amount: 30000, receivedOn: '2026-12-05' },
      db,
    );

    expect(await db.incomeEntries.where('month').equals('2026-12').count()).toBe(2);

    await deleteIncomeEntry(e2.id, db);

    const remaining = await db.incomeEntries
      .where('month')
      .equals('2026-12')
      .toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(e1.id);

    const wfInput = await loadWaterfallInput(db, '2026-12');
    expect(wfInput.incomes).toEqual([{ id: e1.id, amount: 2500 }]);
  });

  it('validiert Eingaben und Hilfsfunktionen sauber', () => {
    expect(parseHoursInput('')).toEqual({ ok: true, value: undefined });
    expect(parseHoursInput('2,5')).toEqual({ ok: true, value: 2.5 });
    expect(parseHoursInput('2.5')).toEqual({ ok: true, value: 2.5 });
    expect(parseHoursInput('0').ok).toBe(false);
    expect(parseHoursInput('-1').ok).toBe(false);
    expect(parseHoursInput('abc').ok).toBe(false);

    expect(calculateHourlyRateCents(10000, 3)).toBe(3333);
    expect(calculateHourlyRateCents(10000, 0)).toBeNull();

    const refNow = new Date(2026, 10, 22); // 2026-11-22
    expect(defaultReceivedOnForMonth('2026-11', refNow)).toBe('2026-11-22');
    expect(defaultReceivedOnForMonth('2026-12', refNow)).toBe('2026-12-01');
    expect(defaultReceivedOnForMonth('2026-10', refNow)).toBe('2026-10-01');

    const sorted = sortEntriesNewestFirst([
      {
        id: 'a',
        sourceId: 's1',
        amount: 100,
        receivedOn: '2026-11-01',
        month: '2026-11',
        createdAt: '2026-11-01',
        updatedAt: '2026-11-01',
      },
      {
        id: 'b',
        sourceId: 's1',
        amount: 200,
        receivedOn: '2026-11-18',
        month: '2026-11',
        createdAt: '2026-11-18',
        updatedAt: '2026-11-18',
      },
    ]);
    expect(sorted.map((x) => x.id)).toEqual(['b', 'a']);
  });
});

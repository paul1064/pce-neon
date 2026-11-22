import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { EngineDB } from '../core';
import { clearAllData, exportAllData, importAllData } from './backup';

const base = { createdAt: '2026-11-22', updatedAt: '2026-11-22' };

describe('JSON-Export und -Import', () => {
  it('exportiert alle neun Tabellen, löscht und stellt denselben Stand wieder her', async () => {
    const db = new EngineDB('t-backup', 4);
    await db.open();

    await db.settings.put({
      id: 'settings',
      currency: 'EUR',
      debtStrategy: 'snowball',
      buffer: 5000,
      enabledModules: ['ideas', 'income', 'fixedCosts', 'debts'],
    });
    await db.ideas.add({
      ...base,
      id: 'idea-1',
      title: 'Testidee',
      description: 'Beschreibung',
      tags: ['test'],
      status: 'promoted',
      checks: [{ criterion: 'demand', rating: 4 }],
      score: 75,
      projectId: 'proj-1',
    });
    await db.projects.add({
      ...base,
      id: 'proj-1',
      name: 'Testidee',
      status: 'active',
      ideaId: 'idea-1',
      monthlyTarget: 50000,
    });
    await db.incomeSources.add({
      ...base,
      id: 'src-1',
      name: 'Shop',
      kind: 'project',
      projectId: 'proj-1',
      inWaterfall: true,
    });
    await db.incomeEntries.add({
      ...base,
      id: 'ent-1',
      sourceId: 'src-1',
      amount: 38000,
      receivedOn: '2026-11-22',
      month: '2026-11',
    });
    await db.fixedCosts.add({
      ...base,
      id: 'fc-1',
      name: 'Tool A',
      amount: 2000,
      cycle: 'monthly',
      dueDay: 1,
      priority: 1,
      category: 'tool',
      activeFrom: '2026-11',
    });
    await db.debts.add({
      ...base,
      id: 'debt-1',
      name: 'Schuld A',
      originalAmount: 30000,
      balance: 27500,
      aprBps: 0,
      minPayment: 2500,
      status: 'open',
    });
    await db.debtPayments.add({
      ...base,
      id: 'pay-1',
      debtId: 'debt-1',
      amount: 2500,
      paidOn: '2026-11-22',
      month: '2026-11',
      kind: 'minimum',
    });

    const exported = await exportAllData(db);
    const jsonString = JSON.stringify(exported);

    await clearAllData(db);
    expect(await db.ideas.count()).toBe(0);
    expect(await db.incomeEntries.count()).toBe(0);
    expect(await db.debts.count()).toBe(0);

    await importAllData(db, JSON.parse(jsonString));

    expect(await db.ideas.count()).toBe(1);
    expect((await db.ideas.get('idea-1'))?.title).toBe('Testidee');
    expect((await db.incomeEntries.get('ent-1'))?.amount).toBe(38000);
    expect((await db.fixedCosts.get('fc-1'))?.amount).toBe(2000);
    expect((await db.debts.get('debt-1'))?.balance).toBe(27500);
    expect((await db.debtPayments.get('pay-1'))?.amount).toBe(2500);
    expect((await db.settings.get('settings'))?.debtStrategy).toBe('snowball');

    db.close();
  });

  it('lehnt ungültiges Backup-JSON über Zod ab', async () => {
    const db = new EngineDB('t-backup-invalid', 4);
    await db.open();
    await expect(importAllData(db, { schemaVersion: 99, tables: {} })).rejects.toThrow();
    db.close();
  });
});

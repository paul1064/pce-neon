import {
  DEFAULT_SETTINGS,
  currentYearMonth,
  todayISO,
  type EngineDB,
  type YearMonth,
} from '../core';

/**
 * Lädt das Rechenbeispiel aus docs/ARCHITEKTUR.md als lokal gespeicherte
 * Beispieldaten für den gewählten Monat (620 € Einnahmen, 3 Abos, 3 Schulden).
 */
export async function loadDemoData(database: EngineDB, month: YearMonth): Promise<void> {
  const today = todayISO();
  const entryDate = month === currentYearMonth() ? today : `${month}-05`;
  const base = { createdAt: today, updatedAt: today };

  const ideaPromotedId = crypto.randomUUID();
  const ideaInboxId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const shopSourceId = crypto.randomUUID();
  const surveySourceId = crypto.randomUUID();

  await database.transaction('rw', database.tables, async () => {
    const existingSettings = await database.settings.get('settings');
    if (!existingSettings) {
      await database.settings.put(DEFAULT_SETTINGS);
    }

    await database.ideas.bulkAdd([
      {
        ...base,
        id: ideaPromotedId,
        title: 'Digitaler Shop',
        description: 'Kleine digitale Vorlagen ohne laufenden Support-Aufwand.',
        tags: ['digital', 'nebenprojekt'],
        status: 'promoted',
        checks: [
          { criterion: 'demand', rating: 4 },
          { criterion: 'effort', rating: 4 },
          { criterion: 'timeToFirstEuro', rating: 4 },
          { criterion: 'startupCost', rating: 4 },
          { criterion: 'energy', rating: 4 },
        ],
        score: 75,
        estimate: {
          setupHours: 12,
          monthlyRevenue: 40000,
          monthlyCost: 2000,
        },
        projectId,
      },
      {
        ...base,
        id: ideaInboxId,
        title: 'Mini-Workshop vor Ort',
        description: 'Kompakter 2-Stunden-Praxiskurs am Wochenende.',
        tags: ['workshop'],
        status: 'validating',
        checks: [
          { criterion: 'demand', rating: 4 },
          { criterion: 'energy', rating: 5 },
        ],
        score: 88,
      },
    ]);

    await database.projects.add({
      ...base,
      id: projectId,
      name: 'Digitaler Shop',
      status: 'active',
      ideaId: ideaPromotedId,
      monthlyTarget: 40000,
      nextStep: 'Zweite Vorlage veröffentlichen',
    });

    await database.incomeSources.bulkAdd([
      {
        ...base,
        id: shopSourceId,
        name: 'Shop',
        kind: 'project',
        projectId,
        platform: 'Eigener Shop',
        inWaterfall: true,
      },
      {
        ...base,
        id: surveySourceId,
        name: 'Umfragen',
        kind: 'microtask',
        platform: 'Online-Panel',
        inWaterfall: true,
      },
    ]);

    await database.incomeEntries.bulkAdd([
      {
        ...base,
        id: crypto.randomUUID(),
        sourceId: shopSourceId,
        amount: 38000,
        receivedOn: entryDate,
        month,
        hoursSpent: 6,
        note: 'Vorlagen-Verkäufe (Beispiel)',
      },
      {
        ...base,
        id: crypto.randomUUID(),
        sourceId: surveySourceId,
        amount: 24000,
        receivedOn: entryDate,
        month,
        hoursSpent: 8,
        note: 'Auszahlung Micro-Tasks (Beispiel)',
      },
    ]);

    await database.fixedCosts.bulkAdd([
      {
        ...base,
        id: crypto.randomUUID(),
        name: 'Hosting & Domain',
        amount: 2000,
        cycle: 'monthly',
        dueDay: 1,
        priority: 1,
        category: 'essential',
        activeFrom: month,
        projectId,
      },
      {
        ...base,
        id: crypto.randomUUID(),
        name: 'Design-Tool',
        amount: 1299,
        cycle: 'monthly',
        dueDay: 5,
        priority: 2,
        category: 'tool',
        activeFrom: month,
        projectId,
      },
      {
        ...base,
        id: crypto.randomUUID(),
        name: 'Streaming-Abo',
        amount: 999,
        cycle: 'monthly',
        dueDay: 15,
        priority: 3,
        category: 'comfort',
        activeFrom: month,
      },
    ]);

    await database.debts.bulkAdd([
      {
        ...base,
        id: crypto.randomUUID(),
        name: 'Privatdarlehen A',
        creditor: 'Familie',
        originalAmount: 30000,
        balance: 30000,
        aprBps: 0,
        minPayment: 2500,
        status: 'open',
      },
      {
        ...base,
        id: crypto.randomUUID(),
        name: 'Kreditkarte B',
        creditor: 'Hausbank',
        originalAmount: 180000,
        balance: 180000,
        aprBps: 1250,
        minPayment: 5000,
        status: 'open',
      },
      {
        ...base,
        id: crypto.randomUUID(),
        name: 'Ratenkauf C',
        creditor: 'Versandhandel',
        originalAmount: 95000,
        balance: 95000,
        aprBps: 600,
        minPayment: 3000,
        status: 'open',
      },
    ]);
  });
}

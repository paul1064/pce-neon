import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EngineDB,
  loadWaterfallInput,
  runWaterfall,
  type WaterfallInput,
} from '../../core';
import {
  DuplicateMonthCloseError,
  adjustDebtBalance,
  archiveDebt,
  bpsToInput,
  closeMonth,
  compareStrategies,
  confirmAllMonthClosePayments,
  confirmDebtPayment,
  createDebt,
  isDebtPaymentConfirmed,
  repaymentProgress,
  restoreDebt,
  strategyLabel,
  updateDebt,
} from './logic';

const baseTimestamps = { createdAt: '2026-12-01', updatedAt: '2026-12-01' };

async function seedReferenceScenario(testDb: EngineDB) {
  await testDb.incomeSources.bulkAdd([
    { ...baseTimestamps, id: 'src-shop', name: 'Shop', kind: 'project', inWaterfall: true },
    { ...baseTimestamps, id: 'src-micro', name: 'Umfragen', kind: 'microtask', inWaterfall: true },
  ]);
  await testDb.incomeEntries.bulkAdd([
    {
      ...baseTimestamps,
      id: 'inc-1',
      sourceId: 'src-shop',
      amount: 38000,
      receivedOn: '2026-12-05',
      month: '2026-12',
    },
    {
      ...baseTimestamps,
      id: 'inc-2',
      sourceId: 'src-micro',
      amount: 24000,
      receivedOn: '2026-12-10',
      month: '2026-12',
    },
  ]);
  await testDb.fixedCosts.bulkAdd([
    {
      ...baseTimestamps,
      id: 'fc-1',
      name: 'Tool A',
      amount: 2000,
      cycle: 'monthly',
      dueDay: 1,
      priority: 1,
      category: 'essential',
      activeFrom: '2026-01',
    },
    {
      ...baseTimestamps,
      id: 'fc-2',
      name: 'Tool B',
      amount: 1299,
      cycle: 'monthly',
      dueDay: 5,
      priority: 2,
      category: 'tool',
      activeFrom: '2026-01',
    },
    {
      ...baseTimestamps,
      id: 'fc-3',
      name: 'Streaming',
      amount: 999,
      cycle: 'monthly',
      dueDay: 10,
      priority: 3,
      category: 'comfort',
      activeFrom: '2026-01',
    },
  ]);

  const debtA = await createDebt(
    { name: 'A', originalAmount: 30000, aprBps: 0, minPayment: 2500 },
    testDb,
    '2026-12-01',
  );
  const debtB = await createDebt(
    { name: 'B', creditor: 'Bank B', originalAmount: 180000, aprBps: 1250, minPayment: 5000 },
    testDb,
    '2026-12-01',
  );
  const debtC = await createDebt(
    { name: 'C', originalAmount: 95000, aprBps: 600, minPayment: 3000 },
    testDb,
    '2026-12-01',
  );

  return { debtA, debtB, debtC };
}

describe('debts module logic & database operations', () => {
  let testDb: EngineDB;

  beforeEach(async () => {
    testDb = new EngineDB(`debts-test-${crypto.randomUUID()}`, 4);
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('legt Schulden mit Zod-Validierung an und setzt Anfangsstatus korrekt', async () => {
    const openDebt = await createDebt(
      { name: 'Kreditkarte', creditor: 'Hausbank', originalAmount: 150000, aprBps: 1250, minPayment: 5000 },
      testDb,
      '2026-12-01',
    );
    expect(openDebt.balance).toBe(150000);
    expect(openDebt.status).toBe('open');
    expect(openDebt.creditor).toBe('Hausbank');

    const zeroDebt = await createDebt(
      { name: 'Bereits bezahlt', originalAmount: 0, aprBps: 0, minPayment: 0 },
      testDb,
      '2026-12-01',
    );
    expect(zeroDebt.balance).toBe(0);
    expect(zeroDebt.status).toBe('paid');

    await expect(
      createDebt({ name: '   ', originalAmount: 1000, aprBps: 0, minPayment: 100 }, testDb),
    ).rejects.toThrow();

    await expect(
      createDebt({ name: 'Negativ', originalAmount: -500, aprBps: 0, minPayment: 100 }, testDb),
    ).rejects.toThrow();
  });

  it('bearbeitet, korrigiert Saldo manuell (inkl. Statuswechsel) und archiviert/stellt wieder her', async () => {
    const debt = await createDebt(
      { name: 'Dispo', creditor: 'Bank X', originalAmount: 50000, aprBps: 1100, minPayment: 2500 },
      testDb,
      '2026-12-01',
    );

    const edited = await updateDebt(
      debt.id,
      { name: 'Dispokredit', creditor: '', aprBps: 1250, minPayment: 3000 },
      testDb,
      '2026-12-02',
    );
    expect(edited.name).toBe('Dispokredit');
    expect(edited.creditor).toBeUndefined();
    expect(edited.aprBps).toBe(1250);
    expect(edited.minPayment).toBe(3000);

    // Zinsen laut Auszug hinzufügen
    const withInterest = await adjustDebtBalance(debt.id, 50520, testDb, '2026-12-03');
    expect(withInterest.balance).toBe(50520);
    expect(withInterest.status).toBe('open');

    // Manuell auf 0 setzen -> Status wechselt auf paid
    const settled = await adjustDebtBalance(debt.id, 0, testDb, '2026-12-04');
    expect(settled.balance).toBe(0);
    expect(settled.status).toBe('paid');

    // Wieder öffnen über Saldo > 0
    const reopened = await adjustDebtBalance(debt.id, 1200, testDb, '2026-12-05');
    expect(reopened.balance).toBe(1200);
    expect(reopened.status).toBe('open');

    // Negativer Saldo wird abgelehnt
    await expect(adjustDebtBalance(debt.id, -1, testDb)).rejects.toThrow();

    // Archivieren & Wiederherstellen
    await archiveDebt(debt.id, testDb, '2026-12-06');
    expect((await testDb.debts.get(debt.id))?.archivedAt).toBe('2026-12-06');

    await restoreDebt(debt.id, testDb, '2026-12-07');
    expect((await testDb.debts.get(debt.id))?.archivedAt).toBeUndefined();
  });

  it('berechnet Abnahme #7, #8 & #9 exakt (Schneeball, Lawine & Prognose-Vergleich)', async () => {
    const { debtA, debtB, debtC } = await seedReferenceScenario(testDb);
    const input = await loadWaterfallInput(testDb, '2026-12');

    // Abnahme #7: Schneeball
    const snowballPlan = runWaterfall({ ...input, strategy: 'snowball' });
    expect(snowballPlan.debtPayments).toEqual([
      { debtId: debtA.id, minimum: 2500, extra: 27500, balanceAfter: 0 },
      { debtId: debtC.id, minimum: 3000, extra: 19702, balanceAfter: 72298 },
      { debtId: debtB.id, minimum: 5000, extra: 0, balanceAfter: 175000 },
    ]);

    // Abnahme #8: Lawine
    const avalanchePlan = runWaterfall({ ...input, strategy: 'avalanche' });
    expect(avalanchePlan.debtPayments).toEqual([
      { debtId: debtB.id, minimum: 5000, extra: 47202, balanceAfter: 127798 },
      { debtId: debtC.id, minimum: 3000, extra: 0, balanceAfter: 92000 },
      { debtId: debtA.id, minimum: 2500, extra: 0, balanceAfter: 27500 },
    ]);

    // Abnahme #9: Prognose-Vergleich
    const comparison = compareStrategies(input);
    expect(comparison.snowball).toEqual({
      months: 6,
      debtFreeIn: '2027-05',
      interestPaid: 9027,
    });
    expect(comparison.avalanche).toEqual({
      months: 6,
      debtFreeIn: '2027-05',
      interestPaid: 6486,
    });
    expect(comparison.avalancheInterestSavings).toBe(2541);
  });

  it('Monatsabschluss verhindert doppelten Abschluss desselben Monats (Abnahme #11)', async () => {
    await seedReferenceScenario(testDb);
    const input = await loadWaterfallInput(testDb, '2026-12');
    const result = runWaterfall({ ...input, strategy: 'snowball' });

    const first = await closeMonth('2026-12', result, testDb, '2026-12-28');
    expect(first.month).toBe('2026-12');
    expect(first.result.totalToDebt).toBe(57702);

    await expect(closeMonth('2026-12', result, testDb, '2026-12-29')).rejects.toBeInstanceOf(
      DuplicateMonthCloseError,
    );
    await expect(closeMonth('2026-12', result, testDb, '2026-12-29')).rejects.toThrow(
      'Dieser Monat wurde bereits abgeschlossen.',
    );

    // Ein anderer Monat darf abgeschlossen werden
    const nextInput = await loadWaterfallInput(testDb, '2027-01');
    const nextClose = await closeMonth('2027-01', runWaterfall(nextInput), testDb, '2027-01-28');
    expect(nextClose.month).toBe('2027-01');
  });

  it('bestätigt Schneeball-Zahlungen atomar, aktualisiert Salden exakt (Abnahme #10) und ist idempotent', async () => {
    const { debtA, debtB, debtC } = await seedReferenceScenario(testDb);
    const input = await loadWaterfallInput(testDb, '2026-12');
    const snowballResult = runWaterfall({ ...input, strategy: 'snowball' });

    const close = await closeMonth('2026-12', snowballResult, testDb, '2026-12-28');

    // Einzeln bestätigen für Schuld A
    const resA = await confirmDebtPayment(close.id, debtA.id, testDb, '2026-12-29');
    expect(resA.alreadyConfirmed).toBe(false);
    expect(resA.created).toHaveLength(2);
    expect(resA.created.map((p) => [p.kind, p.amount])).toEqual([
      ['minimum', 2500],
      ['extra', 27500],
    ]);
    expect(resA.debt?.balance).toBe(0);
    expect(resA.debt?.status).toBe('paid');

    // Idempotenz: erneutes Bestätigen für A ändert nichts
    const resA2 = await confirmDebtPayment(close.id, debtA.id, testDb, '2026-12-29');
    expect(resA2.alreadyConfirmed).toBe(true);
    expect(resA2.created).toHaveLength(0);

    // Restliche Zahlungen (C und B) gesammelt bestätigen
    const allRes = await confirmAllMonthClosePayments(close.id, testDb, '2026-12-29');
    expect(allRes.confirmedCount).toBe(2); // nur C und B waren noch offen
    expect(allRes.paymentsCreated).toHaveLength(3); // C: minimum + extra, B: minimum

    // Abnahme #10: exakte Restsalden & Status prüfen
    const finalA = await testDb.debts.get(debtA.id);
    const finalB = await testDb.debts.get(debtB.id);
    const finalC = await testDb.debts.get(debtC.id);

    expect(finalA?.balance).toBe(0);
    expect(finalA?.status).toBe('paid');
    expect(finalC?.balance).toBe(72298);
    expect(finalC?.status).toBe('open');
    expect(finalB?.balance).toBe(175000);
    expect(finalB?.status).toBe('open');

    const payments = await testDb.debtPayments.where('month').equals('2026-12').toArray();
    expect(payments).toHaveLength(5);
    expect(isDebtPaymentConfirmed(debtA.id, close.id, payments)).toBe(true);
    expect(isDebtPaymentConfirmed(debtB.id, close.id, payments)).toBe(true);
    expect(isDebtPaymentConfirmed(debtC.id, close.id, payments)).toBe(true);

    // Erneutes confirmAllMonthClosePayments ist vollständig idempotent
    const allResAgain = await confirmAllMonthClosePayments(close.id, testDb, '2026-12-30');
    expect(allResAgain.confirmedCount).toBe(0);
    expect(allResAgain.paymentsCreated).toHaveLength(0);
    expect((await testDb.debts.get(debtC.id))?.balance).toBe(72298);
    expect((await testDb.debts.get(debtB.id))?.balance).toBe(175000);
  });

  it('liefert bei Unterdeckung keine Prognose und weist Lücken aus (Abnahme #12)', () => {
    const underfunded: WaterfallInput = {
      month: '2027-01',
      incomes: [{ id: 'i1', amount: 2500 }],
      fixedCosts: [
        { id: 'f1', monthlyAmount: 2000, priority: 1 },
        { id: 'f2', monthlyAmount: 1299, priority: 2 },
        { id: 'f3', monthlyAmount: 999, priority: 3 },
      ],
      debts: [{ id: 'd1', balance: 50000, aprBps: 600, minPayment: 3000 }],
      strategy: 'snowball',
      buffer: 0,
    };

    const result = runWaterfall(underfunded);
    expect(result.fixedCostGap).toBe(1798);
    expect(result.totalToDebt).toBe(0);

    const comparison = compareStrategies(underfunded);
    expect(comparison.snowball).toBeNull();
    expect(comparison.avalanche).toBeNull();
    expect(comparison.avalancheInterestSavings).toBeNull();
  });

  it('Hilfsfunktionen für Fortschritt, Zinssatz-Input und Labels arbeiten korrekt', () => {
    expect(repaymentProgress({ originalAmount: 10000, balance: 2500 })).toEqual({
      paid: 7500,
      percent: 75,
    });
    expect(repaymentProgress({ originalAmount: 10000, balance: 12000 })).toEqual({
      paid: 0,
      percent: 0,
    });
    expect(repaymentProgress({ originalAmount: 0, balance: 0 })).toEqual({
      paid: 0,
      percent: 100,
    });
    expect(bpsToInput(1250)).toBe('12,5');
    expect(bpsToInput(0)).toBe('0');
    expect(strategyLabel('snowball')).toBe('Schneeball');
    expect(strategyLabel('avalanche')).toBe('Lawine');
  });
});

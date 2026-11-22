import { z } from 'zod';
import {
  db,
  simulatePayoff,
  todayISO,
  type Cents,
  type Debt,
  type DebtPayment,
  type DebtStrategy,
  type EngineDB,
  type ID,
  type ISODate,
  type MonthClose,
  type WaterfallInput,
  type WaterfallResult,
  type YearMonth,
} from '../../core';

export const createDebtSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Bitte einen Namen für die Schuld angeben.')
    .max(100, 'Der Name darf höchstens 100 Zeichen lang sein.'),
  creditor: z
    .string()
    .trim()
    .max(100, 'Der Gläubiger darf höchstens 100 Zeichen lang sein.')
    .optional(),
  originalAmount: z
    .number()
    .int('Der Betrag muss in ganzen Cent vorliegen.')
    .min(0, 'Der Betrag darf nicht negativ sein.'),
  aprBps: z
    .number()
    .int('Der Zinssatz muss in ganzen Basispunkten vorliegen.')
    .min(0, 'Der Zinssatz darf nicht negativ sein.')
    .max(100000, 'Der Zinssatz darf höchstens 1.000 % betragen.'),
  minPayment: z
    .number()
    .int('Die Mindestrate muss in ganzen Cent vorliegen.')
    .min(0, 'Die Mindestrate darf nicht negativ sein.'),
});

export const updateDebtSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Bitte einen Namen für die Schuld angeben.')
    .max(100, 'Der Name darf höchstens 100 Zeichen lang sein.'),
  creditor: z
    .string()
    .trim()
    .max(100, 'Der Gläubiger darf höchstens 100 Zeichen lang sein.')
    .optional(),
  aprBps: z
    .number()
    .int('Der Zinssatz muss in ganzen Basispunkten vorliegen.')
    .min(0, 'Der Zinssatz darf nicht negativ sein.')
    .max(100000, 'Der Zinssatz darf höchstens 1.000 % betragen.'),
  minPayment: z
    .number()
    .int('Die Mindestrate muss in ganzen Cent vorliegen.')
    .min(0, 'Die Mindestrate darf nicht negativ sein.'),
});

export const adjustBalanceSchema = z.object({
  balance: z
    .number()
    .int('Der Saldo muss in ganzen Cent vorliegen.')
    .min(0, 'Der Saldo darf nicht negativ sein.'),
});

export const yearMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Ungültiges Monatsformat (erwartet YYYY-MM).');

export type CreateDebtInput = z.infer<typeof createDebtSchema>;
export type UpdateDebtInput = z.infer<typeof updateDebtSchema>;

export interface PayoffProjection {
  months: number;
  debtFreeIn: YearMonth;
  interestPaid: Cents;
}

export interface StrategyComparison {
  snowball: PayoffProjection | null;
  avalanche: PayoffProjection | null;
  /** Positive Zahl = Lawine spart Zinsen gegenüber Schneeball. */
  avalancheInterestSavings: Cents | null;
}

export interface ConfirmPaymentResult {
  created: DebtPayment[];
  debt: Debt | undefined;
  alreadyConfirmed: boolean;
}

export class DuplicateMonthCloseError extends Error {
  readonly month: YearMonth;

  constructor(month: YearMonth) {
    super('Dieser Monat wurde bereits abgeschlossen.');
    this.name = 'DuplicateMonthCloseError';
    this.month = month;
  }
}

export function isDuplicateMonthCloseError(error: unknown): boolean {
  if (error instanceof DuplicateMonthCloseError) return true;
  if (error instanceof Error && error.name === 'ConstraintError') return true;
  return false;
}

export function strategyLabel(strategy: DebtStrategy): string {
  return strategy === 'snowball' ? 'Schneeball' : 'Lawine';
}

export function bpsToInput(bps: number): string {
  return (bps / 100).toString().replace('.', ',');
}

export function repaymentProgress(debt: Pick<Debt, 'originalAmount' | 'balance'>): {
  paid: Cents;
  percent: number;
} {
  const paid = Math.max(0, debt.originalAmount - debt.balance);
  if (debt.originalAmount <= 0) {
    return { paid: 0, percent: debt.balance === 0 ? 100 : 0 };
  }
  const percent = Math.min(100, Math.max(0, Math.round((paid / debt.originalAmount) * 100)));
  return { paid, percent };
}

export function getPlannedPayments(
  result: WaterfallResult,
): WaterfallResult['debtPayments'] {
  return result.debtPayments.filter((p) => p.minimum + p.extra > 0);
}

export function isDebtPaymentConfirmed(
  debtId: ID,
  monthCloseId: ID,
  payments: Pick<DebtPayment, 'debtId' | 'monthCloseId'>[],
): boolean {
  return payments.some((p) => p.monthCloseId === monthCloseId && p.debtId === debtId);
}

export function compareStrategies(input: WaterfallInput): StrategyComparison {
  const openDebts = input.debts.filter((d) => d.balance > 0);
  if (openDebts.length === 0) {
    return {
      snowball: null,
      avalanche: null,
      avalancheInterestSavings: null,
    };
  }
  const normalized: WaterfallInput = { ...input, debts: openDebts };
  const snowball = simulatePayoff({ ...normalized, strategy: 'snowball' });
  const avalanche = simulatePayoff({ ...normalized, strategy: 'avalanche' });
  const avalancheInterestSavings =
    snowball && avalanche ? snowball.interestPaid - avalanche.interestPaid : null;
  return { snowball, avalanche, avalancheInterestSavings };
}

export async function createDebt(
  input: CreateDebtInput,
  database: EngineDB = db,
  now: ISODate = todayISO(),
): Promise<Debt> {
  const parsed = createDebtSchema.parse(input);
  const creditor = parsed.creditor ? parsed.creditor : undefined;
  const debt: Debt = {
    id: crypto.randomUUID(),
    name: parsed.name,
    ...(creditor ? { creditor } : {}),
    originalAmount: parsed.originalAmount,
    balance: parsed.originalAmount,
    aprBps: parsed.aprBps,
    minPayment: parsed.minPayment,
    status: parsed.originalAmount === 0 ? 'paid' : 'open',
    createdAt: now,
    updatedAt: now,
  };
  await database.debts.add(debt);
  return debt;
}

export async function updateDebt(
  id: ID,
  input: UpdateDebtInput,
  database: EngineDB = db,
  now: ISODate = todayISO(),
): Promise<Debt> {
  const parsed = updateDebtSchema.parse(input);
  const existing = await database.debts.get(id);
  if (!existing) {
    throw new Error('Schuld wurde nicht gefunden.');
  }
  const creditor = parsed.creditor ? parsed.creditor : undefined;
  const updated: Debt = {
    ...existing,
    name: parsed.name,
    aprBps: parsed.aprBps,
    minPayment: parsed.minPayment,
    updatedAt: now,
  };
  if (creditor) {
    updated.creditor = creditor;
  } else {
    delete updated.creditor;
  }
  await database.debts.put(updated);
  return updated;
}

export async function adjustDebtBalance(
  id: ID,
  balance: Cents,
  database: EngineDB = db,
  now: ISODate = todayISO(),
): Promise<Debt> {
  const parsed = adjustBalanceSchema.parse({ balance });
  const existing = await database.debts.get(id);
  if (!existing) {
    throw new Error('Schuld wurde nicht gefunden.');
  }
  const updated: Debt = {
    ...existing,
    balance: parsed.balance,
    status: parsed.balance === 0 ? 'paid' : 'open',
    updatedAt: now,
  };
  await database.debts.put(updated);
  return updated;
}

export async function archiveDebt(
  id: ID,
  database: EngineDB = db,
  now: ISODate = todayISO(),
): Promise<void> {
  const existing = await database.debts.get(id);
  if (!existing) return;
  await database.debts.put({
    ...existing,
    archivedAt: now,
    updatedAt: now,
  });
}

export async function restoreDebt(
  id: ID,
  database: EngineDB = db,
  now: ISODate = todayISO(),
): Promise<void> {
  const existing = await database.debts.get(id);
  if (!existing) return;
  const restored: Debt = {
    ...existing,
    updatedAt: now,
  };
  delete restored.archivedAt;
  await database.debts.put(restored);
}

export async function closeMonth(
  month: YearMonth,
  result: WaterfallResult,
  database: EngineDB = db,
  now: ISODate = todayISO(),
): Promise<MonthClose> {
  const validMonth = yearMonthSchema.parse(month);
  const record: MonthClose = {
    id: crypto.randomUUID(),
    month: validMonth,
    result: {
      ...result,
      month: validMonth,
    },
    createdAt: now,
    updatedAt: now,
  };
  try {
    await database.monthCloses.add(record);
    return record;
  } catch (error: unknown) {
    if (isDuplicateMonthCloseError(error)) {
      throw new DuplicateMonthCloseError(validMonth);
    }
    throw error;
  }
}

export async function confirmDebtPayment(
  monthCloseId: ID,
  debtId: ID,
  database: EngineDB = db,
  paidOn: ISODate = todayISO(),
): Promise<ConfirmPaymentResult> {
  const close = await database.monthCloses.get(monthCloseId);
  if (!close) {
    throw new Error('Monatsabschluss wurde nicht gefunden.');
  }
  const planned = close.result.debtPayments.find((p) => p.debtId === debtId);
  if (!planned || planned.minimum + planned.extra <= 0) {
    const debt = await database.debts.get(debtId);
    return { created: [], debt, alreadyConfirmed: false };
  }

  return database.transaction('rw', [database.debts, database.debtPayments], async () => {
    const existingPayments = await database.debtPayments
      .where('month')
      .equals(close.month)
      .filter((p) => p.monthCloseId === close.id && p.debtId === debtId)
      .toArray();

    if (existingPayments.length > 0) {
      const debt = await database.debts.get(debtId);
      return { created: [], debt, alreadyConfirmed: true };
    }

    const debt = await database.debts.get(debtId);
    if (!debt) {
      throw new Error('Schuld wurde nicht gefunden.');
    }

    const created: DebtPayment[] = [];
    if (planned.minimum > 0) {
      created.push({
        id: crypto.randomUUID(),
        debtId,
        amount: planned.minimum,
        paidOn,
        month: close.month,
        kind: 'minimum',
        monthCloseId: close.id,
        createdAt: paidOn,
        updatedAt: paidOn,
      });
    }
    if (planned.extra > 0) {
      created.push({
        id: crypto.randomUUID(),
        debtId,
        amount: planned.extra,
        paidOn,
        month: close.month,
        kind: 'extra',
        monthCloseId: close.id,
        createdAt: paidOn,
        updatedAt: paidOn,
      });
    }

    if (created.length > 0) {
      await database.debtPayments.bulkAdd(created);
    }

    const totalPaid = planned.minimum + planned.extra;
    const nextBalance = Math.max(0, debt.balance - totalPaid);
    const updatedDebt: Debt = {
      ...debt,
      balance: nextBalance,
      status: nextBalance === 0 ? 'paid' : 'open',
      updatedAt: paidOn,
    };
    await database.debts.put(updatedDebt);

    return { created, debt: updatedDebt, alreadyConfirmed: false };
  });
}

export async function confirmAllMonthClosePayments(
  monthCloseId: ID,
  database: EngineDB = db,
  paidOn: ISODate = todayISO(),
): Promise<{ confirmedCount: number; paymentsCreated: DebtPayment[] }> {
  const close = await database.monthCloses.get(monthCloseId);
  if (!close) {
    throw new Error('Monatsabschluss wurde nicht gefunden.');
  }
  const plannedList = getPlannedPayments(close.result);
  if (plannedList.length === 0) {
    return { confirmedCount: 0, paymentsCreated: [] };
  }

  return database.transaction('rw', [database.debts, database.debtPayments], async () => {
    const existingForMonth = await database.debtPayments
      .where('month')
      .equals(close.month)
      .filter((p) => p.monthCloseId === close.id)
      .toArray();
    const alreadyConfirmedDebtIds = new Set(existingForMonth.map((p) => p.debtId));

    let confirmedCount = 0;
    const paymentsCreated: DebtPayment[] = [];

    for (const planned of plannedList) {
      if (alreadyConfirmedDebtIds.has(planned.debtId)) {
        continue;
      }
      const debt = await database.debts.get(planned.debtId);
      if (!debt) {
        continue;
      }

      const toAdd: DebtPayment[] = [];
      if (planned.minimum > 0) {
        toAdd.push({
          id: crypto.randomUUID(),
          debtId: planned.debtId,
          amount: planned.minimum,
          paidOn,
          month: close.month,
          kind: 'minimum',
          monthCloseId: close.id,
          createdAt: paidOn,
          updatedAt: paidOn,
        });
      }
      if (planned.extra > 0) {
        toAdd.push({
          id: crypto.randomUUID(),
          debtId: planned.debtId,
          amount: planned.extra,
          paidOn,
          month: close.month,
          kind: 'extra',
          monthCloseId: close.id,
          createdAt: paidOn,
          updatedAt: paidOn,
        });
      }

      if (toAdd.length > 0) {
        await database.debtPayments.bulkAdd(toAdd);
        paymentsCreated.push(...toAdd);
      }

      const totalPaid = planned.minimum + planned.extra;
      const nextBalance = Math.max(0, debt.balance - totalPaid);
      await database.debts.put({
        ...debt,
        balance: nextBalance,
        status: nextBalance === 0 ? 'paid' : 'open',
        updatedAt: paidOn,
      });
      alreadyConfirmedDebtIds.add(planned.debtId);
      confirmedCount += 1;
    }

    return { confirmedCount, paymentsCreated };
  });
}

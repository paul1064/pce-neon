import { createContext, useContext } from 'react';
import type { YearMonth } from './model';

export interface MonthContextValue {
  month: YearMonth;
  setMonth: (month: YearMonth) => void;
}

export const MonthContext = createContext<MonthContextValue | null>(null);

export function useMonth(): MonthContextValue {
  const ctx = useContext(MonthContext);
  if (!ctx) {
    throw new Error('useMonth muss innerhalb von MonthProvider verwendet werden.');
  }
  return ctx;
}

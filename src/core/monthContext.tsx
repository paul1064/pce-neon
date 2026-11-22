import { useMemo, useState, type ReactNode } from 'react';
import type { YearMonth } from './model';
import { currentYearMonth } from './date';
import { MonthContext } from './monthState';

export function MonthProvider({ children }: { children: ReactNode }) {
  const [month, setMonth] = useState<YearMonth>(() => currentYearMonth());
  const value = useMemo(() => ({ month, setMonth }), [month]);
  return <MonthContext.Provider value={value}>{children}</MonthContext.Provider>;
}

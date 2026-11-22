import { useLiveQuery } from 'dexie-react-hooks';
import { loadWaterfallInput } from './db';
import { db } from './database';
import type { YearMonth } from './model';
import { runWaterfall, type WaterfallInput, type WaterfallResult } from './waterfall';

export interface WaterfallState {
  input: WaterfallInput;
  result: WaterfallResult;
}

/**
 * Lädt die Wasserfall-Eingaben reaktiv über loadWaterfallInput und berechnet
 * das Live-Ergebnis für den angegebenen Monat.
 */
export function useWaterfall(month: YearMonth): WaterfallState | undefined {
  return useLiveQuery(async () => {
    const input = await loadWaterfallInput(db, month);
    const result = runWaterfall(input);
    return { input, result };
  }, [month]);
}
